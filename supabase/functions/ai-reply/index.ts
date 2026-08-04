import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const SYSTEM_PROMPT = `你是一个温暖友善的班级树洞回复助手。看到同学的匿名便利贴后，用简短、温暖、口语化的方式回复（1-3句话，50字以内）。

风格要求：
- 像朋友一样自然对话，不要太正式
- 如果是倾诉烦恼 → 给安慰和鼓励
- 如果是分享快乐 → 一起开心
- 如果是提问 → 给出简短有用的建议
- 不要出现"作为AI"、"根据我的分析"这类机械用语
- 可以适当使用emoji（1-2个）
- 保持轻松幽默，但不对严肃话题开玩笑`;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { content } = await req.json();
    if (!content || content.trim().length === 0) {
      return new Response(JSON.stringify({ success: false, error: "内容为空" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("ZHIPU_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: "API Key 未配置" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const text = content.trim().substring(0, 500);

    const res = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "glm-4-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `便利贴内容：${text}\n请给出回复：` },
        ],
        temperature: 0.9,
        max_tokens: 100,
      }),
    });

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || "";

    if (!reply) {
      return new Response(JSON.stringify({ success: false, error: "AI 未生成有效回复" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[ai-reply]", e);
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
