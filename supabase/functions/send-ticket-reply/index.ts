import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured (Resend connector)");

    // Validate user
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { ticket_id, message } = await req.json();
    if (!ticket_id || !message) {
      return new Response(JSON.stringify({ error: "ticket_id and message required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Load ticket
    const { data: ticket, error: tErr } = await admin
      .from("tickets")
      .select("id, ticket_number, subject, company_id, created_by, guest_email, guest_name")
      .eq("id", ticket_id)
      .single();
    if (tErr || !ticket) {
      return new Response(JSON.stringify({ error: "Ticket not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Verify staff role
    const { data: roleData } = await admin
      .from("company_members")
      .select("role")
      .eq("company_id", ticket.company_id)
      .eq("user_id", userData.user.id)
      .single();

    if (!roleData || (roleData.role !== "admin" && roleData.role !== "agent")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Determine recipient
    let toEmail = ticket.guest_email;
    let toName = ticket.guest_name;
    if (!toEmail && ticket.created_by) {
      const { data: creator } = await admin
        .from("company_members")
        .select("email, full_name")
        .eq("user_id", ticket.created_by)
        .eq("company_id", ticket.company_id)
        .single();
      toEmail = creator?.email || null;
      toName = creator?.full_name || null;
    }

    if (!toEmail) {
      return new Response(JSON.stringify({ error: "No recipient email on ticket" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const subject = `Re: [${ticket.ticket_number}] ${ticket.subject}`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px;">
        <p>Hi ${toName || "there"},</p>
        <div style="white-space: pre-wrap; padding: 16px; background: #f7f7f7; border-radius: 8px; margin: 16px 0;">${escapeHtml(message)}</div>
        <p style="color: #666; font-size: 13px;">Reply to this email to add to ticket <strong>${ticket.ticket_number}</strong>.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px;">Beloved Studio Support</p>
      </div>
    `;

    const resendResp = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify({
        from: "Beloved Studio Support <support@belovedstudio.in>",
        to: [toEmail],
        subject,
        html,
        reply_to: "belovedstudioinc@gmail.com",
      }),
    });

    const resendData = await resendResp.json();
    if (!resendResp.ok) {
      console.error("Resend error", resendResp.status, resendData);
      return new Response(JSON.stringify({ error: "Email send failed", detail: resendData }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, message_id: resendData.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-ticket-reply error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
