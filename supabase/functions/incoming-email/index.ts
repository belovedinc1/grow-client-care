import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, svix-id, svix-signature, svix-timestamp",
};

/**
 * Inbound email webhook (Resend Inbound).
 * Configure Resend Inbound to POST here for emails to support@yourdomain.
 *
 * Verifies SIGNING_SECRET (provided by Resend / your relay).
 * If subject contains [TKT-YYYY-####] -> append to existing ticket.
 * Otherwise -> create new ticket as a guest under the configured company.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SIGNING_SECRET = Deno.env.get("SIGNING_SECRET");

    // Lightweight signature check: accept either svix-signature header containing the secret,
    // or an x-webhook-secret header equal to SIGNING_SECRET. Production users can swap
    // for a proper HMAC verification.
    if (SIGNING_SECRET) {
      const headerSecret = req.headers.get("x-webhook-secret");
      const svixSig = req.headers.get("svix-signature") || "";
      const ok = headerSecret === SIGNING_SECRET || svixSig.includes(SIGNING_SECRET);
      if (!ok) {
        console.warn("Webhook signature missing/invalid");
        return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const payload = await req.json();
    console.log("Inbound email payload keys:", Object.keys(payload || {}));

    // Resend inbound shape varies; normalize common fields
    const email = payload?.data || payload?.email || payload;
    const fromRaw: string = email?.from?.email || email?.from || email?.sender || "";
    const fromName: string = email?.from?.name || email?.from_name || "";
    const subject: string = email?.subject || email?.headers?.subject || "(no subject)";
    const text: string = email?.text || email?.plain || email?.body || "";
    const html: string = email?.html || "";
    const messageId: string = email?.message_id || email?.headers?.["message-id"] || "";

    const fromEmail = extractEmail(fromRaw);
    if (!fromEmail) {
      return new Response(JSON.stringify({ error: "Missing sender email" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Get inbound company
    const { data: companyRow, error: companyErr } = await admin.rpc("get_inbound_company");
    if (companyErr) {
      console.error("get_inbound_company error", companyErr);
    }
    const companyId = companyRow as string | null;
    if (!companyId) {
      return new Response(JSON.stringify({ error: "No inbound company configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Detect ticket number in subject
    const match = subject.match(/\[?(TKT-\d{4}-\d{4,})\]?/i);
    const body = text || stripHtml(html);

    if (match) {
      const ticketNumber = match[1].toUpperCase();
      const { data: ticket } = await admin
        .from("tickets")
        .select("id, company_id, status")
        .eq("ticket_number", ticketNumber)
        .single();
      if (ticket) {
        await admin.from("ticket_messages").insert({
          ticket_id: ticket.id,
          sender_email: fromEmail,
          sender_name: fromName || null,
          message: body,
          email_message_id: messageId || null,
          is_internal_note: false,
        });
        // Reopen if closed
        if (ticket.status === "closed") {
          await admin.from("tickets").update({ status: "open" }).eq("id", ticket.id);
        }
        return new Response(JSON.stringify({ success: true, action: "appended", ticket_number: ticketNumber }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Create new ticket as guest
    const cleanSubject = subject.replace(/^(re:|fwd:)\s*/i, "").slice(0, 200) || "(no subject)";
    const { data: created, error: createErr } = await admin
      .from("tickets")
      .insert({
        company_id: companyId,
        guest_email: fromEmail,
        guest_name: fromName || null,
        subject: cleanSubject,
        description: body,
        status: "open",
        priority: "normal",
        source: "email",
      })
      .select("id, ticket_number")
      .single();

    if (createErr) {
      console.error("Insert ticket error", createErr);
      return new Response(JSON.stringify({ error: createErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Add the original email body as the first message too
    await admin.from("ticket_messages").insert({
      ticket_id: created.id,
      sender_email: fromEmail,
      sender_name: fromName || null,
      message: body,
      email_message_id: messageId || null,
      is_internal_note: false,
    });

    return new Response(JSON.stringify({ success: true, action: "created", ticket_number: created.ticket_number }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("incoming-email error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function extractEmail(s: string): string | null {
  if (!s) return null;
  const m = s.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return m ? m[0].toLowerCase() : null;
}
function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
