import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

const BodySchema = z.object({
  email: z.string().email().max(255),
  role: z.enum(["admin", "agent", "client"]),
  company_id: z.string().uuid(),
  app_url: z.string().url().max(500),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
      Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { email, role, company_id, app_url } = parsed.data;

    // Check caller is admin of company
    const { data: roleCheck } = await supabase.rpc("has_company_role", {
      _user_id: userData.user.id,
      _company_id: company_id,
      _role: "admin",
    });
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert invite (RLS-protected, but caller is admin so it's fine)
    const { data: invite, error: insErr } = await supabase
      .from("invites")
      .insert({
        company_id,
        email: email.toLowerCase(),
        role,
        invited_by: userData.user.id,
      })
      .select("token, id")
      .single();

    if (insErr || !invite) {
      return new Response(
        JSON.stringify({ error: insErr?.message ?? "Failed to create invite" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get company name for the email
    const { data: company } = await supabase
      .from("companies")
      .select("name")
      .eq("id", company_id)
      .single();

    const joinUrl = `${app_url.replace(/\/$/, "")}/join?token=${invite.token}`;

    // Send email via Resend gateway (only if keys available)
    if (LOVABLE_API_KEY && RESEND_API_KEY) {
      const html = `
        <div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;padding:24px;">
          <h2 style="margin:0 0 12px;">You're invited to ${company?.name ?? "a workspace"}</h2>
          <p>You've been invited to join <strong>${company?.name ?? "a workspace"}</strong> as a <strong>${role}</strong>.</p>
          <p style="margin:24px 0;">
            <a href="${joinUrl}" style="background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;">Accept invite</a>
          </p>
          <p style="color:#666;font-size:13px;">Or paste this link: <br/><a href="${joinUrl}">${joinUrl}</a></p>
          <p style="color:#999;font-size:12px;margin-top:24px;">This invite expires in 7 days.</p>
        </div>
      `;

      const emailRes = await fetch(`${GATEWAY_URL}/emails`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": RESEND_API_KEY,
        },
        body: JSON.stringify({
          from: "Invites <onboarding@resend.dev>",
          to: [email],
          subject: `You're invited to ${company?.name ?? "a workspace"}`,
          html,
        }),
      });

      const emailJson = await emailRes.json();
      if (!emailRes.ok) {
        console.error("Resend error", emailRes.status, emailJson);
        // Don't fail the request — invite is in DB, admin can copy link
        return new Response(
          JSON.stringify({
            success: true,
            invite_id: invite.id,
            join_url: joinUrl,
            email_sent: false,
            email_error: emailJson,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        invite_id: invite.id,
        join_url: joinUrl,
        email_sent: !!(LOVABLE_API_KEY && RESEND_API_KEY),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-invite error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
