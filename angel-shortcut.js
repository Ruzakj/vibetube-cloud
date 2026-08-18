(() => {
  'use strict';

  const FLOAT_ID = 'angelFloatingButton';
  const STYLE_ID = 'angel-shortcut-style';
  const LONG_PRESS_MS = 650;

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .angel-floating{position:fixed;right:max(14px,env(safe-area-inset-right));bottom:calc(88px + env(safe-area-inset-bottom));z-index:70;display:grid;place-items:center;width:54px;height:54px;border:1px solid rgba(167,139,250,.38);border-radius:50%;background:linear-gradient(135deg,#7c5cff,#a78bfa);color:#fff;text-decoration:none;box-shadow:0 12px 34px rgba(0,0,0,.42),0 0 24px rgba(124,92,255,.18);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);transition:transform .18s ease,box-shadow .18s ease}
      .angel-floating:hover{transform:translateY(-2px);box-shadow:0 16px 38px rgba(0,0,0,.48),0 0 28px rgba(124,92,255,.24)}
      .angel-floating:active{transform:scale(.94)}
      .angel-floating-icon{font-size:22px;line-height:1}
      @media(max-width:420px){.angel-floating{right:12px;width:50px;height:50px}}
    `;
    document.head.appendChild(style);
  }

  // The floating Angel button opens the Angel AI-bot menu.
  // It must NOT start a call immediately. The call controls live inside Angel.
  function openAngel() {
    try {
      if (window.location.pathname.endsWith('/ric-companion.html')) {
        window.scrollTo(0, 0);
        const input = document.getElementById('input');
        if (input) input.focus();
        return;
      }
    } catch (_) {}
    window.location.href = '/ric-companion.html';
  }

  function addSingleFloatingAngel() {
    const old = document.getElementById(FLOAT_ID);
    if (old) old.remove();
    const button = document.createElement('button');
    button.id = FLOAT_ID;
    button.className = 'angel-floating';
    button.type = 'button';
    button.setAttribute('aria-label', 'Angel');
    button.title = 'Angel';
    button.innerHTML = '<span class="angel-floating-icon">✦</span>';
    button.addEventListener('click', openAngel);
    document.body.appendChild(button);
  }

  // Holding the existing Ric label is the hidden entry point to Angel.
  // No extra Tools/Ric Space menu is injected here.
  function bindLongPressRic() {
    const ric = document.getElementById('ricLauncher');
    if (!ric || ric.dataset.angelLongPressBound) return;
    ric.dataset.angelLongPressBound = '1';

    let timer = null;
    let fired = false;
    const clear = () => { if (timer) clearTimeout(timer); timer = null; };

    ric.addEventListener('pointerdown', () => {
      fired = false;
      clear();
      timer = setTimeout(() => {
        fired = true;
        openAngel();
      }, LONG_PRESS_MS);
    }, { passive: true });

    ric.addEventListener('pointerup', clear, { passive: true });
    ric.addEventListener('pointercancel', clear, { passive: true });
    ric.addEventListener('contextmenu', e => e.preventDefault());
    ric.addEventListener('click', e => {
      if (fired) {
        e.preventDefault();
        e.stopImmediatePropagation();
        fired = false;
      }
    }, true);
  }

  function init() {
    injectStyle();
    addSingleFloatingAngel();
    bindLongPressRic();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
  window.addEventListener('pageshow', init);
})();
