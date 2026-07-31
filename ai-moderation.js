/**
 * AI 内容安全审核模块
 * 独立文件 — 加载失败不影响其他功能，但审核未通过会拦截提交
 *
 * 用法：<script src="ai-moderation.js"></script>
 * 调用：window.AIModeration.check(content).then(r => { r.safe, r.reason })
 */
(function () {
  'use strict';

  var MODERATION_URL = 'https://zmujidvqkihthhdbwuvw.supabase.co/functions/v1/ai-moderation';
  var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptdWppZHZxa2lodGhoZGJ3dXZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjIxMDAsImV4cCI6MjA5MzAzODEwMH0.iWKqqpebMc3l3wjEBsP4X0QH1WwjtIovcJAEsDPr3kE';
  var AI_TIMEOUT = 8000;

  // ── 本地关键词黑名单（秒级拦截，不消耗 AI 调用）──────
  var BLACKLIST = [
    // 脏话/国骂
    'sb', '傻逼', '傻b', '煞笔', '尼玛', '你妈', '草泥马', '操你', '我操', '我草', '卧槽' ,
    'tmd', '他妈' , 'cnm', 'cao', 'fuck', 'shit',
    // 人身攻击
    '去死', '废物', '垃圾人', '脑残', '智障', '弱智', '白痴',
    // 色情
    '裸照', '约炮', '小姐', '上门服务',
    // 广告
    '加微信', '加我微信', '加我qq', '扫码', '日赚', '兼职赚钱',
    // 违法
    '毒品', '吸毒', '买枪',
  ];

  function localCheck(text) {
    var lower = text.toLowerCase();
    for (var i = 0; i < BLACKLIST.length; i++) {
      if (lower.indexOf(BLACKLIST[i]) !== -1) {
        return { safe: false, reason: '包含敏感词', local: true };
      }
    }
    return null;
  }

  // ── 审核弹窗 ──────────────────────────────────────────
  function showOverlay() {
    var el = document.getElementById('ai-moderation-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ai-moderation-overlay';
      el.innerHTML =
        '<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:transparent;z-index:2000;display:flex;align-items:center;justify-content:center;">' +
          '<div style="background:var(--card-bg,white);backdrop-filter:blur(20px);border-radius:20px;padding:28px 36px;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,0.15);">' +
            '<div style="width:40px;height:40px;border:3px solid var(--divider,#eee);border-top-color:var(--accent,#C67B5C);border-radius:50%;animation:ai-spin 0.8s linear infinite;margin:0 auto 16px;"></div>' +
            '<p style="color:var(--text,#333);font-size:15px;font-weight:500;margin:0;">AI 内容审核中…</p>' +
            '<p style="color:var(--text-muted,#999);font-size:12px;margin:6px 0 0;">正在检测内容是否合规</p>' +
          '</div>' +
        '</div>';
      document.body.appendChild(el);
      // 注入旋转动画
      if (!document.getElementById('ai-spin-style')) {
        var style = document.createElement('style');
        style.id = 'ai-spin-style';
        style.textContent = '@keyframes ai-spin{to{transform:rotate(360deg)}}';
        document.head.appendChild(style);
      }
    }
    el.style.display = 'block';
  }

  function hideOverlay() {
    var el = document.getElementById('ai-moderation-overlay');
    if (el) el.style.display = 'none';
  }

  // ── 审核入口 ──────────────────────────────────────────
  async function check(content) {
    if (!content || content.trim().length === 0) {
      return { safe: true };
    }

    var text = content.trim().substring(0, 2000);

    // 第一步：本地黑名单秒级拦截
    var localResult = localCheck(text);
    if (localResult) return localResult;

    // 第二步：AI 深度审核
    showOverlay();

    try {
      var controller = new AbortController();
      var timeoutId = setTimeout(function () { controller.abort(); }, AI_TIMEOUT);

      var resp = await fetch(MODERATION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + ANON_KEY
        },
        body: JSON.stringify({ content: text }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      hideOverlay();

      if (!resp.ok) {
        // AI 服务异常 → 拦截，提示稍后重试
        return { safe: false, reason: '审核服务异常，请稍后重试' };
      }

      var data = await resp.json();
      return { safe: data.safe !== false, reason: data.reason };
    } catch (e) {
      hideOverlay();
      if (e.name === 'AbortError') {
        return { safe: false, reason: '审核超时，请稍后重试' };
      }
      // 网络错误 → 拦截
      return { safe: false, reason: '审核服务不可用，请稍后重试' };
    }
  }

  // 挂载到全局
  window.AIModeration = { check: check };
  console.log('[ai-moderation] 模块已就绪（本地黑名单 + AI 深度审核）');
})();
