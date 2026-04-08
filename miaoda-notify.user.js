// ==UserScript==
// @name         秒哒对话完成提醒
// @namespace    https://github.com/YOUR_GITHUB_USERNAME
// @version      1.3.0
// @description  秒哒对话完成后触发系统通知，支持测试按钮显隐控制
// @author       YOUR_GITHUB_USERNAME
// @match        *://www.miaoda.cn/*
// @match        *://miaoda.cn/*
// @match        *://*.appmiaoda.com/*
// @match        *://appmiaoda.com/*
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

  const CONFIG = {
    pollMs: 800,
    blinkInterval: 850,
    blinkTimes: 36,
    cooldownMs: 5000,
    debug: true,
    notificationTitle: '秒哒',
    notificationText: '本次对话已完成，请返回页面查看结果并开始下一轮。',
    testButtonText: '通知测试',
    testButtonStorageKey: 'miaoda_show_test_button'
  };

  const STATE = {
    previous: 'unknown',
    originalTitle: document.title,
    blinkTimer: null,
    blinkCount: 0,
    lastNotifyAt: 0,
    loopTimer: null,
    showTestButton: true,
    menuRegistered: false
  };

  function log(...args) {
    if (CONFIG.debug) console.log('[秒哒提醒]', ...args);
  }

  function getStoredShowTestButton() {
    try {
      return Boolean(GM_getValue(CONFIG.testButtonStorageKey, true));
    } catch (err) {
      log('读取测试按钮配置失败，使用默认值 true', err);
      return true;
    }
  }

  function setStoredShowTestButton(value) {
    try {
      GM_setValue(CONFIG.testButtonStorageKey, Boolean(value));
    } catch (err) {
      log('保存测试按钮配置失败', err);
    }
  }

  function registerMenu() {
    if (STATE.menuRegistered) return;

    try {
      GM_registerMenuCommand('切换通知测试按钮显示/隐藏', () => {
        STATE.showTestButton = !STATE.showTestButton;
        setStoredShowTestButton(STATE.showTestButton);
        syncTestButtonVisibility();
        log('测试按钮显示状态已切换为:', STATE.showTestButton);
      });
      STATE.menuRegistered = true;
    } catch (err) {
      log('注册菜单命令失败', err);
    }
  }

  function isForeground() {
    return document.visibilityState === 'visible' && document.hasFocus();
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
        ? '【对话完成，快回来】秒哒'
        : STATE.originalTitle;

      STATE.blinkCount += 1;
      if (STATE.blinkCount >= CONFIG.blinkTimes) {
        stopBlink();
      }
    }, CONFIG.blinkInterval);
  }

  function normalizeD(d) {
    return (d || '').replace(/\s+/g, ' ').trim();
  }

  function inBottomRight(el) {
    const rect = el.getBoundingClientRect();
    return (
      rect.width > 16 &&
      rect.height > 16 &&
      rect.right > window.innerWidth - 240 &&
      rect.bottom > window.innerHeight - 240
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
    const paths = Array.from(document.querySelectorAll('svg.ChatUI-icon path'));
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
    const rects = Array.from(document.querySelectorAll('svg.ChatUI-icon rect'));
    for (const rect of rects) {
      if (!isStopRect(rect)) continue;
      const host = rect.closest('.ChatBox-user-input-stop-button, .LuiChatBox-user-input-stop-button, span, button, [role="button"]');
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
      log('当前浏览器不支持 Notification API');
      return false;
    }

    if (Notification.permission === 'granted') {
      log('网页通知权限已授予');
      return true;
    }

    if (Notification.permission === 'denied' && !force) {
      log('网页通知权限已被拒绝');
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      log('Notification.requestPermission 结果:', result);
      return result === 'granted';
    } catch (err) {
      log('请求网页通知权限失败', err);
      return false;
    }
  }

  function sendGMNotification(title, text) {
    if (typeof GM_notification !== 'function') {
      log('GM_notification 不可用');
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
          log('GM_notification 已关闭');
        }
      });
      log('已触发 GM_notification');
      return true;
    } catch (err) {
      log('GM_notification 调用失败', err);
      return false;
    }
  }

  async function sendWebNotification(title, text) {
    if (!('Notification' in window)) {
      log('当前页面不支持原生 Notification');
      return false;
    }

    const ok = await requestWebNotificationPermission(false);
    if (!ok) {
      log('原生 Notification 未获权限');
      return false;
    }

    try {
      const n = new Notification(title, {
        body: text,
        silent: true,
        tag: 'miaoda-chat-done'
      });

      n.onclick = () => {
        window.focus();
        n.close();
      };

      log('已触发原生 Notification');
      return true;
    } catch (err) {
      log('原生 Notification 调用失败', err);
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
      log('系统通知未成功触发');
    }

    return ok;
  }

  async function testNotificationFlow() {
    log('开始测试通知链路');
    const permissionOk = await requestWebNotificationPermission(true);
    log('测试按钮权限结果:', permissionOk ? 'granted' : (window.Notification ? Notification.permission : 'unsupported'));

    const ok = await fireSystemNotification(
      '秒哒通知测试',
      '如果你看到了这条系统通知，说明通知链路已经打通。'
    );

    if (!ok) {
      alert(
        '通知测试未成功。\n\n请检查：\n1. 浏览器站点通知是否允许；\n2. macOS 系统设置 -> 通知 -> 浏览器 是否开启；\n3. Tampermonkey 是否正确授予 GM_notification。'
      );
    }
  }

  function createTestButton() {
    const btn = document.createElement('button');
    btn.id = '__miaoda_test_notify_btn__';
    btn.type = 'button';
    btn.textContent = CONFIG.testButtonText;
    btn.setAttribute('aria-label', '测试秒哒系统通知');
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
      log('测试按钮已插入');
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
    STATE.lastNotifyAt = now;

    log('准备发送完成通知');
    await fireSystemNotification(CONFIG.notificationTitle, CONFIG.notificationText);
    startBlink();
  }

  function tick() {
    const current = detectState();

    if (current !== STATE.previous) {
      log('状态变化:', STATE.previous, '->', current);
    }

    if (STATE.previous === 'running' && current === 'idle') {
      log('检测到对话完成，触发系统通知');
      notifyDone();
    }

    STATE.previous = current;
    syncTestButtonVisibility();
  }

  function init() {
    if (STATE.loopTimer) return;

    STATE.showTestButton = getStoredShowTestButton();
    registerMenu();
    syncTestButtonVisibility();

    log('脚本已注入');
    tick();
    STATE.loopTimer = setInterval(tick, CONFIG.pollMs);
    setTimeout(tick, 500);
    setTimeout(tick, 1500);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      stopBlink();
    }
  });

  window.addEventListener('focus', stopBlink);
  window.addEventListener('load', init);
  setTimeout(init, 1200);
})();
