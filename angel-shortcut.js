(() => {
  'use strict';

  const FLOAT_ID = 'angelFloatingButton';
  const STYLE_ID = 'angel-shortcut-style';
  const LONG_PRESS_MS = 600;

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .angel-floating{
        position:fixed;right:max(14px,env(safe-area-inset-right));
        bottom:calc(88px + env(safe-area-inset-bottom));z-index:70;
        display:grid;place-items:center;width:54px;height:54px;
        border:1px solid rgba(255,255,255,.16);border-radius:50%;
        background:rgba(18,18,24,.94);color:#fff;text-decoration:none;
        box-shadow:0 12px 30px rgba(0,0,0,.38),0 0 0 1px rgba(255,255,255,.03);
        backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);
        transition:transform .18s ease,background .18s ease,box-shadow .18s ease;
        touch-action:manipulation;
      }
      .angel-floating:hover{transform:translateY(-2px);background:#202027;box-shadow:0 16px 34px rgba(0,0,0,.44)}
      .angel-floating:active{transform:scale(.94)}
      .angel-floating-icon{font-size:20px;line-height:1}
      .ric-launcher{touch-action:manipulation;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
      @media(max-width:420px){.angel-floating{right:12px;width:50px;height:50px}}
    `;
    document.head.appendChild(style);
  }

  function openAngelChat() {
    window.location.assign('/ric-companion.html?source=ric-longpress');
  }

  function startCall() {
    try {
      if (window.RicAiraNative && typeof window.RicAiraNative.startCall === 'function') {
        window.RicAiraNative.startCall();
        return;
      }
    } catch (_) {}
    window.location.assign('/ric-companion.html?call=1&source=floating');
  }

  function addSingleFloatingCall() {
    const old = document.getElementById(FLOAT_ID);
    if (old) old.remove();
    const oldNative = document.getElementById('ric-angel-shortcut');
    if (oldNative) oldNative.remove();
    const button = document.createElement('button');
    button.id = FLOAT_ID;
    button.className = 'angel-floating';
    button.type = 'button';
    button.setAttribute('aria-label', 'Telepon Angel');
    button.title = 'Telepon Angel';
    button.innerHTML = '<span class="angel-floating-icon">✦</span>';
    button.addEventListener('click', startCall);
    document.body.appendChild(button);
  }

  function bindLongPressRic() {
    const ric = document.getElementById('ricLauncher');
    if (!ric || ric.dataset.angelLongPressBound) return;
    ric.dataset.angelLongPressBound = '1';

    let timer = null;
    let longPressed = false;
    const cancel = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };
    const down = (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      cancel();
      longPressed = false;
      timer = window.setTimeout(() => {
        timer = null;
        longPressed = true;
        openAngelChat();
      }, LONG_PRESS_MS);
    };
    const up = (event) => {
      cancel();
      if (longPressed) {
        event.preventDefault();
        event.stopImmediatePropagation();
        longPressed = false;
      }
    };
    ric.addEventListener('pointerdown', down, { passive: true });
    ric.addEventListener('pointerup', up, { capture: true });
    ric.addEventListener('pointercancel', cancel, { passive: true });
    ric.addEventListener('pointerleave', cancel, { passive: true });
    ric.addEventListener('contextmenu', event => event.preventDefault());
    ric.addEventListener('click', event => {
      if (longPressed) {
        event.preventDefault();
        event.stopImmediatePropagation();
        longPressed = false;
      }
    }, true);
  }

  function loadRideHistoryFix() {
    if (window.__ricRideHistoryFixLoaded || document.querySelector('script[data-ric-ride-history-fix]')) return;
    const script = document.createElement('script');
    script.src = './ride-history-fix.js?v=1.0.1';
    script.async = true;
    script.dataset.ricRideHistoryFix = '1';
    script.onload = () => { window.__ricRideHistoryFixLoaded = true; };
    document.head.appendChild(script);
  }

  function init() {
    injectStyle();
    addSingleFloatingCall();
    bindLongPressRic();
    loadRideHistoryFix();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
  window.addEventListener('pageshow', init);
})();
