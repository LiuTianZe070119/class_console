/**
 * 智慧理工大统一认证 (SSO) 模块
 * 独立文件 — 加载失败不影响其他功能
 *
 * 用法：在 index.html 底部添加 <script src="sso.js"></script>
 * 前提：页面需已有 supabaseClient、SUPABASE_URL、toast() 全局函数
 */

(function () {
  'use strict';

  // ── 配置 ──────────────────────────────────────────────
  var SSO_FUNCTION_URL = 'https://whut-sso.liutianze20070119.workers.dev';

  // ── 等待依赖就绪 ──────────────────────────────────────
  function waitFor(fn, max, cb) {
    var n = 0;
    var t = setInterval(function () {
      n++;
      if (fn()) { clearInterval(t); cb(); }
      else if (n >= max) { clearInterval(t); console.warn('[sso] 依赖超时，SSO 不可用'); }
    }, 100);
  }

  // ── 注入 CSS ──────────────────────────────────────────
  function injectCSS() {
    if (document.getElementById('sso-styles')) return;
    var style = document.createElement('style');
    style.id = 'sso-styles';
    style.textContent =
      '.sso-btn{background:linear-gradient(135deg,#1a5c8a,#1e6fa8)!important;color:#fff!important;font-size:14px!important;padding:12px 24px!important;margin-top:8px;box-shadow:0 4px 16px rgba(26,92,138,0.2)!important}' +
      '.sso-btn:hover{background:linear-gradient(135deg,#1e6fa8,#2580c0)!important;box-shadow:0 8px 24px rgba(26,92,138,0.3)!important}' +
      '.sso-divider{display:flex;align-items:center;gap:10px;margin:10px 0 6px;color:var(--text-light,#A09080);font-size:12px}' +
      '.sso-divider::before,.sso-divider::after{content:"";flex:1;height:1px;background:var(--divider,rgba(139,115,85,0.08))}' +
      '.sso-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.45);z-index:1000;display:none;align-items:center;justify-content:center;backdrop-filter:blur(4px)}' +
      '.sso-overlay.open{display:flex}' +
      '.sso-dialog{background:var(--card-bg,rgba(255,255,255,0.7));backdrop-filter:blur(24px);width:420px;max-width:94vw;max-height:90vh;overflow-y:auto;padding:32px 28px;border-radius:24px;border:1px solid var(--card-border,rgba(255,255,255,0.5));box-shadow:0 20px 60px var(--shadow-lg,rgba(61,35,20,0.12));position:relative}' +
      '.sso-dialog h2{text-align:center;color:var(--text,#3D2314);font-size:22px;margin:0 0 4px}' +
      '.sso-subtitle{text-align:center;color:var(--text-muted,#8B7355);font-size:13px;margin-bottom:20px}' +
      '.sso-brand-row{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:6px}' +
      '.sso-brand-icon{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#1a5c8a,#1e6fa8);display:flex;align-items:center;justify-content:center;color:#fff}' +
      '.sso-warning{background:rgba(200,120,50,0.08);border:1px solid rgba(200,120,50,0.2);border-radius:10px;padding:10px 14px;font-size:12px;color:#b86a30;margin-bottom:16px;display:none;align-items:flex-start;gap:8px}' +
      '.sso-warning.show{display:flex}' +
      '.sso-captcha-row{display:flex;gap:10px;align-items:center}' +
      '.sso-captcha-row img{height:42px;border-radius:8px;cursor:pointer;border:1px solid var(--input-border,#E0D0C0)}' +
      '.sso-hint{text-align:center;font-size:12px;color:var(--text-light,#A09080);margin-top:12px}' +
      '.sso-close-btn{position:absolute;top:12px;right:14px;background:none;border:none;color:var(--text-muted,#8B7355);cursor:pointer;font-size:18px;padding:4px 8px;border-radius:50%}' +
      '.sso-close-btn:hover{background:var(--accent-light,rgba(198,123,92,0.1))}';
    document.head.appendChild(style);
  }

  // ── 注入 HTML ──────────────────────────────────────────
  function createUI() {
    if (document.getElementById('ssoLoginBtn')) return;

    // SSO 按钮 — 插在登录按钮后面
    var loginBtn = document.getElementById('loginBtn');
    if (!loginBtn) return;

    var divider = document.createElement('div');
    divider.className = 'sso-divider';
    divider.innerHTML = '<span>或</span>';
    loginBtn.parentNode.insertBefore(divider, loginBtn.nextSibling);

    var ssoBtn = document.createElement('button');
    ssoBtn.className = 'btn sso-btn';
    ssoBtn.id = 'ssoLoginBtn';
    ssoBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;vertical-align:middle;"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 1.1 2.7 2 6 2s6-.9 6-2v-5"/></svg> 智慧理工大统一认证';
    divider.parentNode.insertBefore(ssoBtn, divider.nextSibling);

    // SSO 弹窗
    var overlay = document.createElement('div');
    overlay.className = 'sso-overlay';
    overlay.id = 'ssoOverlay';
    overlay.innerHTML =
      '<div class="sso-dialog">' +
        '<button class="sso-close-btn" id="ssoCloseBtn">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
        '<div class="sso-brand-row">' +
          '<div class="sso-brand-icon">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 1.1 2.7 2 6 2s6-.9 6-2v-5"/></svg>' +
          '</div>' +
          '<h2>智慧理工大统一认证</h2>' +
        '</div>' +
        '<p class="sso-subtitle">武汉理工大学 · 统一身份认证 (SSO)</p>' +
        '<div class="sso-warning" id="ssoWarning">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
          '<span id="ssoWarningText">统一认证可能偶有波动，如遇报错请改用密码登录</span>' +
        '</div>' +
        '<form id="ssoForm" onsubmit="return false;">' +
          '<div class="input-group"><label>学号</label><input type="text" id="ssoStudentId" placeholder="请输入学号或校园卡号" autocomplete="username"></div>' +
          '<div class="input-group"><label>智慧理工大密码</label><input type="password" id="ssoPassword" placeholder="统一认证平台密码" autocomplete="current-password"></div>' +
          '<div class="input-group" id="ssoCaptchaGroup" style="display:none;"><label>验证码</label><div class="sso-captcha-row"><input type="text" id="ssoCaptchaCode" placeholder="请输入验证码" style="flex:1;"><img id="ssoCaptchaImg" src="" alt="验证码" title="点击刷新"></div></div>' +
          '<div class="input-group" id="ssoSmsGroup" style="display:none;"><label>短信验证码</label><input type="text" id="ssoSmsCode" placeholder="请输入手机短信验证码" inputmode="numeric"><div style="font-size:12px;color:var(--text-muted);margin-top:4px;">验证码已发送至绑定手机号</div></div>' +
          '<button class="btn" id="ssoSubmitBtn" type="submit" style="margin-top:12px;width:100%;">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;vertical-align:middle;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> 安全登录' +
          '</button>' +
        '</form>' +
        '<p class="sso-hint">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>' +
          '凭据直接发送至学校认证系统，本站不存储密码' +
        '</p>' +
      '</div>';
    document.body.appendChild(overlay);
  }

  // ── 状态 & 工具函数 ────────────────────────────────────
  var state = { cookies: '', smsHtml: '', submitting: false };
  var safeBtnIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;vertical-align:middle;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> 安全登录';

  function $(id) { return document.getElementById(id); }
  function show(id) { var el = $(id); if (el) el.style.display = 'block'; }
  function hide(id) { var el = $(id); if (el) el.style.display = 'none'; }

  function resetForm() {
    ['ssoStudentId','ssoPassword','ssoCaptchaCode','ssoSmsCode'].forEach(function(id) {
      var el = $(id); if (el) el.value = '';
    });
    hide('ssoCaptchaGroup'); hide('ssoSmsGroup');
    var warn = $('ssoWarning'); if (warn) warn.classList.remove('show');
    state = { cookies: '', smsHtml: '', submitting: false };
    var btn = $('ssoSubmitBtn');
    if (btn) { btn.disabled = false; btn.innerHTML = safeBtnIcon; }
  }

  function openModal() { $('ssoOverlay').classList.add('open'); $('ssoStudentId').focus(); }
  function closeModal() { $('ssoOverlay').classList.remove('open'); resetForm(); }

  // ── API 调用 ───────────────────────────────────────────
  async function ssoFetch(body) {
    return fetch(SSO_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  // ── 绑定事件 ───────────────────────────────────────────
  function bindEvents() {
    // 打开/关闭弹窗
    $('ssoLoginBtn').addEventListener('click', function () {
      // 当前 CAS 代理服务器无法连通，显示维护提示
      window.toast('智慧理工大统一认证暂不可用，请使用学号密码登录。', 'warn');
    });
    $('ssoCloseBtn').addEventListener('click', closeModal);
    $('ssoOverlay').addEventListener('click', function (e) { if (e.target === this) closeModal(); });

    // 清除错误状态
    $('ssoStudentId').addEventListener('input', function () { this.classList.remove('input-error'); });
    $('ssoPassword').addEventListener('input', function () { this.classList.remove('input-error'); });

    // 刷新验证码
    $('ssoCaptchaImg').addEventListener('click', async function () {
      var img = this; img.style.opacity = '0.5';
      try {
        var res = await ssoFetch({ action: 'refresh-captcha', cookies: state.cookies });
        var data = await res.json();
        if (data.success) {
          img.src = data.captchaImage; state.cookies = data.cookies;
          $('ssoCaptchaCode').value = ''; $('ssoCaptchaCode').focus();
        } else { window.toast(data.error || '刷新验证码失败', 'error'); }
      } catch (e) { window.toast('刷新失败: ' + e.message, 'error'); }
      finally { img.style.opacity = '1'; }
    });

    // 提交表单
    $('ssoForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      if (state.submitting) return;

      var studentId = $('ssoStudentId').value.trim();
      var password = $('ssoPassword').value;
      var captcha = $('ssoCaptchaCode').value.trim();
      var smsCode = $('ssoSmsCode').value.trim();

      if (!studentId || !password) {
        if (!studentId) $('ssoStudentId').classList.add('input-error');
        if (!password) $('ssoPassword').classList.add('input-error');
        window.toast('请填写学号和密码', 'warn'); return;
      }

      var isSmsStep = $('ssoSmsGroup').style.display !== 'none';
      state.submitting = true;
      var btn = $('ssoSubmitBtn');
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> 验证中…';

      try {
        var payload = isSmsStep && smsCode
          ? { action: 'sms-verify', smsCode: smsCode, cookies: state.cookies, html: state.smsHtml }
          : { action: 'login', studentId: studentId, password: password, captcha: captcha, cookies: state.cookies };

        var res = await ssoFetch(payload);
        var data = await res.json();

        if (data.success) {
          await handleSuccess(data);
        } else if (data.captchaRequired) {
          show('ssoCaptchaGroup'); $('ssoCaptchaImg').src = data.captchaImage;
          state.cookies = data.cookies; $('ssoCaptchaCode').focus();
          $('ssoWarning').classList.add('show');
          $('ssoWarningText').textContent = data.error || '请输入验证码';
          window.toast(data.error || '请输入验证码', 'warn');
        } else if (data.smsRequired) {
          hide('ssoCaptchaGroup'); show('ssoSmsGroup');
          state.cookies = data.cookies; state.smsHtml = data.html || '';
          $('ssoSmsCode').focus();
          $('ssoWarning').classList.add('show');
          $('ssoWarningText').textContent = data.error || '请输入短信验证码';
          window.toast(data.error || '请输入短信验证码', 'info');
        } else {
          $('ssoWarning').classList.add('show');
          $('ssoWarningText').textContent = data.error || '认证失败';
          window.toast(data.error || '认证失败', 'error');
        }
      } catch (err) {
        window.toast('连接认证服务失败: ' + err.message, 'error');
      } finally {
        state.submitting = false;
        btn.disabled = false; btn.innerHTML = safeBtnIcon;
      }
    });
  }

  // ── 登录成功处理 ───────────────────────────────────────
  async function handleSuccess(ssoData) {
    var studentId = ssoData.sno;
    var realName = ssoData.nickname || ('学生_' + studentId);
    var email = studentId + '@class.local';
    var ssoPwd = $('ssoPassword').value;

    try {
      // 尝试用 CAS 密码登录
      var loginRes = await window.supabaseClient.auth.signInWithPassword({ email: email, password: ssoPwd });
      if (!loginRes.error && loginRes.data.user) {
        await saveSession(loginRes.data.user.id, realName); return;
      }

      // 自动注册
      var signUpRes = await window.supabaseClient.auth.signUp({
        email: email, password: ssoPwd,
        options: { data: { student_id: studentId, real_name: realName } }
      });

      if (signUpRes.error) {
        if ((signUpRes.error.message || '').match(/already|exists/i)) {
          window.toast('该学号已注册但密码不匹配，请用密码登录。', 'warn');
        } else {
          window.toast('自动注册失败: ' + signUpRes.error.message, 'error');
        }
        closeModal(); return;
      }

      if (signUpRes.data.user) {
        localStorage.setItem('remembered_login', JSON.stringify({ id: studentId, pw: ssoPwd }));
        await new Promise(function (r) { setTimeout(r, 500); });
        await saveSession(signUpRes.data.user.id, realName);
      }
    } catch (err) {
      window.toast('SSO 登录出错: ' + err.message, 'error');
    }
  }

  async function saveSession(userId, realName) {
    try {
      var res = await window.supabaseClient.from('profiles')
        .select('student_id,real_name,role,position,theme,default_anonymous,tutorial_done,avatar_config')
        .eq('id', userId).single();

      sessionStorage.setItem('currentUser', JSON.stringify({
        id: userId, student_id: res.data.student_id,
        real_name: res.data.real_name, role: res.data.role,
        position: res.data.position, avatar_config: res.data.avatar_config
      }));
      if (res.data.avatar_config) {
        localStorage.setItem('avatar_cache_' + userId, JSON.stringify(
          typeof res.data.avatar_config === 'string' ? JSON.parse(res.data.avatar_config) : res.data.avatar_config));
      }
      if (res.data.theme) localStorage.setItem('classroom_theme', res.data.theme);
      if (res.data.default_anonymous != null) {
        var s = JSON.parse(localStorage.getItem('classroom_user_settings') || '{}');
        s.defaultAnonymous = res.data.default_anonymous;
        localStorage.setItem('classroom_user_settings', JSON.stringify(s));
      }
      if (res.data.tutorial_done) localStorage.setItem('tutorial_done', '1');
      sessionStorage.setItem('just_logged_in', '1');

      window.toast('统一认证登录成功！欢迎，' + (realName || '同学'), 'success');
      closeModal();
      setTimeout(function () {
        var redir = sessionStorage.getItem('login_redirect');
        sessionStorage.removeItem('login_redirect');
        window.location.href = redir || 'main.html';
      }, 600);
    } catch (err) {
      window.toast('获取用户信息失败: ' + err.message, 'error');
    }
  }

  // ── 启动 ───────────────────────────────────────────────
  waitFor(function () {
    return typeof window.supabaseClient !== 'undefined' &&
           typeof window.toast === 'function' &&
           document.getElementById('loginBtn');
  }, 50, function () {
    injectCSS();
    createUI();
    bindEvents();
    console.log('[sso] 智慧理工大统一认证模块已就绪');
  });
})();
