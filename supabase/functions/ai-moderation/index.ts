import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const SYSTEM_PROMPT = `你是严格的内容安全审核助手。检查用户提交的文本是否包含以下违规内容：

【审核规则】
1. 辱骂/人身攻击/歧视/地域黑/性别歧视 → 违规
2. 色情/低俗/性暗示/擦边内容 → 违规
3. 暴力/恐怖/违法/毒品相关内容 → 违规
4. 广告/推广/引流/加群/带联系方式 → 违规
5. 政治敏感/分裂言论/攻击国家 → 违规
6. 自伤/自杀倾向 → 违规

【输出格式】严格只输出一行：
PASS
或
REJECT:原因（15字以内，中文）
或
WARN:原因（用于自伤倾向等）

不要输出其他任何内容。`;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { content } = await req.json();
    if (!content || content.trim().length === 0) {
      return new Response(JSON.stringify({ safe: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("ZHIPU_API_KEY");
    if (!apiKey) {
      console.error("[ai-moderation] ZHIPU_API_KEY 未配置");
      return new Response(JSON.stringify({
        safe: false,
        reason: "审核服务未配置，请联系管理员",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const text = content.trim().substring(0, 2000); // 最多审核前2000字

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
          { role: "user", content: text },
        ],
        temperature: 0,
        max_tokens: 50,
      }),
    });

    const data = await res.json();
    const result = data.choices?.[0]?.message?.content?.trim() || "";

    if (result.startsWith("PASS")) {
      return new Response(JSON.stringify({ safe: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else if (result.startsWith("REJECT:")) {
      return new Response(JSON.stringify({
        safe: false,
        reason: result.substring(7).trim(),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else if (result.startsWith("WARN:")) {
      return new Response(JSON.stringify({
        safe: false,
        reason: result.substring(5).trim(),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 无法识别的输出 → 拦截（宁可误杀，不可漏放）
    console.warn("[ai-moderation] 无法识别的 AI 输出:", result);
    return new Response(JSON.stringify({
      safe: false,
      reason: "审核异常，请稍后重试",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    // 任何错误都拦截，不阻塞用户但要求重试
    console.error("[ai-moderation]", e);
    return new Response(JSON.stringify({
      safe: false,
      reason: "审核服务繁忙，请稍后重试",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
