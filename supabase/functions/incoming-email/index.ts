// Public webhook for inbound email (Resend / Mailgun / SendGrid compatible payload).
// Looks for [TKT-XXXX] in subject -> appends message; otherwise creates a new ticket
// for the sender's company (matched by email).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const payload = await req.json().catch(() => ({}));

    // Normalize fields across providers
    const fromEmail: string =
      payload.from?.email ?? payload.sender ?? payload.from ?? "";
    const fromName: string = payload.from?.name ?? "";
    const subject: string = payload.subject ?? "";
    const body: string = payload.text ?? payload.body ?? payload.html ?? "";
    const messageId: string | undefined = payload.message_id ?? payload["Message-Id"];

    if (!fromEmail || !subject) {
      return new Response(JSON.stringify({ error: "Missing from/subject" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Match [TKT-YYYY-####]
    const ticketMatch = subject.match(/\[?(TKT-\d{4}-\d{4,})\]?/i);

    if (ticketMatch) {
      const ticketNumber = ticketMatch[1].toUpperCase();
      const { data: ticket } = await supabase
        .from("tickets")
        .select("id")
        .eq("ticket_number", ticketNumber)
        .maybeSingle();

      if (ticket) {
        // Try to find a sender_id by email lookup in company_members
        const { data: member } = await supabase
          .from("company_members")
          .select("user_id")
          .eq("email", fromEmail.toLowerCase())
          .maybeSingle();

        await supabase.from("ticket_messages").insert({
          ticket_id: ticket.id,
          sender_id: member?.user_id ?? null,
          sender_email: fromEmail,
          sender_name: fromName || fromEmail,
          message: body,
          email_message_id: messageId,
        });

        return new Response(
          JSON.stringify({ success: true, action: "appended", ticket_id: ticket.id }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // No matching ticket — create a new one. Find sender's company.
    const { data: member } = await supabase
      .from("company_members")
      .select("user_id, company_id")
      .eq("email", fromEmail.toLowerCase())
      .maybeSingle();

    if (!member) {
      return new Response(
        JSON.stringify({ error: "Sender email not associated with any company" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: newTicket, error: ticketErr } = await supabase
      .from("tickets")
      .insert({
        company_id: member.company_id,
        created_by: member.user_id,
        subject,
        description: body,
      })
      .select("id, ticket_number")
      .single();

    if (ticketErr || !newTicket) {
      return new Response(
        JSON.stringify({ error: ticketErr?.message ?? "Failed to create ticket" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await supabase.from("ticket_messages").insert({
      ticket_id: newTicket.id,
      sender_id: member.user_id,
      sender_email: fromEmail,
      sender_name: fromName || fromEmail,
      message: body,
      email_message_id: messageId,
    });

    return new Response(
      JSON.stringify({
        success: true,
        action: "created",
        ticket_id: newTicket.id,
        ticket_number: newTicket.ticket_number,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("incoming-email error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
