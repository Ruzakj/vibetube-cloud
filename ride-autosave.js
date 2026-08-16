(()=>{
  const ACTIVE_KEY='ric_active_ride';
  const BUFFER_KEY='ric_ride_buffer_v1';
  const RECOVERY_KEY='ric_ride_recovery_v1';
  let recovering=false;

  function cloud(){
    const url=(window.VIBETUBE_CLOUD_URL||localStorage.getItem('vt_supabase_url')||'').trim().replace(/\/$/,'');
    const key=(window.VIBETUBE_CLOUD_KEY||localStorage.getItem('vt_supabase_key')||'').trim();
    return {url,key};
  }
  function userKey(){
    try{if(typeof window.getUserId==='function')return window.getUserId()}catch(e){}
    let id=localStorage.getItem('vt_user_id');
    if(!id){id='vt_'+crypto.randomUUID();localStorage.setItem('vt_user_id',id)}
    return id;
  }
  function readJson(key,fallback){
    try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch(e){return fallback}
  }
  function writeJson(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch(e){}}
  function hav(a,b){
    if(!a||!b)return 0;
    const R=6371000,r=x=>x*Math.PI/180;
    const d1=r(Number(b.lat)-Number(a.lat)),d2=r(Number(b.lng)-Number(a.lng));
    const q=Math.sin(d1/2)**2+Math.cos(r(Number(a.lat)))*Math.cos(r(Number(b.lat)))*Math.sin(d2/2)**2;
    return 2*R*Math.atan2(Math.sqrt(q),Math.sqrt(Math.max(0,1-q)));
  }
  function normalizePoints(points){
    const seen=new Set();
    return (Array.isArray(points)?points:[]).filter(p=>p&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng))).filter(p=>{
      const k=`${p.seq??''}|${p.recorded_at??''}|${Number(p.lat).toFixed(6)}|${Number(p.lng).toFixed(6)}`;
      if(seen.has(k))return false;seen.add(k);return true;
    }).sort((a,b)=>{
      const sa=Number(a.seq),sb=Number(b.seq);
      if(Number.isFinite(sa)&&Number.isFinite(sb)&&sa!==sb)return sa-sb;
      return new Date(a.recorded_at||0)-new Date(b.recorded_at||0);
    });
  }
  function stats(points,startedAt){
    const pts=normalizePoints(points);
    let distance=0,speedSum=0,speedSamples=0,maxSpeed=0,maxL=0,maxR=0;
    for(let i=0;i<pts.length;i++){
      const p=pts[i];
      if(i){const d=hav(pts[i-1],p);if(Number.isFinite(d)&&d<1000)distance+=d}
      const s=Math.max(0,Number(p.speed_kmh)||0);maxSpeed=Math.max(maxSpeed,s);speedSum+=s;speedSamples++;
      const lean=Number(p.lean_deg)||0;if(lean<0)maxL=Math.max(maxL,Math.abs(lean));else maxR=Math.max(maxR,Math.abs(lean));
    }
    return {
      pts,distance,duration:Math.max(1,Math.round((Date.now()-Number(startedAt||Date.now()))/1000)),
      avg:speedSamples?speedSum/speedSamples:0,maxSpeed,maxL,maxR,
      start:pts[0]||null,end:pts[pts.length-1]||null
    };
  }
  async function rpc(name,body,keepalive=false){
    const {url,key}=cloud();if(!url||!key)throw new Error('Cloud belum dikonfigurasi');
    const r=await fetch(`${url}/rest/v1/rpc/${name}`,{
      method:'POST',cache:'no-store',keepalive,
      headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json','Cache-Control':'no-cache'},
      body:JSON.stringify(body)
    });
    const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.message||d?.error||`HTTP ${r.status}`);return d;
  }
  function markPendingClose(){
    const active=readJson(ACTIVE_KEY,null);if(!active?.rideId)return;
    writeJson(ACTIVE_KEY,{...active,pendingRecovery:true,lastClosedAt:Date.now()});
    writeJson(RECOVERY_KEY,{rideId:active.rideId,startedAt:active.startedAt||Date.now(),savedAt:Date.now()});

    // Best effort: mark the Supabase session finished immediately when the PWA really closes.
    // Local state is intentionally kept until next launch, so the next startup can repair/refine it.
    const s=stats(readJson(BUFFER_KEY,[]),active.startedAt);
    rpc('vt_ride_finish',{
      p_ride_id:active.rideId,p_anonymous_key:userKey(),p_distance_m:s.distance,p_duration_sec:s.duration,
      p_avg_speed_kmh:s.avg,p_max_speed_kmh:s.maxSpeed,p_max_lean_left:s.maxL,p_max_lean_right:s.maxR,
      p_start_lat:s.start?.lat??null,p_start_lng:s.start?.lng??null,p_end_lat:s.end?.lat??null,p_end_lng:s.end?.lng??null
    },true).catch(()=>{});
  }
  async function recoverPendingRide(){
    if(recovering)return;
    const active=readJson(ACTIVE_KEY,null);if(!active?.rideId)return;
    recovering=true;
    try{
      const uid=userKey();
      let serverPts=[];
      try{serverPts=await rpc('vt_ride_track',{p_ride_id:active.rideId,p_anonymous_key:uid})||[]}catch(e){}
      const localPts=normalizePoints(readJson(BUFFER_KEY,[]));
      const serverSeq=new Set((Array.isArray(serverPts)?serverPts:[]).map(p=>String(p.seq)));
      const pending=localPts.filter(p=>!serverSeq.has(String(p.seq)));
      for(let i=0;i<pending.length;i+=40){
        await rpc('vt_ride_append',{p_ride_id:active.rideId,p_anonymous_key:uid,p_points:pending.slice(i,i+40)});
      }
      let allPts=[];
      try{allPts=await rpc('vt_ride_track',{p_ride_id:active.rideId,p_anonymous_key:uid})||[]}catch(e){allPts=[...(Array.isArray(serverPts)?serverPts:[]),...localPts]}
      const s=stats(allPts,active.startedAt);
      await rpc('vt_ride_finish',{
        p_ride_id:active.rideId,p_anonymous_key:uid,p_distance_m:s.distance,p_duration_sec:s.duration,
        p_avg_speed_kmh:s.avg,p_max_speed_kmh:s.maxSpeed,p_max_lean_left:s.maxL,p_max_lean_right:s.maxR,
        p_start_lat:s.start?.lat??null,p_start_lng:s.start?.lng??null,p_end_lat:s.end?.lat??null,p_end_lng:s.end?.lng??null
      });
      localStorage.removeItem(ACTIVE_KEY);localStorage.removeItem(RECOVERY_KEY);localStorage.setItem(BUFFER_KEY,'[]');
      console.info('Ric Ride: ride sebelumnya dipulihkan dan tersimpan otomatis.');
    }catch(e){
      console.warn('Ric Ride autosave recovery:',e);
      writeJson(RECOVERY_KEY,{rideId:active.rideId,startedAt:active.startedAt||Date.now(),savedAt:Date.now(),error:String(e?.message||e)});
    }finally{recovering=false}
  }

  window.addEventListener('pagehide',e=>{if(!e.persisted)markPendingClose()},{capture:true});
  window.addEventListener('beforeunload',markPendingClose,{capture:true});
  document.addEventListener('freeze',markPendingClose,{capture:true});

  // Any active ride left by a killed/closed PWA is finalized automatically on next launch.
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(recoverPendingRide,500),{once:true});
  else setTimeout(recoverPendingRide,500);
})();