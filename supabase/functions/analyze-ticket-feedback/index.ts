import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: uErr } = await userClient.auth.getUser();
    if (uErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { ticket_id } = await req.json();
    if (!ticket_id) {
      return new Response(JSON.stringify({ error: "ticket_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: rating, error: rErr } = await admin
      .from("ticket_ratings")
      .select("*, tickets(subject, description, company_id)")
      .eq("ticket_id", ticket_id)
      .single();

    if (rErr || !rating) {
      return new Response(JSON.stringify({ error: "Rating not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Verify staff
    const { data: roleData } = await admin
      .from("company_members")
      .select("role")
      .eq("company_id", rating.company_id)
      .eq("user_id", userData.user.id)
      .single();
    if (!roleData || (roleData.role !== "admin" && roleData.role !== "agent")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const ticket = (rating as any).tickets;
    const userPrompt = `Analyze this customer support feedback.

Ticket subject: ${ticket?.subject || "(unknown)"}
Ticket description: ${ticket?.description || "(none)"}
Customer rating: ${rating.rating}
Customer feedback: ${rating.feedback || "(none provided)"}

Return your analysis using the provided tool.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a customer support analytics assistant. Be concise and actionable." },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "submit_analysis",
            description: "Submit structured analysis of customer feedback",
            parameters: {
              type: "object",
              properties: {
                sentiment: { type: "string", enum: ["very_negative", "negative", "neutral", "positive", "very_positive"] },
                quality: { type: "string", enum: ["poor", "below_average", "acceptable", "good", "excellent"] },
                urgency: { type: "string", enum: ["low", "medium", "high", "critical"] },
                themes: { type: "array", items: { type: "string" }, description: "Key topics or issues mentioned (max 4)" },
                summary: { type: "string", description: "One-sentence summary with recommended action" },
              },
              required: ["sentiment", "quality", "urgency", "themes", "summary"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "submit_analysis" } },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "AI rate limit reached. Try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Top up in Lovable workspace." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "AI error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await aiResp.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "AI did not return analysis" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const analysis = JSON.parse(toolCall.function.arguments);

    const { error: updErr } = await admin
      .from("ticket_ratings")
      .update({ ai_analysis: analysis, ai_analyzed_at: new Date().toISOString() })
      .eq("id", rating.id);

    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, analysis, summary: analysis.summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-ticket-feedback error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
