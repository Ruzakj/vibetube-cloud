(()=>{
  const STYLE_ID='ric-portrait-speedmap-v87-style';
  if(!document.getElementById(STYLE_ID)){
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
@media (orientation:portrait){
  body.ric-speedmap-portrait{overflow:hidden!important;overscroll-behavior:none!important}
  body.ric-speedmap-portrait #rideDashboard{position:fixed!important;inset:0!important;width:100vw!important;height:100dvh!important;min-height:0!important;max-height:100dvh!important;margin:0!important;padding:0!important;z-index:2147481000!important;overflow:hidden!important;background:#03070d!important;display:block!important}
  body.ric-speedmap-portrait #rideDashboard .ride-left{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;min-height:0!important;margin:0!important;border:0!important;overflow:hidden!important;padding:max(12px,env(safe-area-inset-top)) 10px max(8px,env(safe-area-inset-bottom))!important;box-sizing:border-box!important;z-index:2!important}
  body.ric-speedmap-portrait #rideDashboard .ride-right{display:none!important}
  /* Optical centering: lower the gauge group and the main speed readout slightly. */
  body.ric-speedmap-portrait #rideDashboard .ride-speed-wrap{transform:translateY(22px)!important}
  body.ric-speedmap-portrait #rideDashboard .ride-speed-number{transform:translate(-50%,calc(-50% + 27px))!important}
  body.ric-speedmap-portrait #rideDashboard .ride-speed-number strong{color:var(--ric-speed-number,#f3f6fb)!important;text-shadow:0 0 var(--ric-speed-glow,0px) var(--ric-speed-color,transparent)!important;transition:color .28s linear,text-shadow .28s linear!important}
  body.ric-speedmap-portrait #rideDashboard #rideSpeedArc{stroke:var(--ric-speed-color,#31b7ff)!important;filter:drop-shadow(0 0 var(--ric-arc-glow,3px) var(--ric-speed-color,#31b7ff))!important;transition:stroke .28s linear,filter .28s linear!important}
  body.ric-speedmap-portrait .ric-portrait-controls{position:absolute!important;z-index:2147482000!important;top:max(12px,env(safe-area-inset-top))!important;right:max(12px,env(safe-area-inset-right))!important;display:flex!important;flex-direction:row!important;align-items:center!important;gap:7px!important;pointer-events:auto!important}
  body.ric-speedmap-portrait .ric-portrait-controls button{width:42px!important;height:42px!important;min-width:42px!important;min-height:42px!important;padding:0!important;margin:0!important;border-radius:50%!important;border:1px solid rgba(165,184,208,.28)!important;background:rgba(3,9,16,.92)!important;color:#eef4fb!important;display:flex!important;align-items:center!important;justify-content:center!important;font-size:18px!important;line-height:1!important;box-shadow:0 5px 18px rgba(0,0,0,.28)!important;touch-action:manipulation!important;pointer-events:auto!important}
  body.ric-speedmap-portrait .ric-portrait-controls button:active{transform:scale(.94)!important;background:rgba(18,44,74,.96)!important}
  body.ric-speedmap-portrait .ric-portrait-controls .ric-pc-ride::before{content:'';width:13px;height:13px;border-radius:50%;background:#eef4fb}
  body.ric-speedmap-portrait .ric-portrait-controls .ric-pc-ride.recording::before{border-radius:3px;background:#ff4d55}
  body.ric-speedmap-portrait .ric-portrait-controls .ric-pc-menu{font-size:0!important}
  body.ric-speedmap-portrait .ric-portrait-controls .ric-pc-menu::after{content:'•••';font-size:18px;letter-spacing:2px;transform:translateY(-2px)}
  body.ric-speedmap-portrait .ric-portrait-controls .ric-pc-full{font-size:23px!important}
  body.ric-speedmap-portrait .ric-portrait-controls .ric-pc-voice{font-size:16px!important;letter-spacing:-2px}
  body.ric-speedmap-portrait #dashMenu{z-index:2147483000!important}
  body.ric-speedmap-portrait #rideHistoryModal{z-index:2147483100!important}
}
@media (orientation:landscape){.ric-portrait-controls{display:none!important}}
`;
    document.head.appendChild(s);
  }

  const isPortrait=()=>matchMedia('(orientation: portrait)').matches;
  const q=s=>document.querySelector(s);
  let speedObserver=null,lastSpeed=-1;
  const mix=(a,b,t)=>Math.round(a+(b-a)*t);
  const rgb=h=>{const n=parseInt(h.slice(1),16);return[(n>>16)&255,(n>>8)&255,n&255]};
  const hex=a=>'#'+a.map(v=>Math.max(0,Math.min(255,v)).toString(16).padStart(2,'0')).join('');
  function gradientSpeed(v){
    const stops=[[0,'#31b7ff'],[40,'#347dff'],[90,'#7357ff'],[140,'#d946ef'],[180,'#ff7a2f'],[240,'#ff3b30']];
    for(let i=1;i<stops.length;i++)if(v<=stops[i][0]){const [p0,c0]=stops[i-1],[p1,c1]=stops[i],t=(v-p0)/(p1-p0),a=rgb(c0),b=rgb(c1);return hex([mix(a[0],b[0],t),mix(a[1],b[1],t),mix(a[2],b[2],t)])}
    return stops.at(-1)[1];
  }
  function speedTheme(speed){
    const v=Math.max(0,Math.min(240,Number(speed)||0));
    const color=gradientSpeed(v),dash=q('#rideDashboard');if(!dash)return;
    dash.style.setProperty('--ric-speed-color',color);
    /* Keep 0/low-speed numerals clean white; tint progressively once moving. */
    dash.style.setProperty('--ric-speed-number',v<40?'#f3f6fb':color);
    dash.style.setProperty('--ric-arc-glow',v>=180?'10px':v>=140?'8px':v>=90?'7px':v>=40?'5px':'3px');
    dash.style.setProperty('--ric-speed-glow',v>=180?'14px':v>=140?'10px':v>=90?'7px':v>=40?'4px':'0px');
  }
  function bindSpeedTheme(){const el=q('#dashSpeed');if(!el)return;const apply=()=>{const v=parseFloat(el.textContent)||0;if(v!==lastSpeed){lastSpeed=v;speedTheme(v)}};apply();if(speedObserver)speedObserver.disconnect();speedObserver=new MutationObserver(apply);speedObserver.observe(el,{childList:true,characterData:true,subtree:true})}
  function syncRideVisual(){const source=q('#rideTrackingBtn'),btn=q('.ric-pc-ride');if(!source||!btn)return;btn.classList.toggle('recording',source.classList.contains('recording'));btn.title=source.classList.contains('recording')?'Stop Ride':'Mulai Ride'}
  function ensureMenuBack(){const card=q('#dashMenu .dash-menu-card');if(!card||q('#portraitBackRic'))return;const b=document.createElement('button');b.id='portraitBackRic';b.type='button';b.className='ghost';b.textContent='Kembali ke Ric Space';b.addEventListener('click',()=>{q('#closeDashMenu')?.click();q('#ricToolBack')?.click();cleanup()});card.appendChild(b)}
  function mount(){const dash=q('#rideDashboard');if(!dash)return false;if(!isPortrait()){document.body.classList.remove('ric-speedmap-portrait');return false}document.body.classList.add('ric-speedmap-portrait');dash.classList.add('ric-portrait-fixed');let box=dash.querySelector('.ric-portrait-controls');if(!box){box=document.createElement('div');box.className='ric-portrait-controls';box.innerHTML=`<button type="button" class="ric-pc-voice" aria-label="Voice navigation">◖)))</button><button type="button" class="ric-pc-ride" aria-label="Ride tracking"></button><button type="button" class="ric-pc-full" aria-label="Fullscreen">⛶</button><button type="button" class="ric-pc-menu" aria-label="Menu"></button>`;dash.appendChild(box);box.querySelector('.ric-pc-voice').addEventListener('click',e=>{e.stopPropagation();q('#voiceBtn')?.click()});box.querySelector('.ric-pc-ride').addEventListener('click',e=>{e.stopPropagation();q('#rideTrackingBtn')?.click();setTimeout(syncRideVisual,80)});box.querySelector('.ric-pc-full').addEventListener('click',e=>{e.stopPropagation();q('#dashFullscreen')?.click()});box.querySelector('.ric-pc-menu').addEventListener('click',e=>{e.stopPropagation();const m=q('#dashMenu');if(m){m.classList.remove('hidden');m.style.pointerEvents='auto';ensureMenuBack()}})}ensureMenuBack();syncRideVisual();bindSpeedTheme();return true}
  function cleanup(){document.body.classList.remove('ric-speedmap-portrait');if(speedObserver){speedObserver.disconnect();speedObserver=null}lastSpeed=-1}
  function scheduleMount(){[0,40,120,260,500].forEach(ms=>setTimeout(mount,ms))}
  document.addEventListener('click',e=>{if(e.target.closest('[data-tool="speedmap"]'))scheduleMount();if(e.target.closest('#ricToolBack'))cleanup()},true);
  window.addEventListener('orientationchange',scheduleMount,{passive:true});window.addEventListener('resize',()=>{if(q('#rideDashboard'))mount()},{passive:true});setInterval(()=>{if(q('#rideDashboard'))syncRideVisual()},1200);scheduleMount();
})();