// ═══════════════════════════════════════════════════════════
// Cloudflare Worker — WHUT CAS SSO 代理
// 部署: cd workers/whut-sso && wrangler deploy
// ═══════════════════════════════════════════════════════════

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ── BigInt / RSA helpers ──────────────────────────────────

function bigIntFromBase64url(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  let result = 0n;
  for (let i = 0; i < bin.length; i++) {
    result = (result << 8n) | BigInt(bin.charCodeAt(i));
  }
  return result;
}

function bytesToBigInt(bytes) {
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    result = (result << 8n) | BigInt(bytes[i]);
  }
  return result;
}

function bigIntToBytes(n, length) {
  const bytes = new Uint8Array(length);
  for (let i = length - 1; i >= 0; i--) {
    bytes[i] = Number(n & 0xFFn);
    n >>= 8n;
  }
  return bytes;
}

function modPow(base, exp, mod) {
  let result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

// ── RSA PKCS#1 v1.5 encrypt ───────────────────────────────

function rsaEncryptRaw(plaintext, n, e, keyLen) {
  const data = new TextEncoder().encode(plaintext);
  if (data.length > keyLen - 11) throw new Error("数据过长");
  const padded = new Uint8Array(keyLen);
  padded[0] = 0x00;
  padded[1] = 0x02;
  const psLen = keyLen - data.length - 3;
  const ps = new Uint8Array(psLen);
  crypto.getRandomValues(ps);
  for (let i = 0; i < psLen; i++) {
    while (ps[i] === 0) { const tmp = new Uint8Array(1); crypto.getRandomValues(tmp); ps[i] = tmp[0]; }
    padded[2 + i] = ps[i];
  }
  padded[2 + psLen] = 0x00;
  padded.set(data, 3 + psLen);
  const m = bytesToBigInt(padded);
  const c = modPow(m, e, n);
  return btoa(String.fromCharCode(...bigIntToBytes(c, keyLen)));
}

// ── Cookie helpers ────────────────────────────────────────

function parseAndMergeCookies(currentJar, newSetCookies) {
  const cookieMap = {};
  if (currentJar) {
    currentJar.split(";").forEach(pair => {
      const eq = pair.indexOf("=");
      if (eq > 0) cookieMap[pair.substring(0, eq).trim()] = pair.substring(eq + 1).trim();
    });
  }
  if (newSetCookies && newSetCookies.length) {
    newSetCookies.forEach(c => {
      const part = c.split(";")[0];
      const eq = part.indexOf("=");
      if (eq > 0) cookieMap[part.substring(0, eq).trim()] = part.substring(eq + 1).trim();
    });
  }
  return Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join("; ");
}

// ── Retry helper ──────────────────────────────────────────

async function retryAsync(fn, maxRetries = 3, delayMs = 1500, label = "") {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try { return await fn(attempt); } catch (e) {
      lastErr = e;
      if (attempt < maxRetries) {
        console.log(`[SSO] ${label} 重试 ${attempt + 1}: ${e.message}`);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
}

// ── Constants ─────────────────────────────────────────────

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)";
const FETCH_TIMEOUT = 15000;
const LT_REGEX = /name=["']?lt["']?\s+value=["']?([^"']+)["']?/i;
const EXECUTION_REGEX = /name=["']?execution["']?\s+value=["']?([^"']+)["']?/i;
const EVENT_ID_REGEX = /name=["']?_eventId["']?\s+value=["']?([^"']+)["']?/i;
const ERROR_REGEX = /<div id="msg".*?>(.*?)<\/div>/s;
const SMS_ERROR_REGEX = /id="errormsg"[^>]*>([\s\S]*?)<\/span>/i;
const CAS_BASE = "https://zhlgd.whut.edu.cn/tpass";
const CAS_LOGIN = `${CAS_BASE}/login`;

// ── CAS redirect chain → user info ────────────────────────

async function followCasAndFetchUser(successResp, cookieStr) {
  const allSetCookies = [];
  // Cloudflare Workers: getSetCookie() returns array directly
  const sc = successResp.headers.getSetCookie ? successResp.headers.getSetCookie() :
             (successResp.headers.get("set-cookie") ? [successResp.headers.get("set-cookie")] : []);
  if (sc && sc.length) allSetCookies.push(...sc);

  const authCookieJar = parseAndMergeCookies(cookieStr, allSetCookies);

  const yktServiceUrl = "https://yktapp.whut.edu.cn/berserker-auth/cas/login/neusoftCas?targetUrl=https%3A%2F%2Fyktapp.whut.edu.cn%2Fplat-pc";
  const tpassCasUrl = `https://zhlgd.whut.edu.cn/tpass/login?service=${encodeURIComponent(yktServiceUrl)}`;

  let token = "";
  try {
    let currentUrl = tpassCasUrl;
    let yktCookieJar = authCookieJar;

    for (let i = 0; i < 10 && !token; i++) {
      const resp = await fetch(currentUrl, {
        method: "GET",
        headers: { "User-Agent": UA, Cookie: yktCookieJar },
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });

      const newCookies = [];
      if (resp.headers.getSetCookie) {
        newCookies.push(...resp.headers.getSetCookie());
      } else {
        const scHdr = resp.headers.get("set-cookie");
        if (scHdr) newCookies.push(scHdr);
      }
      if (newCookies.length) {
        yktCookieJar = parseAndMergeCookies(yktCookieJar, newCookies);
        for (const c of newCookies) {
          if (c.toLowerCase().includes("synjones-auth=")) {
            token = c.split(/synjones-auth=/i)[1].split(";")[0];
          }
        }
      }
      if (token) break;

      const loc = resp.headers.get("location");
      if (loc) {
        try {
          const u = new URL(loc.startsWith("/") ? `https://${new URL(currentUrl).host}${loc}` : loc);
          token = u.searchParams.get("token") || u.searchParams.get("synjones-auth") || "";
        } catch {}
      }
      if (token) break;

      if (resp.status === 302 || resp.status === 301 || resp.status === 307) {
        if (resp.body) await resp.body.cancel();
        if (!loc) break;
        currentUrl = loc.startsWith("/") ? `https://${new URL(currentUrl).host}${loc}` : loc;
        continue;
      }

      const bodyText = await resp.text();
      const tokenMatch = bodyText.match(/synjones-auth[=:]\s*["']?bearer\s+([^"'\s;]+)/i) ||
                         bodyText.match(/token[=:]\s*["']?([A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)/i);
      if (tokenMatch) token = tokenMatch[1];
      break;
    }
    if (!token) throw new Error("未获取到token");
  } catch (e) {
    return { success: false, error: `CAS重定向失败: ${e.message}` };
  }

  if (token) {
    for (let retry = 0; retry < 3; retry++) {
      try {
        const resp = await fetch("https://yktapp.whut.edu.cn/berserker-base/user?synAccessSource=pc", {
          method: "GET",
          headers: { "User-Agent": UA, synaccesssource: "pc", "synjones-auth": `bearer ${token}` },
          signal: AbortSignal.timeout(15000),
        });
        if (resp.status === 200) {
          const data = await resp.json();
          if (data?.data) {
            const finalSno = data.data.sno || data.data.account;
            if (finalSno) return { success: true, nickname: data.data.name, cardId: data.data.cardAccount, sno: finalSno };
          }
        }
      } catch (e) {
        console.log(`[SSO] 用户信息获取重试 ${retry + 1}: ${e.message}`);
      }
    }
  }
  return { success: false, error: "未能获取用户信息" };
}

// ── refrescaptcha ─────────────────────────────────────────

async function refreshCaptcha(initialCookies) {
  try {
    let cookieStr = initialCookies;
    if (!initialCookies) {
      const initResp = await retryAsync(
        () => fetch(CAS_LOGIN, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }, signal: AbortSignal.timeout(FETCH_TIMEOUT) }),
        3, 1500, "验证码页初始化"
      );
      const all = initResp.headers.getSetCookie?.() ?? [];
      const sc = initResp.headers.get("set-cookie");
      cookieStr = all.length ? all.map(c => c.split(";")[0]).join("; ") : (sc?.split(";")[0] ?? "");
    }

    const resp = await retryAsync(
      () => fetch(`${CAS_BASE}/code`, { headers: { "User-Agent": UA, Cookie: cookieStr, Referer: CAS_LOGIN }, signal: AbortSignal.timeout(FETCH_TIMEOUT) }),
      3, 1500, "验证码获取"
    );
    const buf = await resp.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    return { success: true, captchaImage: `data:image/jpeg;base64,${b64}`, cookies: cookieStr };
  } catch (e) {
    return { success: false, error: "获取验证码失败: " + e.message };
  }
}

// ── verifyWHUTCredentials ─────────────────────────────────

async function verifyWHUTCredentials(username, password, captchaCode = "", initialCookies = "") {
  const headers = { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" };

  try {
    let cookieStr = initialCookies;
    let html = "";
    let lt = "", execution = "e1s1", eventId = "submit";

    // Step 1: get login page
    if (!initialCookies) {
      const r = await retryAsync(async () => {
        const resp = await fetch(CAS_LOGIN, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT) });
        const all = resp.headers.getSetCookie?.() ?? [];
        const sc = resp.headers.get("set-cookie");
        const cookies = all.length ? all.map(c => c.split(";")[0]).join("; ") : (sc?.split(";")[0] ?? "");
        const text = await resp.text();
        return { cookies, html: text };
      }, 3, 1500, "登录页获取");
      cookieStr = r.cookies; html = r.html;
    } else {
      html = await retryAsync(async () => {
        const resp = await fetch(CAS_LOGIN, { headers: { ...headers, Cookie: cookieStr }, signal: AbortSignal.timeout(FETCH_TIMEOUT) });
        return resp.text();
      }, 3, 1500, "登录页获取");
    }

    const ltMatch = html.match(LT_REGEX);
    if (!ltMatch) throw new Error("无法获取LT");
    lt = ltMatch[1];
    execution = (html.match(EXECUTION_REGEX) || [])[1] || "e1s1";
    eventId = (html.match(EVENT_ID_REGEX) || [])[1] || "submit";

    // Step 2: check captcha
    const cleanHtml = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "");
    const needsCaptcha = cleanHtml.includes('id="codeImage"') || cleanHtml.includes("/tpass/code");
    if (needsCaptcha && !captchaCode) {
      try {
        const capResp = await fetch(`${CAS_BASE}/code`, { headers: { "User-Agent": UA, Cookie: cookieStr, Referer: CAS_LOGIN }, signal: AbortSignal.timeout(FETCH_TIMEOUT) });
        const buf = await capResp.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        return { success: false, captchaRequired: true, captchaImage: `data:image/jpeg;base64,${b64}`, cookies: cookieStr, error: "请输入验证码" };
      } catch (e) {}
    }

    // Step 3: get RSA key
    const rsaJson = await retryAsync(async () => {
      const resp = await fetch(`${CAS_BASE}/rsa?skipWechat=true`, { method: "POST", headers: { "User-Agent": UA, Cookie: cookieStr, Referer: CAS_LOGIN }, signal: AbortSignal.timeout(FETCH_TIMEOUT) });
      return resp.json();
    }, 3, 1500, "RSA公钥");
    if (!rsaJson.publicKey) throw new Error("获取公钥失败");

    // Step 4: import key, extract n/e
    const base64Key = rsaJson.publicKey.replace(/-----BEGIN PUBLIC KEY-----/g, "").replace(/-----END PUBLIC KEY-----/g, "").replace(/\s/g, "");
    const binaryStr = atob(base64Key);
    const keyBytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) keyBytes[i] = binaryStr.charCodeAt(i);
    const cryptoKey = await crypto.subtle.importKey("spki", keyBytes.buffer, { name: "RSA-OAEP", hash: "SHA-1" }, true, ["encrypt"]);
    const jwk = await crypto.subtle.exportKey("jwk", cryptoKey);
    const n = bigIntFromBase64url(jwk.n);
    const e = bigIntFromBase64url(jwk.e);
    const modulusLen = atob(jwk.n.replace(/-/g, "+").replace(/_/g, "/")).length;

    // Step 5: RSA encrypt
    const ul = rsaEncryptRaw(username, n, e, modulusLen);
    const pl = rsaEncryptRaw(password, n, e, modulusLen);

    // Step 6: submit login
    const formBody = `un=&pd=&ul=${encodeURIComponent(ul)}&pl=${encodeURIComponent(pl)}&lt=${encodeURIComponent(lt)}&execution=${encodeURIComponent(execution)}&_eventId=${encodeURIComponent(eventId)}&code=${encodeURIComponent(captchaCode || "")}`;

    const loginResp = await retryAsync(() =>
      fetch(CAS_LOGIN, {
        method: "POST",
        headers: { "User-Agent": UA, Cookie: cookieStr, Referer: CAS_LOGIN, "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody,
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      }), 3, 1500, "登录请求");

    // Step 7: handle result
    if (loginResp.status === 302 || loginResp.status === 307) {
      try { return await followCasAndFetchUser(loginResp, cookieStr); }
      catch (err) { return { success: false, error: "一卡通系统异常: " + err.message }; }
    }

    const failureHtml = await loginResp.text();
    let errorDetail = (failureHtml.match(ERROR_REGEX) || [])[1]?.trim() || null;
    if (!errorDetail && failureHtml.includes("验证码有误")) errorDetail = "验证码有误";
    if (!errorDetail && failureHtml.includes('name="lt"')) errorDetail = "用户名或密码错误";

    // SMS check
    if (!errorDetail) {
      const hasSms = (failureHtml.includes("smsCode") && failureHtml.includes("<input")) ||
                     (failureHtml.includes("phoneCode") && failureHtml.includes("<input")) ||
                     failureHtml.includes('name="PM1"');
      if (hasSms) {
        const smsErr = (failureHtml.match(SMS_ERROR_REGEX) || [])[1]?.trim() || "需要短信验证";
        return { success: false, smsRequired: true, cookies: cookieStr, html: failureHtml, error: smsErr.replace(/推荐您使用企业微信.*$/, "").trim() };
      }
    }

    const result = { success: false, error: errorDetail || "SSO 登录失败" };
    if (failureHtml.includes('id="codeImage"') || failureHtml.includes("/tpass/code")) {
      result.captchaRequired = true; result.cookies = cookieStr;
      try {
        const capResp = await fetch(`${CAS_BASE}/code`, { headers: { "User-Agent": UA, Cookie: cookieStr, Referer: CAS_LOGIN }, signal: AbortSignal.timeout(FETCH_TIMEOUT) });
        const buf = await capResp.arrayBuffer();
        result.captchaImage = `data:image/jpeg;base64,${btoa(String.fromCharCode(...new Uint8Array(buf)))}`;
      } catch (e) {}
    }
    return result;
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── verifySms ─────────────────────────────────────────────

async function verifySsoSmsCode(smsCode, initialCookies, smsHtml) {
  try {
    let html = smsHtml;
    if (!html) {
      html = await retryAsync(async () => {
        const resp = await fetch(CAS_LOGIN, { headers: { "User-Agent": UA, Cookie: initialCookies, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }, signal: AbortSignal.timeout(FETCH_TIMEOUT) });
        return resp.text();
      }, 3, 1500, "短信验证页");
    }

    let formAction = CAS_LOGIN;
    const formMatch = html.match(/<form[^>]*>/i);
    if (formMatch) {
      const am = formMatch[0].match(/action=["']([^"']+)["']/i);
      if (am) formAction = am[1].startsWith("/") ? `https://zhlgd.whut.edu.cn${am[1]}` : am[1];
    }

    const hiddenFields = {};
    const hiddenRegex = /<input[^>]+type=["']hidden["'][^>]*>/gi;
    let hm;
    while ((hm = hiddenRegex.exec(html)) !== null) {
      const nm = hm[0].match(/name=["']([^"']+)["']/i);
      const vm = hm[0].match(/value=["']([^"']*)["']/i);
      if (nm) hiddenFields[nm[1]] = vm ? vm[1] : "";
    }

    const parts = [`PM1=${encodeURIComponent(smsCode)}`];
    for (const [k, v] of Object.entries(hiddenFields)) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    parts.push("_eventId=submit");

    const smsResp = await retryAsync(() =>
      fetch(formAction, {
        method: "POST",
        headers: { "User-Agent": UA, Cookie: initialCookies, Referer: CAS_LOGIN, "Content-Type": "application/x-www-form-urlencoded" },
        body: parts.join("&"),
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      }), 3, 1500, "短信提交");

    const newCookies = [];
    if (smsResp.headers.getSetCookie) newCookies.push(...smsResp.headers.getSetCookie());
    else { const sc = smsResp.headers.get("set-cookie"); if (sc) newCookies.push(sc); }
    const updatedCookies = newCookies.length ? parseAndMergeCookies(initialCookies, newCookies) : initialCookies;

    if (smsResp.status === 302 || smsResp.status === 307) {
      try { return await followCasAndFetchUser(smsResp, updatedCookies); }
      catch (err) { return { success: false, error: "获取用户信息失败: " + err.message }; }
    }

    const resultHtml = await smsResp.text();
    const smsErr = (resultHtml.match(SMS_ERROR_REGEX) || [])[1]?.trim() || null;
    if (resultHtml.includes('name="PM1"') || (resultHtml.includes("短信验证码") && resultHtml.includes("<input"))) {
      const rc = [];
      if (smsResp.headers.getSetCookie) rc.push(...smsResp.headers.getSetCookie());
      else { const sc2 = smsResp.headers.get("set-cookie"); if (sc2) rc.push(sc2); }
      return { success: false, smsRequired: true, cookies: rc.length ? parseAndMergeCookies(updatedCookies, rc) : updatedCookies, html: resultHtml, error: (smsErr || "验证码错误").replace(/推荐您使用企业微信.*$/, "").trim() };
    }
    return { success: false, error: (smsErr || "短信验证失败").replace(/推荐您使用企业微信.*$/, "").trim() };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Main handler ──────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);

    try {
      if (request.method === "POST") {
        const body = await request.json();
        const { action } = body;

        // ── login ──────────────────────────────────────
        if (action === "login") {
          const { studentId, password, captcha, cookies } = body;
          if (!studentId || !password) {
            return new Response(JSON.stringify({ success: false, error: "学号和密码不能为空" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
          }
          const result = await verifyWHUTCredentials(studentId, password, captcha || "", cookies || "");
          return new Response(JSON.stringify(result), {
            status: result.success ? 200 : 403,
            headers: { ...CORS, "Content-Type": "application/json" },
          });
        }

        // ── refresh-captcha ────────────────────────────
        if (action === "refresh-captcha") {
          const result = await refreshCaptcha(body.cookies || "");
          return new Response(JSON.stringify(result), {
            status: result.success ? 200 : 500,
            headers: { ...CORS, "Content-Type": "application/json" },
          });
        }

        // ── sms-verify ─────────────────────────────────
        if (action === "sms-verify") {
          const { smsCode, cookies, html } = body;
          if (!smsCode || !cookies) {
            return new Response(JSON.stringify({ success: false, error: "缺少参数" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
          }
          const result = await verifySsoSmsCode(smsCode, cookies, html || "");
          return new Response(JSON.stringify(result), {
            status: result.success ? 200 : 403,
            headers: { ...CORS, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ success: false, error: `未知操作: ${action}` }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
      }

      // GET: health check
      return new Response(JSON.stringify({ status: "ok", desc: "WHUT CAS SSO Proxy" }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
    } catch (e) {
      console.error("[whut-sso]", e);
      return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }
  }
};
