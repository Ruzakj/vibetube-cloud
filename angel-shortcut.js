(() => {
  'use strict';

  const FLOAT_ID = 'angelFloatingButton';
  const TOOLS_ID = 'angelToolsMenu';
  const STYLE_ID = 'angel-shortcut-style';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .angel-floating{position:fixed;right:max(14px,env(safe-area-inset-right));bottom:calc(88px + env(safe-area-inset-bottom));z-index:70;display:grid;place-items:center;width:54px;height:54px;border:1px solid rgba(167,139,250,.38);border-radius:50%;background:linear-gradient(135deg,#7c5cff,#a78bfa);color:#fff;text-decoration:none;box-shadow:0 12px 34px rgba(0,0,0,.42),0 0 24px rgba(124,92,255,.18);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);transition:transform .18s ease,box-shadow .18s ease}
      .angel-floating:hover{transform:translateY(-2px);box-shadow:0 16px 38px rgba(0,0,0,.48),0 0 28px rgba(124,92,255,.24)}
      .angel-floating:active{transform:scale(.94)}
      .angel-floating-icon{font-size:22px;line-height:1}
      .angel-tools{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%) scale(.96);width:min(310px,calc(100vw - 32px));padding:10px;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(14,14,20,.96);box-shadow:0 24px 70px rgba(0,0,0,.58);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);z-index:200;opacity:0;pointer-events:none;transition:.16s ease}
      .angel-tools.open{opacity:1;pointer-events:auto;transform:translate(-50%,-50%) scale(1)}
      .angel-tools-title{padding:8px 10px 6px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#8f8f9c}
      .angel-tools button{width:100%;display:flex;align-items:center;gap:11px;border:0;border-radius:12px;background:transparent;color:#fff;padding:13px 11px;text-align:left;cursor:pointer}
      .angel-tools button:hover{background:rgba(255,255,255,.07)}
      .angel-tools .tool-icon{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:rgba(124,92,255,.18);font-size:17px}
      .angel-tools b{font-size:13px}.angel-tools span{display:block;color:#9996a6;font-size:10px;margin-top:2px}
      .angel-tools-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.42);z-index:199;opacity:0;pointer-events:none;transition:.16s ease}
      .angel-tools-backdrop.open{opacity:1;pointer-events:auto}
      @media(max-width:420px){.angel-floating{right:12px;width:50px;height:50px}}
    `;
    document.head.appendChild(style);
  }

  function startCall() {
    // Android app: use the native Angel call activity directly.
    try {
      if (window.RicAiraNative && typeof window.RicAiraNative.startCall === 'function') {
        window.RicAiraNative.startCall();
        return;
      }
    } catch (_) {}
    // PWA/web fallback: open the Angel companion at its call entry point.
    window.location.href = '/ric-companion.html?call=1';
  }

  function addSingleFloatingCall() {
    const old = document.getElementById(FLOAT_ID);
    if (old) old.remove();
    const link = document.createElement('button');
    link.id = FLOAT_ID;
    link.className = 'angel-floating';
    link.type = 'button';
    link.setAttribute('aria-label', 'Telepon Angel');
    link.title = 'Telepon Angel';
    link.innerHTML = '<span class="angel-floating-icon">📞</span>';
    link.addEventListener('click', startCall);
    document.body.appendChild(link);
  }

  function addToolsMenu() {
    if (document.getElementById(TOOLS_ID)) return;
    const backdrop = document.createElement('div');
    backdrop.id = `${TOOLS_ID}Backdrop`;
    backdrop.className = 'angel-tools-backdrop';
    const menu = document.createElement('div');
    menu.id = TOOLS_ID;
    menu.className = 'angel-tools';
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-label', 'Tools');
    menu.innerHTML = `
      <div class="angel-tools-title">Tools</div>
      <button type="button" id="angelRicSpaceTool">
        <span class="tool-icon">R</span>
        <div><b>Ric Space</b><span>Buka menu tools Ric Space</span></div>
      </button>
    `;
    const close = () => { menu.classList.remove('open'); backdrop.classList.remove('open'); };
    backdrop.addEventListener('click', close);
    menu.querySelector('#angelRicSpaceTool').addEventListener('click', () => {
      close();
      const launcher = document.getElementById('ricLauncher');
      if (launcher) launcher.click();
    });
    document.body.append(backdrop, menu);
  }

  function bindLongPressRic() {
    const ric = document.getElementById('ricLauncher');
    if (!ric || ric.dataset.angelLongPressBound) return;
    ric.dataset.angelLongPressBound = '1';
    let timer = null;
    let fired = false;
    const clear = () => { if (timer) clearTimeout(timer); timer = null; };
    const openTools = () => {
      const menu = document.getElementById(TOOLS_ID);
      const backdrop = document.getElementById(`${TOOLS_ID}Backdrop`);
      if (menu && backdrop) { menu.classList.add('open'); backdrop.classList.add('open'); }
    };
    const down = () => {
      fired = false;
      clear();
      timer = setTimeout(() => { fired = true; openTools(); }, 650);
    };
    const up = () => clear();
    ric.addEventListener('pointerdown', down, {passive:true});
    ric.addEventListener('pointerup', up, {passive:true});
    ric.addEventListener('pointercancel', up, {passive:true});
    ric.addEventListener('contextmenu', e => e.preventDefault());
    ric.addEventListener('click', e => {
      if (fired) { e.preventDefault(); e.stopImmediatePropagation(); fired = false; }
    }, true);
  }

  function init() {
    injectStyle();
    addSingleFloatingCall();
    addToolsMenu();
    bindLongPressRic();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
  window.addEventListener('pageshow', init);
})();
