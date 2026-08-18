(() => {
  'use strict';

  const FLOAT_ID = 'angelFloatingButton';
  const STYLE_ID = 'angel-shortcut-style';

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
      }
      .angel-floating:hover{transform:translateY(-2px);background:#202027;box-shadow:0 16px 34px rgba(0,0,0,.44)}
      .angel-floating:active{transform:scale(.94)}
      .angel-floating-icon{font-size:20px;line-height:1}
      @media(max-width:420px){.angel-floating{right:12px;width:50px;height:50px}}
    `;
    document.head.appendChild(style);
  }

  function openAngelChat() {
    window.location.href = '/ric-companion.html';
  }

  function startCall() {
    try {
      if (window.RicAiraNative && typeof window.RicAiraNative.startCall === 'function') {
        window.RicAiraNative.startCall();
        return;
      }
    } catch (_) {}
    window.location.href = '/ric-companion.html?call=1';
  }

  function addSingleFloatingCall() {
    const old = document.getElementById(FLOAT_ID);
    if (old) old.remove();
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
    let suppressClick = false;

    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const down = () => {
      longPressed = false;
      suppressClick = false;
      clear();
      timer = setTimeout(() => {
        longPressed = true;
        suppressClick = true;
        openAngelChat();
      }, 650);
    };

    const up = () => clear();

    ric.addEventListener('pointerdown', down, { passive: true });
    ric.addEventListener('pointerup', up, { passive: true });
    ric.addEventListener('pointercancel', up, { passive: true });
    ric.addEventListener('contextmenu', e => e.preventDefault());
    ric.addEventListener('click', e => {
      if (suppressClick || longPressed) {
        e.preventDefault();
        e.stopImmediatePropagation();
        suppressClick = false;
        longPressed = false;
      }
      // Normal tap is intentionally untouched: script.js opens Ric Space.
    }, true);
  }

  function init() {
    injectStyle();
    addSingleFloatingCall();
    bindLongPressRic();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
  window.addEventListener('pageshow', init);
})();
