(()=>{
  const ACTIVE_KEY='ric_active_ride';
  const BUFFER_KEY='ric_ride_buffer_v1';
  const LEGACY_RECOVERY_KEY='ric_ride_recovery_v1';
  const QUEUE_KEY='ric_ride_recovery_queue_v2';
  const LOCAL_HISTORY_KEY='ric_ride_local_history_v2';
  const LOAD_ID=`${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  function writeJson(key,value){
    try{localStorage.setItem(key,JSON.stringify(value));return true}catch(e){return false}
  }
  function readQueue(){
    const value=readJson(QUEUE_KEY,[]);
    return Array.isArray(value)?value:[];
  }
  function writeQueue(queue){
    writeJson(QUEUE_KEY,(Array.isArray(queue)?queue:[]).slice(-12));
  }
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
  function stats(points,startedAt,endedAt){
    const pts=normalizePoints(points);
    let distance=0,speedSum=0,speedSamples=0,maxSpeed=0,maxL=0,maxR=0;
    for(let i=0;i<pts.length;i++){
      const p=pts[i];
      if(i){const d=hav(pts[i-1],p);if(Number.isFinite(d)&&d<1000)distance+=d}
      const s=Math.max(0,Number(p.speed_kmh)||0);maxSpeed=Math.max(maxSpeed,s);speedSum+=s;speedSamples++;
      const lean=Number(p.lean_deg)||0;if(lean<0)maxL=Math.max(maxL,Math.abs(lean));else maxR=Math.max(maxR,Math.abs(lean));
    }
    const start=Number(startedAt)||Date.now(),end=Math.max(start,Number(endedAt)||Date.now());
    return {pts,distance,duration:Math.max(1,Math.round((end-start)/1000)),avg:speedSamples?speedSum/speedSamples:0,maxSpeed,maxL,maxR,start:pts[0]||null,end:pts[pts.length-1]||null};
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
  function snapshotActive(reason='checkpoint',confirmedClose=false){
    const active=readJson(ACTIVE_KEY,null);if(!active?.rideId)return null;
    const now=Date.now();
    const entry={
      rideId:active.rideId,startedAt:Number(active.startedAt)||now,endedAt:now,savedAt:now,
      reason,confirmedClose,ownerLoadId:LOAD_ID,points:normalizePoints(readJson(BUFFER_KEY,[]))
    };
    const queue=readQueue();
    const i=queue.findIndex(x=>String(x?.rideId)===String(entry.rideId));
    if(i>=0){
      const old=queue[i]||{};
      queue[i]={...old,...entry,confirmedClose:Boolean(old.confirmedClose||confirmedClose),points:normalizePoints([...(old.points||[]),...entry.points])};
    }else queue.push(entry);
    writeQueue(queue);
    writeJson(ACTIVE_KEY,{...active,pendingRecovery:true,lastSavedAt:now,lastClosedAt:confirmedClose?now:active.lastClosedAt||null});
    return entry;
  }
  function removeTentativeSnapshot(){
    const active=readJson(ACTIVE_KEY,null);if(!active?.rideId)return;
    const queue=readQueue().filter(x=>String(x?.rideId)!==String(active.rideId)||x.confirmedClose);
    writeQueue(queue);
  }
  function clearCurrentTentative(){
    writeQueue(readQueue().filter(x=>x?.confirmedClose||x?.ownerLoadId!==LOAD_ID));
  }
  function saveLocalSummary(entry,s){
    const history=readJson(LOCAL_HISTORY_KEY,[]);
    const rows=Array.isArray(history)?history:[];
    const row={id:entry.rideId,started_at:new Date(entry.startedAt).toISOString(),ended_at:new Date(entry.endedAt).toISOString(),duration_sec:s.duration,distance_m:s.distance,avg_speed_kmh:s.avg,max_speed_kmh:s.maxSpeed,max_lean_left:s.maxL,max_lean_right:s.maxR,saved_at:new Date().toISOString(),pending_cloud:true};
    const i=rows.findIndex(x=>String(x?.id)===String(row.id));
    if(i>=0)rows[i]={...rows[i],...row};else rows.unshift(row);
    writeJson(LOCAL_HISTORY_KEY,rows.slice(0,100));
  }
  function markLocalSynced(rideId){
    const history=readJson(LOCAL_HISTORY_KEY,[]);
    if(!Array.isArray(history))return;
    const row=history.find(x=>String(x?.id)===String(rideId));
    if(row){row.pending_cloud=false;row.synced_at=new Date().toISOString();writeJson(LOCAL_HISTORY_KEY,history)}
  }
  function finishBestEffort(entry){
    if(!entry?.rideId)return;
    const s=stats(entry.points,entry.startedAt,entry.endedAt);
    saveLocalSummary(entry,s);
    rpc('vt_ride_finish',{
      p_ride_id:entry.rideId,p_anonymous_key:userKey(),p_distance_m:s.distance,p_duration_sec:s.duration,
      p_avg_speed_kmh:s.avg,p_max_speed_kmh:s.maxSpeed,p_max_lean_left:s.maxL,p_max_lean_right:s.maxR,
      p_start_lat:s.start?.lat??null,p_start_lng:s.start?.lng??null,p_end_lat:s.end?.lat??null,p_end_lng:s.end?.lng??null
    },true).catch(()=>{});
  }
  function markPendingClose(reason='pagehide'){
    const entry=snapshotActive(reason,true);if(entry)finishBestEffort(entry);
  }
  function migrateLegacyRecovery(){
    const legacy=readJson(LEGACY_RECOVERY_KEY,null);
    const active=readJson(ACTIVE_KEY,null);
    if(!legacy?.rideId&&!active?.rideId)return;
    const rideId=legacy?.rideId||active.rideId;
    const queue=readQueue();
    if(!queue.some(x=>String(x?.rideId)===String(rideId))){
      const now=Number(legacy?.savedAt)||Date.now();
      queue.push({rideId,startedAt:Number(legacy?.startedAt||active?.startedAt)||now,endedAt:now,savedAt:now,reason:'legacy',confirmedClose:true,points:normalizePoints(readJson(BUFFER_KEY,[]))});
      writeQueue(queue);
    }
    localStorage.removeItem(LEGACY_RECOVERY_KEY);
  }
  async function recoverEntry(entry){
    const uid=userKey();
    let serverPts=[];
    try{serverPts=await rpc('vt_ride_track',{p_ride_id:entry.rideId,p_anonymous_key:uid})||[]}catch(e){}
    const active=readJson(ACTIVE_KEY,null);
    const currentLocal=String(active?.rideId)===String(entry.rideId)?readJson(BUFFER_KEY,[]):[];
    const localPts=normalizePoints([...(entry.points||[]),...currentLocal]);
    const serverSeq=new Set((Array.isArray(serverPts)?serverPts:[]).map(p=>String(p.seq)));
    const pending=localPts.filter(p=>!serverSeq.has(String(p.seq)));
    for(let i=0;i<pending.length;i+=40){
      await rpc('vt_ride_append',{p_ride_id:entry.rideId,p_anonymous_key:uid,p_points:pending.slice(i,i+40)});
    }
    let allPts=[];
    try{allPts=await rpc('vt_ride_track',{p_ride_id:entry.rideId,p_anonymous_key:uid})||[]}catch(e){allPts=[...(Array.isArray(serverPts)?serverPts:[]),...localPts]}
    const s=stats(allPts,entry.startedAt,entry.endedAt||entry.savedAt);
    saveLocalSummary(entry,s);
    await rpc('vt_ride_finish',{
      p_ride_id:entry.rideId,p_anonymous_key:uid,p_distance_m:s.distance,p_duration_sec:s.duration,
      p_avg_speed_kmh:s.avg,p_max_speed_kmh:s.maxSpeed,p_max_lean_left:s.maxL,p_max_lean_right:s.maxR,
      p_start_lat:s.start?.lat??null,p_start_lng:s.start?.lng??null,p_end_lat:s.end?.lat??null,p_end_lng:s.end?.lng??null
    });
    markLocalSynced(entry.rideId);
    if(String(active?.rideId)===String(entry.rideId)){
      localStorage.removeItem(ACTIVE_KEY);localStorage.setItem(BUFFER_KEY,'[]');
    }
  }
  async function recoverPendingRides(){
    if(recovering)return;
    migrateLegacyRecovery();
    const active=readJson(ACTIVE_KEY,null);
    if(active?.rideId&&!readQueue().some(x=>String(x?.rideId)===String(active.rideId)))snapshotActive('startup-recovery',true);
    const queue=readQueue().filter(x=>x?.confirmedClose||x?.ownerLoadId!==LOAD_ID);if(!queue.length)return;
    recovering=true;
    try{
      for(const entry of queue){
        try{
          await recoverEntry(entry);
          writeQueue(readQueue().filter(x=>String(x?.rideId)!==String(entry.rideId)));
          console.info('Ric Ride: ride dipulihkan dan tersimpan otomatis.',entry.rideId);
        }catch(e){
          const current=readQueue();const i=current.findIndex(x=>String(x?.rideId)===String(entry.rideId));
          if(i>=0)current[i]={...current[i],lastError:String(e?.message||e),lastAttemptAt:Date.now()};
          writeQueue(current);console.warn('Ric Ride autosave recovery:',e);
        }
      }
    }finally{recovering=false}
  }

  // Visibility is the last reliable signal before Android kills an installed PWA.
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden')snapshotActive('hidden',false);
    else removeTentativeSnapshot();
  },{capture:true});
  window.addEventListener('pagehide',e=>{if(!e.persisted)markPendingClose('pagehide')},{capture:true});
  window.addEventListener('beforeunload',()=>markPendingClose('beforeunload'),{capture:true});
  document.addEventListener('freeze',()=>markPendingClose('freeze'),{capture:true});
  window.addEventListener('online',()=>setTimeout(recoverPendingRides,300));

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(recoverPendingRides,700),{once:true});
  else setTimeout(recoverPendingRides,700);
  setInterval(()=>{
    if(readJson(ACTIVE_KEY,null)?.rideId)snapshotActive('checkpoint',false);
    else clearCurrentTentative();
  },2000);
  setInterval(()=>{if(navigator.onLine!==false)recoverPendingRides()},30000);
})();
