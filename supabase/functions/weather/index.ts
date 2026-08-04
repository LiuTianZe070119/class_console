import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const API_KEY = "Slbz3LVb9_KAx2l-C";
const BASE = "https://api.seniverse.com/v3/weather/";
const LIFE_URL = "https://api.seniverse.com/v3/life/suggestion.json";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("type") || "now";
    const loc = url.searchParams.get("location") || "ip";

    let apiUrl: string;
    if (type === "daily") {
      apiUrl = `${BASE}daily.json?key=${API_KEY}&location=${loc}&language=zh-Hans&unit=c&start=0&days=3`;
    } else if (type === "life") {
      apiUrl = `${LIFE_URL}?key=${API_KEY}&location=${loc}&language=zh-Hans`;
    } else {
      apiUrl = `${BASE}now.json?key=${API_KEY}&location=${loc}&language=zh-Hans&unit=c`;
    }

    const res = await fetch(apiUrl);
    const data = await res.text();

    return new Response(data, {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
