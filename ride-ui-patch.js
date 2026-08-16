(()=>{
  let activeDash=null;
  let statusTimer=null;
  const $=s=>document.querySelector(s);

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
          row.remove();
          setStatus('Ride history dihapus');
          setTimeout(()=>$('#rideHistoryBtn')?.click(),50);
        }catch(err){del.disabled=false;del.textContent='Hapus';alert('Gagal hapus ride: '+err.message)}
      });
      row.appendChild(del);
    });
    const card=$('.ride-history-card');
    const head=$('.ride-history-head');
    if(card&&head&&!$('#rideDeleteAll')){
      const actions=document.createElement('div');actions.className='ride-history-actions';
      actions.innerHTML='<button id="rideDeleteAll" type="button">Hapus semua histori</button>';
      head.insertAdjacentElement('afterend',actions);
      actions.querySelector('button').addEventListener('click',async()=>{
        if(!confirm('Hapus SEMUA Ride History dan seluruh tracking GPS? Tindakan ini tidak bisa dibatalkan.'))return;
        const btn=$('#rideDeleteAll');btn.disabled=true;btn.textContent='Menghapus...';
        try{
          const n=await rpc('vt_ride_delete_all',{p_anonymous_key:userKey()});
          setStatus(`${Number(n)||0} ride dihapus`);
          setTimeout(()=>$('#rideHistoryBtn')?.click(),50);
        }catch(err){alert('Gagal hapus histori: '+err.message)}
        finally{btn.disabled=false;btn.textContent='Hapus semua histori'}
      });
    }
  }

  function startStatusTicker(ride,badge){
    if(statusTimer)clearInterval(statusTimer);
    statusTimer=setInterval(()=>{
      if(!document.body.contains(ride)){clearInterval(statusTimer);statusTimer=null;return}
      const rec=ride.classList.contains('recording');
      if(rec){
        badge.classList.remove('hidden');
        const t=(ride.textContent||'').replace(/^Stop Ride\s*·?\s*/i,'');
        badge.textContent=`● REC${t?' · '+t:''}`;
      }else if(!badge.classList.contains('hidden')){
        badge.classList.add('hidden');
      }
    },700);
  }

  function patchDashboard(){
    const dash=$('#rideDashboard'),controls=dash?.querySelector('.ride-controls');
    const compass=$('#compassBtn'),voice=$('#voiceBtn'),ride=$('#rideTrackingBtn'),full=$('#dashFullscreen'),menu=$('#dashMenuBtn');
    if(!dash||!controls||!compass||!voice||!ride||!full||!menu)return false;

    if(activeDash!==dash){activeDash=dash;dash.classList.add('ride-ui-v8')}
    controls.classList.add('ride-controls-v8');
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
      menu.addEventListener('pointerdown',openMenu,{capture:true});
      menu.addEventListener('click',openMenu,{capture:true});
    }
    const close=$('#closeDashMenu');
    if(close&&!close.dataset.v8Bound){
      close.dataset.v8Bound='1';
      close.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();const m=$('#dashMenu');if(m){m.classList.add('hidden');m.style.pointerEvents='none'}});
    }

    let badge=$('#rideTrackingStatus');
    if(!badge){badge=document.createElement('div');badge.id='rideTrackingStatus';badge.className='ride-tracking-status hidden';dash.querySelector('.ride-right')?.appendChild(badge)}
    startStatusTicker(ride,badge);
    return true;
  }

  function patchWhenReady(){
    [0,60,180,420,900].forEach(ms=>setTimeout(()=>patchDashboard(),ms));
  }
  function decorateHistoryWhenReady(){
    [50,180,450,900,1500].forEach(ms=>setTimeout(decorateHistory,ms));
  }

  document.addEventListener('DOMContentLoaded',patchWhenReady,{once:true});
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-tool="speedmap"]'))patchWhenReady();
    if(e.target.closest('#rideHistoryBtn'))decorateHistoryWhenReady();
    if(e.target.closest('#dashMenuBtn'))setTimeout(patchDashboard,0);
  },true);
  window.addEventListener('pageshow',()=>{if($('#rideDashboard'))patchWhenReady()});
  patchWhenReady();
})();