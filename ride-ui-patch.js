(()=>{
  const native={
    setInterval:window.setInterval.bind(window),
    clearInterval:window.clearInterval.bind(window),
    addEventListener:window.addEventListener.bind(window),
    removeEventListener:window.removeEventListener.bind(window)
  };
  const runtime=window.__RIC_SPACE_RUNTIME__={
    scope:null,
    speedIntervals:new Set(),
    geoWatches:new Set(),
    orientationListeners:[],
    maps:new Set(),
    historyDecorateTimers:new Set(),
    cleaned:true
  };
  const $=s=>document.querySelector(s);

  function isSpeedContext(){
    return runtime.scope==='speedmap'||!!document.querySelector('#rideDashboard');
  }

  // Track only intervals created synchronously while Speedometer is being initialized.
  window.setInterval=function(fn,delay,...args){
    const id=native.setInterval(fn,delay,...args);
    if(runtime.scope==='speedmap')runtime.speedIntervals.add(id);
    return id;
  };

  // Track device-orientation handlers added by the speedometer so they can be removed on exit.
  window.addEventListener=function(type,listener,options){
    native.addEventListener(type,listener,options);
    if((type==='deviceorientation'||type==='deviceorientationabsolute')&&isSpeedContext()){
      runtime.orientationListeners.push([type,listener,options]);
    }
  };

  // Track geolocation watchPosition IDs created by Speedometer.
  try{
    const geo=navigator.geolocation;
    if(geo&&typeof geo.watchPosition==='function'&&!geo.__ricWrapped){
      const nativeWatch=geo.watchPosition.bind(geo),nativeClear=geo.clearWatch.bind(geo);
      geo.watchPosition=function(...args){
        const id=nativeWatch(...args);
        if(isSpeedContext())runtime.geoWatches.add(id);
        return id;
      };
      geo.clearWatch=function(id){runtime.geoWatches.delete(id);return nativeClear(id)};
      Object.defineProperty(geo,'__ricWrapped',{value:true,configurable:true});
      runtime.nativeGeoClear=nativeClear;
    }
  }catch(e){console.warn('Ric runtime geolocation wrapper:',e)}

  // Track Mapbox instances created by Speedometer and Ride History.
  function installMapboxTracker(){
    try{
      if(!window.mapboxgl?.Map||window.mapboxgl.Map.__ricWrapped)return;
      const NativeMap=window.mapboxgl.Map;
      const ProxyMap=new Proxy(NativeMap,{
        construct(target,args){
          const instance=Reflect.construct(target,args,target);
          if(isSpeedContext())runtime.maps.add(instance);
          return instance;
        }
      });
      Object.defineProperty(ProxyMap,'__ricWrapped',{value:true});
      window.mapboxgl.Map=ProxyMap;
    }catch(e){console.warn('Ric runtime Mapbox wrapper:',e)}
  }
  installMapboxTracker();

  function cancelDecorateTimers(){
    runtime.historyDecorateTimers.forEach(id=>clearTimeout(id));
    runtime.historyDecorateTimers.clear();
  }

  function cleanupSpeed(){
    cancelDecorateTimers();
    runtime.speedIntervals.forEach(id=>native.clearInterval(id));
    runtime.speedIntervals.clear();

    if(runtime.nativeGeoClear){
      runtime.geoWatches.forEach(id=>{try{runtime.nativeGeoClear(id)}catch(e){}});
    }
    runtime.geoWatches.clear();

    runtime.orientationListeners.forEach(([type,listener,options])=>{
      try{native.removeEventListener(type,listener,options)}catch(e){}
    });
    runtime.orientationListeners=[];

    runtime.maps.forEach(m=>{try{m.remove()}catch(e){}});
    runtime.maps.clear();

    try{speechSynthesis?.cancel?.()}catch(e){}
    try{if(document.fullscreenElement)document.exitFullscreen().catch(()=>{})}catch(e){}
    try{screen.orientation?.unlock?.()}catch(e){}
    document.body.classList.remove('ride-fullscreen-mode');
    document.documentElement.classList.remove('ride-fullscreen-mode');
    runtime.cleaned=true;
  }

  function cloud(){
    const url=(window.VIBETUBE_CLOUD_URL||localStorage.getItem('vt_supabase_url')||'').trim().replace(/\/$/,'');
    const key=(window.VIBETUBE_CLOUD_KEY||localStorage.getItem('vt_supabase_key')||'').trim();
    return {url,key};
  }
  function userKey(){
    try{if(typeof getUserId==='function')return getUserId()}catch(e){}
    return localStorage.getItem('vt_user_id')||localStorage.getItem('ric_user_id')||'';
  }
  async function rpc(name,body){
    const {url,key}=cloud();
    if(!url||!key)throw new Error('Cloud belum dikonfigurasi');
    const r=await fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',cache:'no-store',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json','Cache-Control':'no-cache'},body:JSON.stringify(body)});
    const d=await r.json().catch(()=>null);
    if(!r.ok)throw new Error(d?.message||d?.error||`HTTP ${r.status}`);
    return d;
  }
  function setStatus(text){const el=$('#dashStatus');if(el)el.textContent=text}

  function decorateHistory(){
    const list=$('#rideHistoryList');
    if(!list)return;
    list.querySelectorAll('.ride-history-row[data-ride]').forEach(row=>{
      if(row.querySelector('.ride-delete-one'))return;
      const del=document.createElement('button');
      del.type='button';del.className='ride-delete-one';del.textContent='Hapus';del.title='Hapus ride ini';
      del.addEventListener('click',async e=>{
        e.preventDefault();e.stopPropagation();
        const id=row.dataset.ride;
        if(!id||!confirm('Hapus ride ini beserta seluruh titik GPS-nya?'))return;
        del.disabled=true;del.textContent='...';
        try{
          const ok=await rpc('vt_ride_delete',{p_ride_id:id,p_anonymous_key:userKey()});
          if(ok===false)throw new Error('Ride tidak ditemukan');
          row.remove();setStatus('Ride history dihapus');
          $('#rideHistoryBtn')?.click();
        }catch(err){del.disabled=false;del.textContent='Hapus';alert('Gagal hapus ride: '+err.message)}
      });
      row.appendChild(del);
    });

    const head=$('.ride-history-head');
    if(head&&!$('#rideDeleteAll')){
      const actions=document.createElement('div');actions.className='ride-history-actions';
      actions.innerHTML='<button id="rideDeleteAll" type="button">Hapus semua histori</button>';
      head.insertAdjacentElement('afterend',actions);
      $('#rideDeleteAll').addEventListener('click',async()=>{
        if(!confirm('Hapus SEMUA Ride History dan seluruh tracking GPS? Tindakan ini tidak bisa dibatalkan.'))return;
        const btn=$('#rideDeleteAll');btn.disabled=true;btn.textContent='Menghapus...';
        try{
          const n=await rpc('vt_ride_delete_all',{p_anonymous_key:userKey()});
          setStatus(`${Number(n)||0} ride dihapus`);$('#rideHistoryBtn')?.click();
        }catch(err){alert('Gagal hapus histori: '+err.message)}
        finally{btn.disabled=false;btn.textContent='Hapus semua histori'}
      });
    }
  }

  function scheduleHistoryDecoration(){
    cancelDecorateTimers();
    [0,120,350,700].forEach(ms=>{
      const id=setTimeout(()=>{runtime.historyDecorateTimers.delete(id);decorateHistory()},ms);
      runtime.historyDecorateTimers.add(id);
    });
  }

  function patchDashboard(){
    installMapboxTracker();
    const dash=$('#rideDashboard'),controls=dash?.querySelector('.ride-controls');
    const compass=$('#compassBtn'),voice=$('#voiceBtn'),ride=$('#rideTrackingBtn'),full=$('#dashFullscreen'),menu=$('#dashMenuBtn');
    if(!dash||!controls||!compass||!voice||!ride||!full||!menu)return;
    runtime.cleaned=false;
    dash.classList.add('ride-ui-v8');controls.classList.add('ride-controls-v8');

    compass.classList.add('ride-v8-recenter');compass.title='Recenter / Follow GPS';
    voice.classList.add('ride-v8-voice');voice.title='Voice navigation';
    ride.classList.add('ride-round-btn','ride-v8-track');ride.title='Mulai / Stop Ride';
    full.classList.add('ride-round-btn','ride-v8-fullscreen');full.title='Fullscreen';
    menu.classList.add('ride-v8-menu');menu.title='Menu lainnya';
    [compass,voice,ride,full,menu].forEach(el=>{if(el.parentElement!==controls)controls.appendChild(el)});

    const menuOverlay=$('#dashMenu');
    if(menuOverlay){menuOverlay.classList.add('dash-menu-v8');menuOverlay.style.pointerEvents=menuOverlay.classList.contains('hidden')?'none':'auto'}

    if(!menu.dataset.v8Bound){
      menu.dataset.v8Bound='1';
      const openMenu=e=>{e.preventDefault();e.stopPropagation();const m=$('#dashMenu');if(m){m.classList.remove('hidden');m.style.pointerEvents='auto'}};
      menu.addEventListener('click',openMenu,true);
      menu.addEventListener('pointerup',openMenu,true);
    }
    const close=$('#closeDashMenu');
    if(close&&!close.dataset.v8Bound){
      close.dataset.v8Bound='1';close.addEventListener('click',()=>{const m=$('#dashMenu');if(m){m.classList.add('hidden');m.style.pointerEvents='none'}})
    }

    const history=$('#rideHistoryBtn');
    if(history&&!history.dataset.v8Bound){history.dataset.v8Bound='1';history.addEventListener('click',scheduleHistoryDecoration)}

    let badge=$('#rideTrackingStatus');
    if(!badge){badge=document.createElement('div');badge.id='rideTrackingStatus';badge.className='ride-tracking-status hidden';dash.querySelector('.ride-right')?.appendChild(badge)}
    if(!ride.dataset.statusTimer){
      const id=native.setInterval(()=>{
        if(!document.body.contains(ride)){native.clearInterval(id);return}
        const rec=ride.classList.contains('recording');badge.classList.toggle('hidden',!rec);
        if(rec){const t=(ride.textContent||'').replace(/^Stop Ride\s*·?\s*/i,'');badge.textContent=`● REC${t?' · '+t:''}`}
      },750);
      runtime.speedIntervals.add(id);ride.dataset.statusTimer='1';
    }
  }

  // Replace Ric tool entry with a guarded lifecycle. Any tool exception becomes visible instead of freezing the UI.
  try{
    const originalOpen=openRicTool;
    openRicTool=function(name){
      cleanupSpeed();runtime.scope=name;
      try{
        const result=originalOpen(name);
        if(name==='speedmap'){
          patchDashboard();[60,180,450].forEach(ms=>setTimeout(patchDashboard,ms));
        }
        return result;
      }catch(err){
        console.error('Ric Space tool failed:',name,err);
        const body=$('#ricToolBody');
        if(body)body.innerHTML=`<div class="tool-card"><b>Tool gagal dimuat</b><p class="tool-hint">${String(err?.message||err).replace(/[<>&]/g,'')}</p><button id="ricToolRetry" class="primary">Coba lagi</button></div>`;
        setTimeout(()=>$('#ricToolRetry')?.addEventListener('click',()=>openRicTool(name)),0);
      }finally{runtime.scope=null}
    };
  }catch(e){console.warn('Ric runtime openRicTool patch:',e)}

  try{
    const originalShow=showView;
    showView=function(id){
      if(id!=='ricToolView'&&!runtime.cleaned)cleanupSpeed();
      return originalShow(id);
    };
  }catch(e){console.warn('Ric runtime showView patch:',e)}

  window.addEventListener('pagehide',cleanupSpeed,{capture:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&$('#rideDashboard')){try{speechSynthesis?.cancel?.()}catch(e){}}});
})();