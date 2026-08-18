(() => {
  'use strict';

  const ANGEL_URL = '/ric-companion.html';
  const STYLE_ID = 'angel-shortcut-style';
  const CARD_ID = 'angelShortcutCard';
  const FLOAT_ID = 'angelFloatingButton';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .angel-shortcut-card{position:relative;overflow:hidden!important;border-color:rgba(139,92,246,.28)!important;background:linear-gradient(135deg,rgba(74,48,126,.30),rgba(17,17,24,.96))!important}
      .angel-shortcut-card::after{content:"";position:absolute;width:130px;height:130px;right:-55px;top:-55px;border-radius:50%;background:rgba(167,139,250,.12);filter:blur(2px);pointer-events:none}
      .angel-shortcut-card .ric-app-icon{background:linear-gradient(135deg,#7c5cff,#a78bfa)!important;color:#fff!important;box-shadow:0 8px 24px rgba(124,92,255,.28)}
      .angel-shortcut-card .ric-app-copy b{color:#fff}
      .angel-shortcut-card .ric-app-copy span{color:#aaa0c9}
      .angel-floating{position:fixed;right:max(14px,env(safe-area-inset-right));bottom:calc(88px + env(safe-area-inset-bottom));z-index:70;display:flex;align-items:center;gap:9px;padding:8px 13px 8px 9px;border:1px solid rgba(167,139,250,.34);border-radius:999px;background:rgba(20,17,30,.92);color:#fff;text-decoration:none;box-shadow:0 12px 34px rgba(0,0,0,.42),0 0 0 1px rgba(124,92,255,.08);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
      .angel-floating:hover{transform:translateY(-2px);border-color:rgba(167,139,250,.58);box-shadow:0 16px 38px rgba(0,0,0,.48),0 0 24px rgba(124,92,255,.16)}
      .angel-floating:active{transform:scale(.97)}
      .angel-floating-icon{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#7c5cff,#a78bfa);font-size:18px;box-shadow:0 6px 18px rgba(124,92,255,.32)}
      .angel-floating-copy{display:flex;flex-direction:column;line-height:1.05}
      .angel-floating-copy b{font-size:12px;font-weight:800;letter-spacing:-.01em}
      .angel-floating-copy span{margin-top:3px;font-size:9px;color:#aaa0c9}
      @media(max-width:420px){.angel-floating{right:12px;padding:7px 10px 7px 7px}.angel-floating-icon{width:32px;height:32px}.angel-floating-copy b{font-size:11px}.angel-floating-copy span{font-size:8px}}
    `;
    document.head.appendChild(style);
  }

  function addShortcutCard() {
    const grid = document.querySelector('.ric-app-grid');
    if (!grid || document.getElementById(CARD_ID)) return;

    const card = document.createElement('a');
    card.id = CARD_ID;
    card.className = 'ric-app-card angel-shortcut-card';
    card.href = ANGEL_URL;
    card.setAttribute('aria-label', 'Buka Chat Angel');
    card.innerHTML = `
      <div class="ric-app-icon">🪽</div>
      <div class="ric-app-copy"><b>Chat Angel</b><span>Ngobrol langsung dengan Angel</span></div>
      <span class="ric-app-arrow">›</span>
    `;
    const plu = grid.querySelector('a[href="/apps/plu-timer/"]');
    if (plu && plu.nextSibling) grid.insertBefore(card, plu.nextSibling);
    else grid.appendChild(card);
  }

  function addFloatingLauncher() {
    if (document.getElementById(FLOAT_ID)) return;
    const link = document.createElement('a');
    link.id = FLOAT_ID;
    link.className = 'angel-floating';
    link.href = ANGEL_URL;
    link.setAttribute('aria-label', 'Chat Angel');
    link.innerHTML = `
      <span class="angel-floating-icon">🪽</span>
      <span class="angel-floating-copy"><b>Angel</b><span>Chat sekarang</span></span>
    `;
    document.body.appendChild(link);
  }

  function init() {
    injectStyle();
    addShortcutCard();
    addFloatingLauncher();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
  window.addEventListener('pageshow', init);
})();
