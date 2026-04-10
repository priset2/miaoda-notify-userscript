// ==UserScript==
// @name         秒哒 / MeDo 对话完成提醒
// @namespace    https://github.com/YOUR_GITHUB_USERNAME
// @version      1.5.0
// @description  Compatible with 秒哒 (CN) and MeDo (EN). Notify when a conversation is finished, but do not notify if the user has already returned to the page.
// @author       YOUR_GITHUB_USERNAME
// @match        *://www.miaoda.cn/*
// @match        *://miaoda.cn/*
// @match        *://*.appmiaoda.com/*
// @match        *://appmiaoda.com/*
// @match        *://medo.dev/*
// @match        *://*.medo.dev/*
// @include      *://*miaoda*/*
// @run-at       document-idle
// @grant        GM_notification
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @homepageURL  https://github.com/YOUR_GITHUB_USERNAME/REPO_NAME
// @supportURL   https://github.com/YOUR_GITHUB_USERNAME/REPO_NAME/issues
// @downloadURL  https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/REPO_NAME/main/miaoda-notify.user.js
// @updateURL    https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/REPO_NAME/main/miaoda-notify.user.js
// ==/UserScript==

(function () {
  'use strict';

  const SITE = detectSiteProfile();

  const CONFIG = {
    pollMs: 800,
    blinkInterval: 850,
    blinkTimes: 36,
    cooldownMs: 5000,
    debug: true,
    testButtonStorageKey: 'miaoda_show_test_button',
    notifyDelayMs: 1200,
    minHiddenMs: 1500
  };

  const I18N = {
    zh: {
      appName: '秒哒',
      notifyTitle: '秒哒',
      notifyText: '本次对话已完成，请返回页面查看结果并开始下一轮。',
      testNotifyTitle: '秒哒通知测试',
      testNotifyText: '如果你看到了这条系统通知，说明通知链路已经打通。',
      testButtonText: '通知测试',
      blinkTitle: '【对话完成，快回来】秒哒',
      menuToggle: '切换通知测试按钮显示/隐藏',
      alertText:
        '通知测试未成功。\n\n请检查：\n1. 浏览器站点通知是否允许；\n2. macOS 系统设置 -> 通知 -> 浏览器 是否开启；\n3. Tampermonkey 是否正确授予 GM_notification。',
      logPrefix: '[秒哒提醒]'
    },
    en: {
      appName: 'MeDo',
      notifyTitle: 'MeDo',
      notifyText: 'This conversation is complete. Please return to review the result and start the next round.',
      testNotifyTitle: 'MeDo Notification Test',
      testNotifyText: 'If you can see this system notification, the notification pipeline is working.',
      testButtonText: 'Test Notify',
      blinkTitle: '[Conversation complete] Come back to MeDo',
      menuToggle: 'Toggle notification test button',
      alertText:
        'Notification test failed.\n\nPlease check:\n1. Site notification permission is allowed in your browser;\n2. Browser notifications are enabled in macOS System Settings;\n3. Tampermonkey has granted GM_notification correctly.',
      logPrefix: '[MeDo Notify]'
    }
  };

  const TEXT = I18N[SITE.lang];

  const STATE = {
    previous: 'unknown',
    originalTitle: document.title,
    blinkTimer: null,
    blinkCount: 0,
    lastNotifyAt: 0,
    loopTimer: null,
    showTestButton: true,
    menuRegistered: false,
    pendingNotifyTimer: null,
    hiddenSince: null,
    lastVisibleAt: Date.now()
  };

  function detectSiteProfile() {
    const host = location.hostname.toLowerCase();
    const htmlLang = (document.documentElement.getAttribute('lang') || '').toLowerCase();

    const isEnglishHost = host.includes('medo.dev');
    const isEnglishLang = htmlLang.startsWith('en');

    if (isEnglishHost || isEnglishLang) {
      return { lang: 'en', hostType: 'medo' };
    }
    return { lang: 'zh', hostType: 'miaoda' };
  }

  function log(...args) {
    if (CONFIG.debug) console.log(TEXT.logPrefix, ...args);
  }

  function getStoredShowTestButton() {
    try {
      return Boolean(GM_getValue(CONFIG.testButtonStorageKey, true));
    } catch (err) {
      log('Failed to read test button config, fallback to true.', err);
      return true;
    }
  }

  function setStoredShowTestButton(value) {
    try {
      GM_setValue(CONFIG.testButtonStorageKey, Boolean(value));
    } catch (err) {
      log('Failed to save test button config.', err);
    }
  }

  function registerMenu() {
    if (STATE.menuRegistered) return;

    try {
      GM_registerMenuCommand(TEXT.menuToggle, () => {
        STATE.showTestButton = !STATE.showTestButton;
        setStoredShowTestButton(STATE.showTestButton);
        syncTestButtonVisibility();
        log('Test button visibility switched to:', STATE.showTestButton);
      });
      STATE.menuRegistered = true;
    } catch (err) {
      log('Failed to register menu command.', err);
    }
  }

  function stopBlink() {
    if (STATE.blinkTimer) {
      clearInterval(STATE.blinkTimer);
      STATE.blinkTimer = null;
    }
    document.title = STATE.originalTitle;
  }

  function startBlink() {
    stopBlink();
    STATE.blinkCount = 0;

    STATE.blinkTimer = setInterval(() => {
      document.title = document.title === STATE.originalTitle
        ? TEXT.blinkTitle
        : STATE.originalTitle;

      STATE.blinkCount += 1;
      if (STATE.blinkCount >= CONFIG.blinkTimes) {
        stopBlink();
      }
    }, CONFIG.blinkInterval);
  }

  function clearPendingNotification() {
    if (STATE.pendingNotifyTimer) {
      clearTimeout(STATE.pendingNotifyTimer);
      STATE.pendingNotifyTimer = null;
      log('Pending notification cancelled.');
    }
  }

  function isPageReallyHidden() {
    return document.visibilityState === 'hidden' || !document.hasFocus();
  }

  function initVisibilityState() {
    if (isPageReallyHidden()) {
      STATE.hiddenSince = Date.now();
    } else {
      STATE.hiddenSince = null;
      STATE.lastVisibleAt = Date.now();
    }
  }

  function normalizeD(d) {
    return (d || '').replace(/\s+/g, ' ').trim();
  }

  function inBottomRight(el) {
    const rect = el.getBoundingClientRect();
    return (
      rect.width > 16 &&
      rect.height > 16 &&
      rect.right > window.innerWidth - 260 &&
      rect.bottom > window.innerHeight - 260
    );
  }

  function isSendArrowPath(path) {
    const d = normalizeD(path.getAttribute('d') || '');
    return d.includes('M6.22 11V1')
      && d.includes('L1 5.17')
      && d.includes('11 5.17');
  }

  function isStopRect(rectNode) {
    if (!rectNode) return false;
    const tag = rectNode.tagName?.toLowerCase();
    if (tag !== 'rect') return false;
    return rectNode.getAttribute('width') === '12'
      && rectNode.getAttribute('height') === '12'
      && rectNode.getAttribute('rx') === '4';
  }

  function findSendControl() {
    const paths = Array.from(document.querySelectorAll('svg path'));
    for (const path of paths) {
      if (!isSendArrowPath(path)) continue;
      const host = path.closest('button, span, [role="button"]');
      if (!host) continue;
      if (!inBottomRight(host)) continue;
      return host;
    }
    return null;
  }

  function findStopControl() {
    const rects = Array.from(document.querySelectorAll('svg rect'));
    for (const rect of rects) {
      if (!isStopRect(rect)) continue;
      const host = rect.closest(
        '.ChatBox-user-input-stop-button, .LuiChatBox-user-input-stop-button, button, span, [role="button"]'
      );
      if (!host) continue;
      if (!inBottomRight(host)) continue;
      return host;
    }
    return null;
  }

  function detectState() {
    const stopControl = findStopControl();
    if (stopControl) return 'running';

    const sendControl = findSendControl();
    if (sendControl) return 'idle';

    return 'unknown';
  }

  async function requestWebNotificationPermission(force = false) {
    if (!('Notification' in window)) {
      log('Notification API is not supported in this browser.');
      return false;
    }

    if (Notification.permission === 'granted') {
      log('Web notification permission has been granted.');
      return true;
    }

    if (Notification.permission === 'denied' && !force) {
      log('Web notification permission has been denied.');
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      log('Notification.requestPermission result:', result);
      return result === 'granted';
    } catch (err) {
      log('Failed to request notification permission.', err);
      return false;
    }
  }

  function sendGMNotification(title, text) {
    if (typeof GM_notification !== 'function') {
      log('GM_notification is unavailable.');
      return false;
    }

    try {
      GM_notification({
        title,
        text,
        timeout: 0,
        silent: true,
        highlight: true,
        onclick: function () {
          window.focus();
        },
        ondone: function () {
          log('GM_notification closed.');
        }
      });
      log('GM_notification triggered.');
      return true;
    } catch (err) {
      log('GM_notification failed.', err);
      return false;
    }
  }

  async function sendWebNotification(title, text) {
    if (!('Notification' in window)) {
      log('Native Notification is unavailable.');
      return false;
    }

    const ok = await requestWebNotificationPermission(false);
    if (!ok) {
      log('Native Notification permission not granted.');
      return false;
    }

    try {
      const n = new Notification(title, {
        body: text,
        silent: true,
        tag: 'medo-miaoda-chat-done'
      });

      n.onclick = () => {
        window.focus();
        n.close();
      };

      log('Native Notification triggered.');
      return true;
    } catch (err) {
      log('Native Notification failed.', err);
      return false;
    }
  }

  async function fireSystemNotification(title, text) {
    let ok = false;

    ok = sendGMNotification(title, text);
    if (!ok) {
      ok = await sendWebNotification(title, text);
    }

    if (!ok) {
      log('No system notification was successfully triggered.');
    }

    return ok;
  }

  async function testNotificationFlow() {
    log('Testing notification pipeline...');
    const permissionOk = await requestWebNotificationPermission(true);
    log(
      'Test button permission result:',
      permissionOk ? 'granted' : (window.Notification ? Notification.permission : 'unsupported')
    );

    const ok = await fireSystemNotification(
      TEXT.testNotifyTitle,
      TEXT.testNotifyText
    );

    if (!ok) {
      alert(TEXT.alertText);
    }
  }

  function createTestButton() {
    const btn = document.createElement('button');
    btn.id = '__miaoda_test_notify_btn__';
    btn.type = 'button';
    btn.textContent = TEXT.testButtonText;
    btn.setAttribute('aria-label', TEXT.testButtonText);
    btn.style.cssText = `
      position: fixed;
      right: 18px;
      bottom: 72px;
      z-index: 2147483647;
      padding: 10px 14px;
      border-radius: 999px;
      border: 2px solid #111;
      background: #ffef5a;
      color: #111;
      font-size: 14px;
      font-weight: 800;
      line-height: 1;
      box-shadow: 0 10px 24px rgba(0,0,0,.18);
      cursor: pointer;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
    `;
    btn.addEventListener('click', testNotificationFlow);
    return btn;
  }

  function ensureSingleTestButton() {
    const existing = Array.from(document.querySelectorAll('#__miaoda_test_notify_btn__'));
    if (existing.length > 1) {
      existing.slice(1).forEach(el => el.remove());
    }

    let btn = document.getElementById('__miaoda_test_notify_btn__');
    if (!btn) {
      btn = createTestButton();
      document.body.appendChild(btn);
      log('Test button inserted.');
    }

    return btn;
  }

  function syncTestButtonVisibility() {
    const btn = ensureSingleTestButton();
    if (!btn) return;
    btn.style.display = STATE.showTestButton ? 'block' : 'none';
  }

  async function notifyDone() {
    const now = Date.now();
    if (now - STATE.lastNotifyAt < CONFIG.cooldownMs) return;

    clearPendingNotification();

    STATE.pendingNotifyTimer = setTimeout(async () => {
      STATE.pendingNotifyTimer = null;

      const stillHidden = isPageReallyHidden();
      const hiddenDuration = STATE.hiddenSince ? (Date.now() - STATE.hiddenSince) : 0;

      if (!stillHidden) {
        log('Skip notification because user is already back on the page.');
        return;
      }

      if (hiddenDuration < CONFIG.minHiddenMs) {
        log('Skip notification because hidden duration is too short:', hiddenDuration);
        return;
      }

      STATE.lastNotifyAt = Date.now();
      log('Preparing completion notification...');
      await fireSystemNotification(TEXT.notifyTitle, TEXT.notifyText);
      startBlink();
    }, CONFIG.notifyDelayMs);
  }

  function tick() {
    const current = detectState();

    if (current !== STATE.previous) {
      log('State changed:', STATE.previous, '->', current);
    }

    if (STATE.previous === 'running' && current === 'idle') {
      log('Conversation finished. Queueing notification.');
      notifyDone();
    }

    STATE.previous = current;
    syncTestButtonVisibility();
  }

  function init() {
    if (STATE.loopTimer) return;

    initVisibilityState();
    STATE.showTestButton = getStoredShowTestButton();
    registerMenu();
    syncTestButtonVisibility();

    log('Script injected for site:', SITE.hostType);
    tick();
    STATE.loopTimer = setInterval(tick, CONFIG.pollMs);
    setTimeout(tick, 500);
    setTimeout(tick, 1500);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      STATE.hiddenSince = Date.now();
      log('Page hidden.');
    } else {
      STATE.lastVisibleAt = Date.now();
      STATE.hiddenSince = null;
      clearPendingNotification();
      stopBlink();
      log('Page visible, cancel notification if pending.');
    }
  });

  window.addEventListener('focus', () => {
    STATE.lastVisibleAt = Date.now();
    STATE.hiddenSince = null;
    clearPendingNotification();
    stopBlink();
  });

  window.addEventListener('blur', () => {
    STATE.hiddenSince = Date.now();
  });

  window.addEventListener('load', init);
  setTimeout(init, 1200);
})();
