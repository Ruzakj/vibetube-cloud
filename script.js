const CATEGORIES=[
 {slug:"jawa",name:"Jawa"},{slug:"barat",name:"Barat"},{slug:"indo",name:"Indo"},{slug:"galau",name:"Galau"},
 {slug:"morning-vibes",name:"Morning Vibes"},{slug:"pop-punk",name:"Pop Punk"},{slug:"nightcore",name:"Nightcore"},
 {slug:"japanese-nightcore",name:"Japanese Nightcore"}
];
const JP_PLAYLIST="PLsWiDGlW9Vst4Vrc0IhVIdRYeurX7rV8z";
const state={
 category:sessionStorage.getItem("vt_category")||localStorage.getItem("vt_last_category")||"indo",
 queue:[],index:0,playing:false,player:null,ready:false,search:[],cloud:false,mixToken:0,
 mode:localStorage.getItem("vt_player_mode")||"music",timer:null, smartMix:localStorage.getItem("vt_smart_mix")!=="0",
 userStarted:false,lastKnownPosition:0,lastKnownDuration:0,lastPersistAt:0,
 backgroundedAt:0,resumeTimer:null,recoveryAttempts:0,jpPlaylistIndex:0
};
const $=s=>document.querySelector(s);
const on=(sel,event,fn)=>{const el=$(sel);if(el)el.addEventListener(event,fn);return el};
function ytThumb(id){return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function titleFor(s){const t=String(s?.title||"").trim();return t&&!/^youtube (video|track)\s*\d*$/i.test(t)?t:"Unknown title"}
function artistFor(s){return String(s?.artist||s?.channel||"YouTube").trim()||"YouTube"}
function mediaSessionSupported(){return "mediaSession" in navigator && "MediaMetadata" in window}
function currentTrackInfo(){
 if(state.category==="japanese-nightcore"&&state.player&&state.ready){
  try{const d=state.player.getVideoData?.()||{};return {youtube_id:d.video_id||"",title:d.title||"Japanese Nightcore",artist:d.author||"YouTube"}}catch(e){}
 }
 return state.queue[state.index]||null
}

const PLAYBACK_STATE_KEY="vt_playback_state_v70";
function safePlayerState(){
 try{return state.player?.getPlayerState?.()}catch(e){return null}
}
function persistPlaybackState(force=false){
 const now=Date.now();
 if(!force && now-state.lastPersistAt<1200)return;
 state.lastPersistAt=now;
 let position=state.lastKnownPosition||0,duration=state.lastKnownDuration||0,videoId="",jpIndex=state.jpPlaylistIndex||0;
 if(state.player&&state.ready){
  try{position=Number(state.player.getCurrentTime?.()||position||0)}catch(e){}
  try{duration=Number(state.player.getDuration?.()||duration||0)}catch(e){}
  try{videoId=state.player.getVideoData?.()?.video_id||""}catch(e){}
  if(state.category==="japanese-nightcore"){try{jpIndex=Number(state.player.getPlaylistIndex?.()||0)}catch(e){}}
 }
 const payload={
  version:70,category:state.category,queue:state.queue,index:state.index,
  videoId,position,duration,jpIndex,mode:state.mode,
  userStarted:state.userStarted,wasPlaying:state.playing||safePlayerState()===1,
  savedAt:now
 };
 try{localStorage.setItem(PLAYBACK_STATE_KEY,JSON.stringify(payload));localStorage.setItem("vt_last_category",state.category)}catch(e){}
}
function restorePlaybackState(){
 let p=null;try{p=JSON.parse(localStorage.getItem(PLAYBACK_STATE_KEY)||"null")}catch(e){}
 if(!p||p.version!==70||Date.now()-Number(p.savedAt||0)>12*60*60*1000)return null;
 if(p.category&&CATEGORIES.some(c=>c.slug===p.category)){state.category=p.category;sessionStorage.setItem("vt_category",p.category)}
 if(Array.isArray(p.queue)&&p.queue.length){state.queue=p.queue.filter(x=>x&&x.youtube_id);state.index=Math.min(Math.max(Number(p.index)||0,0),Math.max(0,state.queue.length-1))}
 if(p.mode==="music"||p.mode==="video")state.mode=p.mode;
 state.userStarted=!!p.userStarted;
 state.lastKnownPosition=Math.max(0,Number(p.position)||0);
 state.lastKnownDuration=Math.max(0,Number(p.duration)||0);
 state.jpPlaylistIndex=Math.max(0,Number(p.jpIndex)||0);
 return p;
}
function snapshotBeforeBackground(){
 state.backgroundedAt=Date.now();
 syncProgress();
 persistPlaybackState(true);
 installMediaSessionHandlers();
}
function attemptResumeRecovery(reason="visible"){
 if(!state.player||!state.ready||!state.userStarted)return;
 clearTimeout(state.resumeTimer);
 state.resumeTimer=setTimeout(()=>{
  try{
   reclaimMediaSession();
   const ps=safePlayerState();
   const current=Number(state.player.getCurrentTime?.()||0);
   // Only recover after a lifecycle suspension/stall. Never change tracks here.
   if(state.playing && ps!==YT.PlayerState.PLAYING && ps!==YT.PlayerState.BUFFERING){
    state.recoveryAttempts++;
    state.player.playVideo();
   }
   if(state.lastKnownPosition>0 && current+4<state.lastKnownPosition && ps!==YT.PlayerState.ENDED){
    state.player.seekTo(state.lastKnownPosition,true);
   }
   updateMediaSessionMetadata();
   updateMediaSessionPlayback();
   updateMediaSessionPosition();
   startProgress();
   persistPlaybackState(true);
  }catch(e){console.warn("Background recovery",reason,e)}
 },180);
}
function setupBackgroundResilience(){
 document.addEventListener("visibilitychange",()=>{
  if(document.hidden)snapshotBeforeBackground();
  else attemptResumeRecovery("visibility");
 });
 window.addEventListener("pagehide",()=>persistPlaybackState(true));
 window.addEventListener("pageshow",()=>attemptResumeRecovery("pageshow"));
 window.addEventListener("focus",()=>attemptResumeRecovery("focus"));
 document.addEventListener("freeze",()=>persistPlaybackState(true));
 document.addEventListener("resume",()=>attemptResumeRecovery("resume"));
 window.addEventListener("beforeunload",()=>persistPlaybackState(true));
}
function updateMediaSessionMetadata(track=currentTrackInfo()){
 if(!mediaSessionSupported()||!track)return;
 const id=track.youtube_id||track.video_id||"";
 try{
  navigator.mediaSession.metadata=new MediaMetadata({
   title:titleFor(track),
   artist:artistFor(track),
   album:state.category==="japanese-nightcore"?"Japanese Nightcore":"VibeTube Music",
   artwork:id?[
    {src:`https://i.ytimg.com/vi/${encodeURIComponent(id)}/mqdefault.jpg`,sizes:"320x180",type:"image/jpeg"},
    {src:`https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`,sizes:"480x360",type:"image/jpeg"}
   ]:[]
  });
 }catch(e){console.warn("MediaSession metadata:",e)}
}
function updateMediaSessionPlayback(){
 if(!mediaSessionSupported())return;
 try{navigator.mediaSession.playbackState=state.playing?"playing":"paused"}catch(e){}
}
function updateMediaSessionPosition(){
 if(!mediaSessionSupported()||!state.player||!state.ready)return;
 try{
  const duration=Number(state.player.getDuration?.()||0),position=Number(state.player.getCurrentTime?.()||0),rate=Number(state.player.getPlaybackRate?.()||1);
  if(duration>0&&Number.isFinite(duration)&&Number.isFinite(position)) navigator.mediaSession.setPositionState({duration,playbackRate:rate>0?rate:1,position:Math.min(Math.max(position,0),duration)});
 }catch(e){}
}
let mediaSessionReclaimTimers=[];
function mediaNextFromNotification(){
 if(!state.player||!state.ready)return;
 recordSkipCurrent();
 if(state.category==="japanese-nightcore"){
  try{state.player.nextVideo();setTimeout(syncJapaneseMeta,350);return}catch(e){console.warn("Media next JP:",e)}
 }
 if(!state.queue.length)return;
 const target=state.index+1;
 if(target<state.queue.length){
  playIndex(target);
 }else{
  generateMix("media_next_queue_end").then(()=>{if(state.queue.length)playIndex(0)}).catch(e=>console.warn("Media next mix:",e));
 }
}
function mediaPreviousFromNotification(){
 if(!state.player||!state.ready)return;
 recordSkipCurrent();
 if(state.category==="japanese-nightcore"){
  try{state.player.previousVideo();setTimeout(syncJapaneseMeta,350);return}catch(e){console.warn("Media previous JP:",e)}
 }
 if(!state.queue.length)return;
 let current=0;try{current=Number(state.player.getCurrentTime?.()||0)}catch(e){}
 // Common media-player behavior: if we're >3s into a track, Previous restarts it.
 if(current>3){try{state.player.seekTo(0,true);return}catch(e){}}
 const target=Math.max(0,state.index-1);
 if(target===state.index){try{state.player.seekTo(0,true)}catch(e){};return}
 playIndex(target);
}
function installMediaSessionHandlers(){
 if(!mediaSessionSupported())return;
 const handlers={
  play:()=>{try{state.userStarted=true;state.player?.playVideo?.();persistPlaybackState(true)}catch(e){}},
  pause:()=>{try{state.player?.pauseVideo?.();persistPlaybackState(true)}catch(e){}},
  previoustrack:mediaPreviousFromNotification,
  nexttrack:mediaNextFromNotification,
  seekbackward:d=>{try{const step=d.seekOffset||10;state.player.seekTo(Math.max(0,(state.player.getCurrentTime()||0)-step),true)}catch(e){}},
  seekforward:d=>{try{const step=d.seekOffset||10,dur=state.player.getDuration()||0;state.player.seekTo(Math.min(dur,(state.player.getCurrentTime()||0)+step),true)}catch(e){}},
  seekto:d=>{try{if(typeof d.seekTime==="number")state.player.seekTo(d.seekTime,true)}catch(e){}},
  stop:()=>{try{state.player?.stopVideo?.();state.playing=false;updatePlayIcon();updateMediaSessionPlayback()}catch(e){}}
 };
 Object.entries(handlers).forEach(([action,handler])=>{try{navigator.mediaSession.setActionHandler(action,handler)}catch(e){console.warn("MediaSession action unsupported:",action,e)}});
 updateMediaSessionMetadata();
 updateMediaSessionPlayback();
}
function reclaimMediaSession(){
 if(!mediaSessionSupported())return;
 mediaSessionReclaimTimers.forEach(clearTimeout);
 mediaSessionReclaimTimers=[];
 // YouTube's iframe can update its own media session as playback starts.
 // Re-apply VibeTube handlers/metadata after those state transitions.
 [0,120,450,1200].forEach(ms=>mediaSessionReclaimTimers.push(setTimeout(()=>{
  installMediaSessionHandlers();
  updateMediaSessionMetadata();
  updateMediaSessionPosition();
 },ms)));
}
function setupMediaSession(){
 installMediaSessionHandlers();
}
function renderChips(){const box=$("#chips");if(!box)return;if(!box.children.length)box.innerHTML=CATEGORIES.map(c=>`<button class="chip" data-cat="${c.slug}">${c.name}</button>`).join("");box.querySelectorAll(".chip").forEach(b=>b.classList.toggle("active",b.dataset.cat===state.category));}
function renderPlaylists(){const box=$("#playlistGrid");if(!box)return;box.innerHTML=CATEGORIES.map(c=>`<button class="playlist-card" data-cat="${c.slug}"><span class="playlist-icon">♫</span><span class="playlist-copy"><b>${c.name}</b><small>${c.slug==="japanese-nightcore"?"Official YouTube playlist":"Cloud catalog · fresh mix"}</small></span><span class="playlist-arrow">›</span></button>`).join("");}
function renderSongs(){const list=state.queue;$("#songList").innerHTML=list.length?list.map((s,i)=>`<button class="song ${i===state.index?"current":""}" data-i="${i}"><img class="thumb" src="${ytThumb(s.youtube_id)}" loading="lazy" alt=""><span class="song-copy"><span class="song-title">${esc(titleFor(s))}</span><span class="song-artist">${esc(artistFor(s))}</span></span><span class="song-action">${i===state.index&&state.playing?"❚❚":"▶"}</span></button>`).join(""):`<div class="card"><b>Catalog kosong</b><p class="muted">Tambahkan katalog cloud atau gunakan pencarian manual.</p></div>`}
function localCatalog(cat){const raw=JSON.parse(localStorage.getItem("vt_catalog")||"[]");return raw.filter(x=>!cat||x.category===cat)}
function setCloudStatus(text){const el=$("#cloudStatus");if(el)el.textContent=text}
function freshLocalMix(cat,n=20){let a=localCatalog(cat);for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}const recent=JSON.parse(localStorage.getItem("vt_recent")||"[]");const unseen=a.filter(x=>!recent.includes(x.youtube_id));const pool=unseen.length>=Math.min(n,a.length)?unseen:a;const out=pool.slice(0,n);localStorage.setItem("vt_recent",JSON.stringify([...out.map(x=>x.youtube_id),...recent].slice(0,Math.max(100,a.length||100))));return out}
const catalogSyncState={};
async function syncCatalogCategory(category,target=200,force=false){
 const now=Date.now();
 if(!force&&catalogSyncState[category]&&now-catalogSyncState[category]<5*60*1000)return {skipped:true,category};
 catalogSyncState[category]=now;
 const url=(window.VIBETUBE_CLOUD_URL||localStorage.getItem("vt_supabase_url")||"").trim();
 const key=(window.VIBETUBE_CLOUD_KEY||localStorage.getItem("vt_supabase_key")||"").trim();
 if(!url||!key)throw new Error("Cloud belum dikonfigurasi");
 if(category==="japanese-nightcore")return {ok:true,category,skipped:"special_playlist"};
 const base=url.replace(/\/$/,"");
 setCloudStatus(`Sync ${category}…`);
 const r=await fetch(base+"/functions/v1/vibetube-catalog-sync-v2",{
  method:"POST",cache:"no-store",
  headers:{"Content-Type":"application/json","apikey":key,"Authorization":"Bearer "+key,"Cache-Control":"no-cache"},
  body:JSON.stringify({category,target})
 });
 const d=await r.json().catch(()=>({}));
 if(!r.ok||!d.ok)throw new Error(d.error||`Catalog sync HTTP ${r.status}`);
 setCloudStatus(`Catalog ${category}: ${d.after||d.before||0} aktif`);
 return d;
}
async function ensureCatalog(category){
 try{return await syncCatalogCategory(category,200,false)}
 catch(e){console.warn("Catalog sync:",e);setCloudStatus("Catalog sync gagal: "+e.message);return null}
}
async function syncAllCatalogs(){
 const btn=$("#syncCatalogBtn"),status=$("#catalogCount");
 const cats=CATEGORIES.map(c=>c.slug).filter(c=>c!=="japanese-nightcore");
 if(btn){btn.disabled=true;btn.textContent="Sync massal…"}
 let ok=0,fail=0,totalAdded=0,empty=0;
 try{
  for(let i=0;i<cats.length;i++){
   const cat=cats[i];
   if(status)status.textContent=`${i+1}/${cats.length} · ${cat}`;
   try{
    delete catalogSyncState[cat];
    const d=await syncCatalogCategory(cat,200,true);
    const added=Number(d?.added||0);
    totalAdded+=added;
    if(added===0)empty++;
    ok++;
    if(status)status.textContent=`${i+1}/${cats.length} · ${cat} · +${added}`;
   }catch(e){
    fail++;
    console.warn("Mass sync",cat,e);
   }
   await refreshCatalogStats();
  }
  if(status)status.textContent=totalAdded>0
   ?`Selesai · +${totalAdded} lagu · ${ok} kategori${fail?` · ${fail} gagal`:""}`
   :`Selesai tanpa lagu baru · source catalog perlu diperbaiki`;
  await generateMix("catalog_sync_all");
 }finally{
  if(btn){btn.disabled=false;btn.textContent="Isi Catalog Sekarang"}
  await refreshCatalogStats();
 }
}

let catalogStatsTimer=null;
function smartMixEnabled(){
 const el=$("#smartMixMode");
 return el?!!el.checked:state.smartMix!==false;
}
function updateSmartMixStatus(){
 const el=$("#smartMixStatus"); if(!el)return;
 el.textContent=smartMixEnabled()
  ?"Smart Mix aktif · complete menaikkan preferensi, skip menurunkannya, dan lagu lama tetap diberi ruang."
  :"Smart Mix nonaktif · memakai rotasi anti-repeat standar.";
}
async function refreshCatalogStats(){
 const url=(window.VIBETUBE_CLOUD_URL||localStorage.getItem("vt_supabase_url")||"").trim();
 const key=(window.VIBETUBE_CLOUD_KEY||localStorage.getItem("vt_supabase_key")||"").trim();
 const list=$("#catalogStatsList"),updated=$("#catalogStatsUpdated"),btn=$("#refreshStatsBtn");
 if(btn){btn.disabled=true;btn.textContent="Memuat…"}
 if(list)list.innerHTML='<span class="muted">Mengambil statistik langsung dari Supabase…</span>';
 if(!url||!key){
  if(list)list.innerHTML='<span class="muted">Cloud belum dikonfigurasi.</span>';
  if(btn){btn.disabled=false;btn.textContent="Refresh"}
  return;
 }
 try{
  const r=await fetch(url.replace(/\/$/,"")+"/rest/v1/rpc/get_vt_catalog_stats",{
   method:"POST",cache:"no-store",
   headers:{"apikey":key,"Authorization":"Bearer "+key,"Content-Type":"application/json","Cache-Control":"no-cache"},
   body:"{}"
  });
  const rows=await r.json().catch(()=>[]);
  if(!r.ok)throw new Error(rows?.message||`HTTP ${r.status}`);
  const arr=Array.isArray(rows)?rows:[];
  const stored=arr.reduce((a,x)=>a+Number(x.total||0),0);
  const active=arr.reduce((a,x)=>a+Number(x.active||0),0);
  const inactive=arr.reduce((a,x)=>a+Number(x.inactive||0),0);
  if($("#statStored"))$("#statStored").textContent=stored.toLocaleString("id-ID");
  if($("#statActive"))$("#statActive").textContent=active.toLocaleString("id-ID");
  if($("#statInactive"))$("#statInactive").textContent=inactive.toLocaleString("id-ID");
  const order=new Map(CATEGORIES.map((c,i)=>[c.slug,i]));
  arr.sort((a,b)=>(order.get(a.category)??99)-(order.get(b.category)??99));
  if(list)list.innerHTML=arr.map(x=>{
   const c=CATEGORIES.find(c=>c.slug===x.category);
   const name=c?.name||x.category;
   const special=x.category==="japanese-nightcore";
   return `<div class="catalog-stat-row"><div><b>${esc(name)}</b><span>${special?"Playlist source khusus":"Cloud catalog"}</span></div><div class="catalog-stat-numbers"><strong>${Number(x.active||0).toLocaleString("id-ID")}</strong><span>aktif / ${Number(x.total||0).toLocaleString("id-ID")} tersimpan</span></div></div>`;
  }).join("")||'<span class="muted">Belum ada data catalog.</span>';
  if(updated)updated.textContent="Live Supabase · diperbarui "+new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
 }catch(e){
  if(list)list.innerHTML=`<span class="status">Statistik gagal: ${esc(e.message)}</span>`;
  if(updated)updated.textContent="";
 }finally{
  if(btn){btn.disabled=false;btn.textContent="Refresh"}
 }
}
function startCatalogStatsPolling(){
 clearInterval(catalogStatsTimer);
 refreshCatalogStats();
 catalogStatsTimer=setInterval(()=>{
  if($("#settingsView")?.classList.contains("active"))refreshCatalogStats();
 },15000);
}
function recordSkipCurrent(){
 if(state.category==="japanese-nightcore")return;
 const s=state.queue[state.index];
 if(s&&state.userStarted)sendEvent("skip",s);
}
async function generateMix(reason="new_mix"){if(state.category!=="japanese-nightcore")ensureCatalog(state.category).catch(()=>{});if(state.category==="japanese-nightcore"){openJP();return}const token=++state.mixToken;const url=(window.VIBETUBE_CLOUD_URL||localStorage.getItem("vt_supabase_url")||"").trim();const key=(window.VIBETUBE_CLOUD_KEY||localStorage.getItem("vt_supabase_key")||"").trim();if(url&&key){setCloudStatus("Mengambil mix baru dari cloud…");const base=url.replace(/\/$/,"");try{const r=await fetch(base+"/functions/v1/vibetube-mix",{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json","apikey":key,"Authorization":"Bearer "+key,"Cache-Control":"no-cache"},body:JSON.stringify({userId:getUserId(),category:state.category,size:20,reason,smartMix:smartMixEnabled(),nonce:crypto.randomUUID()})});const d=await r.json().catch(()=>({}));if(r.ok){if(token!==state.mixToken)return;if(d.special){openJP();return}const items=Array.isArray(d.items)?d.items.filter(x=>x&&x.youtube_id):[];if(items.length){state.cloud=true;state.queue=items;state.index=0;renderSongs();setCloudStatus(`${smartMixEnabled()?"Smart Mix":"Cloud Mix"} · ${items.length} lagu · ${reason}`);return}}throw new Error(d.error||(`Edge HTTP ${r.status}`))}catch(edgeError){console.warn("Edge Function gagal, mencoba Supabase RPC:",edgeError)}try{const rpcName=smartMixEnabled()?"generate_vt_smart_mix":"generate_vt_mix";const r=await fetch(base+"/rest/v1/rpc/"+rpcName,{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json","apikey":key,"Authorization":"Bearer "+key,"Cache-Control":"no-cache","Prefer":"return=representation"},body:JSON.stringify({p_anonymous_key:getUserId(),p_category:state.category,p_size:20})});const items=await r.json().catch(()=>[]);if(!r.ok)throw new Error((items&&items.message)||(`RPC HTTP ${r.status}`));if(!Array.isArray(items)||!items.length)throw new Error("RPC mengembalikan mix kosong");if(token!==state.mixToken)return;state.cloud=true;state.queue=items.filter(x=>x&&x.youtube_id);state.index=0;renderSongs();setCloudStatus(`${smartMixEnabled()?"Smart Mix RPC":"Cloud RPC"} · ${state.queue.length} lagu · ${reason}`);return}catch(rpcError){console.error("VibeTube Supabase RPC:",rpcError);state.cloud=false;setCloudStatus("Cloud gagal: "+rpcError.message);const local=freshLocalMix(state.category,20);state.queue=local;state.index=0;renderSongs();return}}state.queue=freshLocalMix(state.category,20);state.index=0;renderSongs()}
function getUserId(){let id=localStorage.getItem("vt_user_id");if(!id){id="vt_"+crypto.randomUUID();localStorage.setItem("vt_user_id",id)}return id}
function updatePlayIcon(){const icon=state.playing?"❚❚":"▶";$("#playBtn").textContent=icon;$("#fullPlay").textContent=icon;$("#playBtn").setAttribute("aria-label",state.playing?"Jeda":"Putar");$("#fullPlay").setAttribute("aria-label",state.playing?"Jeda":"Putar");renderSongs()}
function formatTime(sec){sec=Number(sec)||0;const m=Math.floor(sec/60);const s=Math.floor(sec%60);return `${m}:${String(s).padStart(2,"0")}`}
function syncProgress(){
 if(!state.player||!state.ready)return;
 let cur=0,dur=0;
 try{cur=state.player.getCurrentTime()||0;dur=state.player.getDuration()||0}catch(e){return}
 state.lastKnownPosition=Number(cur)||0;state.lastKnownDuration=Number(dur)||0;
 const ct=$("#currentTime"),dt=$("#durationTime"),sb=$("#seekBar");
 if(ct)ct.textContent=formatTime(cur);if(dt)dt.textContent=formatTime(dur);if(sb)sb.value=dur?Math.round(cur/dur*1000):0;
 updateMediaSessionPosition();persistPlaybackState(false);
}
function startProgress(){clearInterval(state.timer);state.timer=setInterval(syncProgress,250);syncProgress()}
function stopProgress(){clearInterval(state.timer);state.timer=null}
function setMode(mode){state.mode=mode;localStorage.setItem("vt_player_mode",mode);$("#musicVisual").classList.toggle("hidden",mode!=="music");$("#videoVisual").classList.toggle("hidden",mode!=="video");$("#musicModeBtn").classList.toggle("active",mode==="music");$("#videoModeBtn").classList.toggle("active",mode==="video");if(state.player&&state.ready){try{state.player.setSize(mode==="video"?Math.min(window.innerWidth-36,760):1,mode==="video"?Math.min(Math.round((window.innerWidth-36)*9/16),430):1)}catch(e){}}}
function playIndex(i){if(!state.queue[i])return;state.userStarted=true;state.index=i;state.lastKnownPosition=0;const s=state.queue[i];state.playing=true;$("#playerDock").classList.remove("hidden");$("#miniInfo").textContent=`${titleFor(s)} · ${artistFor(s)}`;$("#playerTitle").textContent=titleFor(s);$("#playerArtist").textContent=artistFor(s);$("#playerThumb").src=ytThumb(s.youtube_id);$("#fullPlayer").classList.remove("hidden");setMode(state.mode);if(state.ready)loadYT(s.youtube_id);updatePlayIcon();updateMediaSessionMetadata(s);updateMediaSessionPlayback();reclaimMediaSession();sendEvent("play",s);ricTrackPlay();startProgress();persistPlaybackState(true)}
function loadYT(id){state.player.loadVideoById(id)}
function next(auto=false){if(!auto)recordSkipCurrent();if(state.category==="japanese-nightcore"&&state.player&&state.ready){try{state.player.nextVideo();return}catch(e){}}if(!state.queue.length)return;if(state.index<state.queue.length-1)playIndex(state.index+1);else generateMix("queue_exhausted").then(()=>state.queue.length&&playIndex(0))}
function prev(){recordSkipCurrent();if(state.category==="japanese-nightcore"&&state.player&&state.ready){try{state.player.previousVideo();return}catch(e){}}if(state.index>0)playIndex(state.index-1)}
function togglePlay(){
 if(!state.player||!state.ready)return;
 state.userStarted=true;
 if(state.playing)state.player.pauseVideo();else state.player.playVideo();
 persistPlaybackState(true);
}
function openJP(){state.queue=[];const h=$("#sectionTitle");if(h)h.textContent="Japanese Nightcore";const list=$("#songList");if(list)list.innerHTML=`<div class="card jp-card"><b>Japanese Nightcore</b><p class="muted">Playlist YouTube asli dipertahankan utuh. Putar seluruh playlist langsung di VibeTube.</p><div class="jp-actions"><button id="playJPBtn" class="primary">▶ Putar Playlist</button><button id="shuffleJPBtn" class="ghost">⤨ Acak Playlist</button></div><p class="status">Source: playlist resmi · ${JP_PLAYLIST}</p></div>`;on("#playJPBtn","click",()=>playJapanesePlaylist(false));on("#shuffleJPBtn","click",()=>playJapanesePlaylist(true))}
function syncJapaneseMeta(){if(state.category!=="japanese-nightcore"||!state.player||!state.ready)return;try{const d=state.player.getVideoData?.()||{};const id=d.video_id||"";const title=d.title||"Japanese Nightcore";const author=d.author||"YouTube";$("#playerTitle").textContent=title;$("#playerArtist").textContent=author;$("#miniInfo").textContent=`${title} · ${author}`;if(id)$("#playerThumb").src=ytThumb(id);updateMediaSessionMetadata({youtube_id:id,title,artist:author})}catch(e){}}
function playJapanesePlaylist(shuffle=false){state.userStarted=true;if(!state.ready||!state.player){setCloudStatus("Player YouTube sedang disiapkan…");return}state.playing=true;$("#playerDock")?.classList.remove("hidden");$("#fullPlayer")?.classList.remove("hidden");setMode(state.mode);try{state.player.loadPlaylist({list:JP_PLAYLIST,listType:"playlist",index:0,startSeconds:0});setTimeout(()=>{try{state.player.setShuffle(!!shuffle);if(shuffle)state.player.nextVideo()}catch(e){}},700);setCloudStatus(shuffle?"Japanese Nightcore · shuffle aktif":"Japanese Nightcore · playlist asli");updatePlayIcon();updateMediaSessionPlayback();reclaimMediaSession();setTimeout(syncJapaneseMeta,900);startProgress();persistPlaybackState(true)}catch(e){setCloudStatus("Japanese Nightcore gagal dimuat: "+e.message)}}
function showView(id){
 document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
 const target=$("#"+id);if(!target)return;
 target.classList.add("active");
 document.querySelectorAll(".nav").forEach(n=>n.classList.toggle("active",n.dataset.view===id));
 if(id==="settingsView")refreshCatalogStats();
 if(["homeView","playlistView","settingsView"].includes(id))sessionStorage.setItem("vt_last_main_view",id);
}
function activeViewId(){return document.querySelector(".view.active")?.id||"homeView"}
function pushRicSpace(){
 if(history.state?.vtView!=="ricSpaceView")history.pushState({vtView:"ricSpaceView"},"");
 showView("ricSpaceView");
}
function restoreNavigationState(navState){
 const id=navState?.vtView;
 if(id==="ricToolView"&&navState.ricTool){openRicTool(navState.ricTool,true);return}
 if(["ricSpaceView","homeView","playlistView","settingsView"].includes(id)){showView(id);return}
 showView(sessionStorage.getItem("vt_last_main_view")||"homeView");
}
function setCategory(cat){
 if(!CATEGORIES.some(c=>c.slug===cat))return;
 state.category=cat;
 sessionStorage.setItem("vt_category",cat);localStorage.setItem("vt_last_category",cat);
 renderChips();
 const h=$("#sectionTitle");if(h)h.textContent=CATEGORIES.find(c=>c.slug===cat)?.name||"Fresh Mix";
 window.scrollTo({top:0,behavior:"smooth"});
 if(cat==="japanese-nightcore")openJP();else generateMix("category_change");
}
async function sendEvent(type,s){const url=(window.VIBETUBE_CLOUD_URL||localStorage.getItem("vt_supabase_url")||"").trim(),key=(window.VIBETUBE_CLOUD_KEY||localStorage.getItem("vt_supabase_key")||"").trim();if(!url||!key||!s)return;try{await fetch(url.replace(/\/$/,"")+"/rest/v1/vt_events",{method:"POST",headers:{"apikey":key,"Authorization":"Bearer "+key,"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({anonymous_key:getUserId(),youtube_id:s.youtube_id,event_type:type,created_at:new Date().toISOString()})})}catch(e){}}
function setupYT(){const t=document.createElement("script");t.src="https://www.youtube.com/iframe_api?vt=7.0";document.head.appendChild(t);window.onYouTubeIframeAPIReady=()=>{state.player=new YT.Player("ytPlayer",{height:"1",width:"1",videoId:"",playerVars:{playsinline:1,controls:1,rel:0,modestbranding:1},events:{onReady:()=>{
 state.ready=true;setMode(state.mode);
 const recovered=restorePlaybackState();
 renderChips();renderSongs();
 if(state.category==="japanese-nightcore"){
  openJP();
 }else if(state.queue.length){
  const s=state.queue[state.index];
  try{
   state.player.cueVideoById({videoId:s.youtube_id,startSeconds:Math.max(0,state.lastKnownPosition||0)});
   $("#playerDock")?.classList.remove("hidden");
   $("#miniInfo").textContent=`${titleFor(s)} · ${artistFor(s)}`;
   $("#playerTitle").textContent=titleFor(s);$("#playerArtist").textContent=artistFor(s);$("#playerThumb").src=ytThumb(s.youtube_id);
   updateMediaSessionMetadata(s);
  }catch(e){}
 }
 startProgress();persistPlaybackState(true);
},onStateChange:e=>{if(e.data===YT.PlayerState.ENDED){state.playing=false;updatePlayIcon();updateMediaSessionPlayback();if(state.category!=="japanese-nightcore"){sendEvent("complete",state.queue[state.index]);const repeat=$("#repeatMode").value;if(repeat==="one")playIndex(state.index);else if(repeat==="all"&&state.index>=state.queue.length-1)generateMix("repeat_all").then(()=>playIndex(0));else next(true)}}if(e.data===YT.PlayerState.PLAYING){state.playing=true;state.userStarted=true;state.recoveryAttempts=0;if(state.category==="japanese-nightcore")syncJapaneseMeta();else updateMediaSessionMetadata();updatePlayIcon();updateMediaSessionPlayback();reclaimMediaSession();startProgress();persistPlaybackState(true)}if(e.data===YT.PlayerState.PAUSED){state.playing=false;updatePlayIcon();updateMediaSessionPlayback();reclaimMediaSession();persistPlaybackState(true)}if(e.data===YT.PlayerState.BUFFERING)syncProgress()}}})}}

async function doSearch(){
 const q=$("#searchInput")?.value.trim();
 if(!q)return;
 const btn=$("#searchBtn"),status=$("#searchStatus");
 const url=(window.VIBETUBE_CLOUD_URL||localStorage.getItem("vt_supabase_url")||"").trim();
 const key=(window.VIBETUBE_CLOUD_KEY||localStorage.getItem("vt_supabase_key")||"").trim();
 if(!url||!key){
  if(status)status.textContent="Cloud belum dikonfigurasi.";
  return;
 }
 if(btn){btn.disabled=true;btn.textContent="Cari…"}
 if(status)status.textContent="Mencari di katalog VibeTube…";
 try{
  const r=await fetch(url.replace(/\/$/,"")+"/functions/v1/vibetube-search",{
   method:"POST",cache:"no-store",
   headers:{"Content-Type":"application/json","apikey":key,"Authorization":"Bearer "+key,"Cache-Control":"no-cache"},
   body:JSON.stringify({q,limit:20})
  });
  const d=await r.json().catch(()=>({}));
  if(!r.ok||!d.ok)throw new Error(d.error||`Search HTTP ${r.status}`);
  const items=Array.isArray(d.items)?d.items.filter(x=>x&&x.youtube_id):[];
  state.queue=items;state.index=0;
  showView("homeView");
  const h=$("#sectionTitle");if(h)h.textContent=`Hasil: ${q}`;
  renderSongs();
  if(!items.length){
   if(status)status.textContent=d.warning?"Belum ada hasil. YouTube fallback sedang tidak tersedia.":"Tidak ada hasil.";
   return;
  }
  const fromYT=items.filter(x=>x.source==="youtube-search").length;
  if(status){
   if(fromYT>0)status.textContent=`${items.length} hasil · ${fromYT} dari YouTube · diputar langsung di VibeTube`;
   else if(d.warning)status.textContent=`${items.length} hasil dari cloud · YouTube search sementara kena quota`;
   else status.textContent=`${items.length} hasil dari cloud VibeTube`;
  }
 }catch(e){
  console.warn("Search:",e);
  if(status)status.textContent="Search gagal: "+e.message;
 }finally{
  if(btn){btn.disabled=false;btn.textContent="Cari"}
 }
}

const RIC={watchId:null,digitalKey:null,digitalObjectUrl:null,digitalThumbUrls:[]};
function rg(k,d){try{return JSON.parse(localStorage.getItem("ric_"+k))??d}catch(e){return d}} function rs(k,v){localStorage.setItem("ric_"+k,JSON.stringify(v))}
function rf(l,id,v="",t="text",ph=""){return `<label>${l}<input id="${id}" type="${t}" value="${esc(v)}" placeholder="${esc(ph)}"></label>`}
function rstat(k,v){let s=rg("stats",{});s[k]=v==null?(s[k]||0)+1:v;rs("stats",s)}
function openRicTool(n,fromHistory=false){if(!fromHistory&&!(history.state?.vtView==="ricToolView"&&history.state?.ricTool===n))history.pushState({vtView:"ricToolView",ricTool:n},"");showView("ricToolView");let m={speedmap:["Speedometer + Arah","GPS speed, kompas & arah"],lifestats:["Life Stats","Statistik lokal Ric Space"],promptlab:["Prompt Lab","Template prompt personal"],nowplaying:["Now Playing Card","Kartu dari track VibeTube aktif"],garage:["Garage","Log motor, servis & biaya"],digitalisasi:["Digitalisasi","Brankas KTP, KK, SIM & STNK"],photospots:["Photo Spot Book","Koleksi spot foto"]};$("#ricToolTitle").textContent=m[n][0];$("#ricToolSubtitle").textContent=m[n][1];let o=rg("opens",{});o[n]=(o[n]||0)+1;rs("opens",o);({speedmap:rSpeed,lifestats:rLife,promptlab:rPrompt,nowplaying:rNP,garage:rGarage,digitalisasi:rDigital,photospots:rSpots}[n])($("#ricToolBody"))}
function rSpeed(b){
 b.innerHTML=`<div class="ride-app">
   <div class="ride-dashboard" id="rideDashboard">
     <aside class="ride-left">
       <div class="ride-clock" id="dashClock">--:--</div>

       <div class="ride-speed-wrap ref-speedometer">
         <svg class="ride-speed-svg ref-speed-svg" viewBox="0 0 500 430" aria-label="Speedometer 0 sampai 240 km/h">
           <defs>
             <linearGradient id="rideArcGrad" x1="0" y1="0" x2="1" y2="0">
               <stop offset="0%" stop-color="#6d39ff"/>
               <stop offset="48%" stop-color="#1e75ff"/>
               <stop offset="100%" stop-color="#53a9ff"/>
             </linearGradient>
             <filter id="rideGlow" x="-50%" y="-50%" width="200%" height="200%">
               <feGaussianBlur stdDeviation="2.3" result="blur"/>
               <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
             </filter>
           </defs>

           <!-- large near-circle from lower-left to lower-right, matching reference -->
           <path class="ride-arc-track ref-arc-track" d="M 92 345 A 190 190 0 1 1 408 345"/>
           <path id="rideSpeedArc" class="ride-arc-live ref-arc-live" d="M 92 345 A 190 190 0 1 1 408 345"/>

           <g class="ref-minor-ticks">
             <line x1="106" y1="323" x2="119" y2="314"/><line x1="88" y1="291" x2="103" y2="285"/>
             <line x1="76" y1="252" x2="92" y2="250"/><line x1="74" y1="210" x2="90" y2="212"/>
             <line x1="83" y1="171" x2="99" y2="176"/><line x1="103" y1="134" x2="117" y2="143"/>
             <line x1="132" y1="102" x2="145" y2="114"/><line x1="167" y1="79" x2="176" y2="94"/>
             <line x1="207" y1="65" x2="212" y2="82"/><line x1="250" y1="60" x2="250" y2="80"/>
             <line x1="293" y1="65" x2="288" y2="82"/><line x1="333" y1="79" x2="324" y2="94"/>
             <line x1="368" y1="102" x2="355" y2="114"/><line x1="397" y1="134" x2="383" y2="143"/>
             <line x1="417" y1="171" x2="401" y2="176"/><line x1="426" y1="210" x2="410" y2="212"/>
             <line x1="424" y1="252" x2="408" y2="250"/><line x1="412" y1="291" x2="397" y2="285"/>
             <line x1="394" y1="323" x2="381" y2="314"/>
           </g>

           <g class="ride-ticks ref-major-ticks">
             <line x1="91" y1="345" x2="111" y2="331"/>
             <line x1="65" y1="252" x2="91" y2="249"/>
             <line x1="105" y1="139" x2="127" y2="152"/>
             <line x1="250" y1="53" x2="250" y2="80"/>
             <line x1="395" y1="139" x2="373" y2="152"/>
             <line x1="435" y1="252" x2="409" y2="249"/>
             <line x1="409" y1="345" x2="389" y2="331"/>
           </g>

           <g class="ride-speed-labels ref-speed-labels">
             <text x="117" y="343">0</text>
             <text x="65" y="246">40</text>
             <text x="119" y="143">80</text>
             <text x="250" y="100">120</text>
             <text x="381" y="143">160</text>
             <text x="435" y="246">200</text>
             <text x="383" y="343">240</text>
           </g>
         </svg>
         <div class="ride-speed-number ref-speed-number">
           <strong id="dashSpeed">0</strong>
           <span>km/h</span>
         </div>
       </div>

       <div class="ride-lean-card ref-lean-card">
         <div class="lean-side left"><strong id="leanLeft">0°</strong><span>KIRI</span></div>
         <div class="ride-bike-ring ref-bike-ring">
           <svg id="leanBike" class="ride-bike-svg ref-bike-svg" viewBox="0 0 220 140" aria-label="Motor">
             <g fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
               <circle cx="47" cy="101" r="29"/><circle cx="174" cy="101" r="29"/>
               <path d="M47 101 L79 58 L127 58 L149 101 M79 58 L105 101 L149 101 M105 101 L68 101"/>
               <path d="M127 58 L145 36 L171 36 M145 36 L160 62"/>
               <path d="M77 58 L64 39 L45 39"/>
               <path d="M92 46 Q119 24 143 44"/>
               <path d="M94 49 Q120 37 147 50"/>
             </g>
           </svg>
           <small id="leanNow">0°</small>
         </div>
         <div class="lean-side right"><strong id="leanRight">0°</strong><span>KANAN</span></div>
       </div>
       <div class="ride-lean-title">KEMIRINGAN</div>

       <div class="ride-info-row">
         <div><strong id="dashEta">--:--</strong><span>ETA</span></div>
         <div><strong id="dashRemainTime">--</strong><span>min</span></div>
         <div><strong id="dashRemainKm">--</strong><span>km</span></div>
         <div><strong id="dashTemp">--°C</strong><span>SUHU</span></div>
       </div>
     </aside>

     <main class="ride-right">
       <div id="rideMap" class="ride-map"></div>
       <div class="ride-map-shade"></div>

       <div class="ride-map-search">
         <div class="ride-map-searchbar">
           <input id="mapSearchInput" type="search" placeholder="Cari tujuan..." autocomplete="off">
           <button id="mapSearchBtn" aria-label="Cari">⌕</button>
         </div>
         <div id="mapSearchResults" class="ride-map-search-results hidden"></div>
       </div>

       <div class="ride-gps-pill"><span id="gpsBadge">GPS...</span><span id="routeDestination">Cari atau tap tujuan</span></div>

       <div id="routeChoices" class="route-choices hidden"></div>

       <div class="ride-turn-card">
         <div id="turnIcon" class="ride-turn-icon">↑</div>
         <div class="ride-turn-copy"><strong id="turnDistance">—</strong><span id="turnText">Pilih tujuan di peta</span></div>
       </div>

       <div class="ride-controls">
         <button id="compassBtn" class="ride-round-btn" title="Kompas"><span id="compassLetter">N</span><i>▲</i></button>
         <button id="voiceBtn" class="ride-round-btn" title="Voice">◖)))</button>
         <button id="dashMenuBtn" class="ride-round-btn" title="Menu">•••</button>
       </div>
     </main>
   </div>

   <div id="dashMenu" class="dash-menu hidden">
     <div class="dash-menu-card">
       <div class="dash-menu-head"><b>Dashboard</b><button id="closeDashMenu">×</button></div>
       <button id="rideTrackingBtn" class="primary">Mulai Ride Tracking</button>
       <button id="rideHistoryBtn" class="ghost">Ride History</button>
       <button id="sensorPermission" class="ghost">Aktifkan sensor kemiringan</button>
       <button id="calibrateLean" class="ghost">Kalibrasi kemiringan</button>
       <button id="centerMap" class="ghost">Center map</button>
       <button id="clearRoute" class="ghost">Hapus rute</button>
       <button id="dashFullscreen" class="ghost">Fullscreen</button>
       <p id="dashStatus" class="tool-hint">Landscape direkomendasikan. Tap peta untuk memilih tujuan.</p>
     </div>
   </div>
   <div id="rideHistoryModal" class="ride-history-modal hidden">
     <div class="ride-history-card">
       <div class="ride-history-head"><div><small>RIC SPACE</small><b>Ride History</b></div><button id="closeRideHistory">×</button></div>
       <div id="rideHistorySummary" class="ride-history-summary"></div>
       <div id="rideHistoryList" class="ride-history-list"><p class="tool-hint">Memuat...</p></div>
       <div id="rideHistoryDetail" class="ride-history-detail hidden"><div id="rideHistoryMap"></div><div id="rideHistoryMeta"></div></div>
     </div>
   </div>
 </div>`;

 const $d=s=>document.querySelector(s);
 let map=null,userMarker=null,vehicleMarker=null,destMarker=null,current=null,dest=null,route=null,routes=[],selectedRoute=0,steps=[],activeStep=0,followUser=true;
 let lastRouteAt=0,lastMapFollow=0,lastHeading=null,voice=true,sensorActive=false;
 let leanZero=Number(localStorage.getItem("ric_lean_zero")||0),maxL=0,maxR=0,lastLean=0;

 let rideActive=false,rideId=null,rideStartedAt=0,rideDistanceM=0,rideMaxSpeed=0,rideSpeedSum=0,rideSpeedSamples=0,rideStartPos=null,rideLastPos=null,rideLastPointAt=0,rideSeq=0,rideSyncing=false;
 const rideBufferKey="ric_ride_buffer_v1";
 function rideCloud(){
   const url=(window.VIBETUBE_CLOUD_URL||localStorage.getItem("vt_supabase_url")||"").trim().replace(/\/$/,"");
   const key=(window.VIBETUBE_CLOUD_KEY||localStorage.getItem("vt_supabase_key")||"").trim();
   return {url,key};
 }
 async function rideRpc(name,body){
   const {url,key}=rideCloud(); if(!url||!key)throw new Error("Cloud belum dikonfigurasi");
   const r=await fetch(`${url}/rest/v1/rpc/${name}`,{method:"POST",cache:"no-store",headers:{"apikey":key,"Authorization":"Bearer "+key,"Content-Type":"application/json","Cache-Control":"no-cache"},body:JSON.stringify(body)});
   const d=await r.json().catch(()=>null); if(!r.ok)throw new Error(d?.message||d?.error||`HTTP ${r.status}`); return d;
 }
 function rideReadBuffer(){try{return JSON.parse(localStorage.getItem(rideBufferKey)||"[]")}catch(e){return []}}
 function rideWriteBuffer(v){try{localStorage.setItem(rideBufferKey,JSON.stringify(v))}catch(e){}}
 async function flushRideBuffer(){
   if(rideSyncing||!rideId)return; let buf=rideReadBuffer(); if(!buf.length)return;
   rideSyncing=true;
   try{
     const chunk=buf.slice(0,40);
     await rideRpc("vt_ride_append",{p_ride_id:rideId,p_anonymous_key:getUserId(),p_points:chunk});
     buf=buf.slice(chunk.length);rideWriteBuffer(buf);
   }catch(e){
     console.warn("Ride sync buffered:",e);
   }finally{rideSyncing=false}
   if(buf.length) setTimeout(flushRideBuffer,500);
 }
 function trackRidePoint(c){
   if(!rideActive||!rideId)return;
   const now=Date.now();
   if(now-rideLastPointAt<2000)return;
   rideLastPointAt=now;
   const p={lat:c.latitude,lng:c.longitude};
   if(!rideStartPos)rideStartPos=p;
   if(rideLastPos){
     const d=hav(rideLastPos,p);
     if(Number.isFinite(d)&&d<1000)rideDistanceM+=d;
   }
   rideLastPos=p;
   const speed=Math.max(0,(c.speed||0)*3.6);
   rideMaxSpeed=Math.max(rideMaxSpeed,speed);
   rideSpeedSum+=speed;rideSpeedSamples++;
   const buf=rideReadBuffer();
   buf.push({seq:rideSeq++,recorded_at:new Date(now).toISOString(),lat:p.lat,lng:p.lng,speed_kmh:speed,heading:Number.isFinite(c.heading)?c.heading:null,lean_deg:lastLean,accuracy_m:c.accuracy||null});
   rideWriteBuffer(buf);
   if(buf.length>=10)flushRideBuffer();
   updateRideButton();
 }
 function updateRideButton(){
   const btn=$d("#rideTrackingBtn"); if(!btn)return;
   if(!rideActive){btn.textContent="Mulai Ride Tracking";btn.classList.remove("recording");return}
   const sec=Math.max(0,Math.round((Date.now()-rideStartedAt)/1000));
   const m=Math.floor(sec/60),s=String(sec%60).padStart(2,"0");
   btn.textContent=`Stop Ride · ${m}:${s} · ${(rideDistanceM/1000).toFixed(1)} km`;
   btn.classList.add("recording");
 }
 async function startRideTracking(){
   if(rideActive)return stopRideTracking();
   const btn=$d("#rideTrackingBtn"); if(btn){btn.disabled=true;btn.textContent="Memulai..."}
   try{
     rideWriteBuffer([]);
     rideId=await rideRpc("vt_ride_start",{p_anonymous_key:getUserId()});
     rideActive=true;rideStartedAt=Date.now();rideDistanceM=0;rideMaxSpeed=0;rideSpeedSum=0;rideSpeedSamples=0;rideStartPos=current?{...current}:null;rideLastPos=current?{...current}:null;rideLastPointAt=0;rideSeq=0;maxL=0;maxR=0;
     localStorage.setItem("ric_active_ride",JSON.stringify({rideId,startedAt:rideStartedAt}));
     updateRideButton();
   }catch(e){$d("#dashStatus").textContent="Ride tracking gagal: "+e.message}
   finally{if(btn)btn.disabled=false}
 }
 async function stopRideTracking(){
   if(!rideActive||!rideId)return;
   const btn=$d("#rideTrackingBtn"); if(btn){btn.disabled=true;btn.textContent="Menyimpan Ride..."}
   const finalId=rideId;
   try{
     await flushRideBuffer();
     // Give any active flush a moment to finish.
     for(let i=0;i<12&&rideSyncing;i++)await new Promise(r=>setTimeout(r,150));
     await flushRideBuffer();
     const dur=Math.max(1,Math.round((Date.now()-rideStartedAt)/1000));
     await rideRpc("vt_ride_finish",{p_ride_id:finalId,p_anonymous_key:getUserId(),p_distance_m:rideDistanceM,p_duration_sec:dur,p_avg_speed_kmh:rideSpeedSamples?rideSpeedSum/rideSpeedSamples:0,p_max_speed_kmh:rideMaxSpeed,p_max_lean_left:Math.abs(maxL),p_max_lean_right:Math.abs(maxR),p_start_lat:rideStartPos?.lat??null,p_start_lng:rideStartPos?.lng??null,p_end_lat:current?.lat??null,p_end_lng:current?.lng??null});
     rideWriteBuffer([]);localStorage.removeItem("ric_active_ride");
     $d("#dashStatus").textContent="Ride tersimpan ke Supabase";
   }catch(e){$d("#dashStatus").textContent="Sebagian data masih di buffer lokal: "+e.message}
   finally{
     rideActive=false;rideId=null;updateRideButton();if(btn)btn.disabled=false;
   }
 }
 function fmtDuration(sec){sec=Number(sec)||0;const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60);return h?`${h}j ${m}m`:`${m} min`}
 async function openRideHistory(){
   const modal=$d("#rideHistoryModal"),list=$d("#rideHistoryList"),sum=$d("#rideHistorySummary"),detail=$d("#rideHistoryDetail");
   modal.classList.remove("hidden");detail.classList.add("hidden");list.innerHTML='<p class="tool-hint">Memuat dari Supabase...</p>';
   try{
     const rows=await rideRpc("vt_ride_history",{p_anonymous_key:getUserId(),p_limit:50});
     const totalKm=rows.reduce((a,x)=>a+(Number(x.distance_m)||0),0)/1000;
     const totalSec=rows.reduce((a,x)=>a+(Number(x.duration_sec)||0),0);
     const maxSpeed=rows.reduce((a,x)=>Math.max(a,Number(x.max_speed_kmh)||0),0);
     sum.innerHTML=`<div><strong>${rows.length}</strong><span>RIDE</span></div><div><strong>${totalKm.toFixed(1)}</strong><span>KM</span></div><div><strong>${fmtDuration(totalSec)}</strong><span>WAKTU</span></div><div><strong>${Math.round(maxSpeed)}</strong><span>MAX KM/H</span></div>`;
     list.innerHTML=rows.map(x=>`<button class="ride-history-row" data-ride="${x.id}"><div><b>${new Date(x.started_at).toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"})}</b><span>${new Date(x.started_at).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})} · ${fmtDuration(x.duration_sec)}</span></div><div><strong>${(Number(x.distance_m)/1000).toFixed(1)} km</strong><span>MAX ${Math.round(x.max_speed_kmh||0)} km/h · LEAN ${Math.round(x.max_lean_left||0)}°/${Math.round(x.max_lean_right||0)}°</span></div></button>`).join("")||'<p class="tool-hint">Belum ada Ride History.</p>';
     list.querySelectorAll("[data-ride]").forEach(el=>el.onclick=()=>showRideHistoryTrack(el.dataset.ride,rows.find(x=>x.id===el.dataset.ride)));
   }catch(e){list.innerHTML=`<p class="tool-hint">History gagal: ${esc(e.message)}</p>`}
 }
 async function showRideHistoryTrack(id,session){
   const detail=$d("#rideHistoryDetail"),mapEl=$d("#rideHistoryMap"),meta=$d("#rideHistoryMeta");
   detail.classList.remove("hidden");mapEl.innerHTML="";meta.innerHTML='<span>Memuat tracking...</span>';
   try{
     const pts=await rideRpc("vt_ride_track",{p_ride_id:id,p_anonymous_key:getUserId()});
     meta.innerHTML=`<b>${(Number(session.distance_m)/1000).toFixed(1)} km · ${fmtDuration(session.duration_sec)}</b><span>${pts.length} titik GPS · Avg ${Math.round(session.avg_speed_kmh||0)} km/h · Max ${Math.round(session.max_speed_kmh||0)} km/h</span>`;
     if(!window.mapboxgl||!pts.length){mapEl.innerHTML='<div class="ride-history-empty">Tidak ada track GPS.</div>';return}
     const hm=new mapboxgl.Map({container:mapEl,style:"mapbox://styles/mapbox/navigation-night-v1",center:[pts[0].lng,pts[0].lat],zoom:13,attributionControl:false});
     hm.on("load",()=>{
       const coords=pts.map(p=>[p.lng,p.lat]);
       hm.addSource("ride-track",{type:"geojson",data:{type:"Feature",geometry:{type:"LineString",coordinates:coords}}});
       hm.addLayer({id:"ride-track",type:"line",source:"ride-track",layout:{"line-cap":"round","line-join":"round"},paint:{"line-color":"#1684ff","line-width":6}});
       if(coords.length>1){const bounds=coords.reduce((b,c)=>b.extend(c),new mapboxgl.LngLatBounds(coords[0],coords[0]));hm.fitBounds(bounds,{padding:32,duration:0})}
     });
   }catch(e){meta.innerHTML=`<span>${esc(e.message)}</span>`}
 }

 const arc=$d("#rideSpeedArc");
 const arcLen=arc?.getTotalLength?.()||900;
 if(arc){
   arc.style.strokeDasharray=String(arcLen);
   arc.style.strokeDashoffset=String(arcLen);
 }

 function setSpeed(v){
   const speed=Math.max(0,Math.min(240,Number(v)||0));
   $d("#dashSpeed").textContent=Math.round(speed);
   if(arc) arc.style.strokeDashoffset=String(arcLen*(1-speed/240));
 }

 function updateClock(){
   $d("#dashClock").textContent=new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"});
 }
 updateClock(); setInterval(updateClock,15000);setInterval(()=>{if(rideActive){updateRideButton();flushRideBuffer()}},10000);

 function bearingCardinal(h){
   return ["N","NE","E","SE","S","SW","W","NW"][Math.round((((h||0)%360)+360)%360/45)%8];
 }
 function hav(a,b){
   const R=6371000,r=x=>x*Math.PI/180,d1=r(b.lat-a.lat),d2=r(b.lng-a.lng);
   const q=Math.sin(d1/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(d2/2)**2;
   return 2*R*Math.atan2(Math.sqrt(q),Math.sqrt(1-q));
 }
 function turnInfo(step){
   const m=step?.maneuver||{},mod=m.modifier||"",type=m.type||"";
   if(type==="arrive")return {icon:"●",txt:"Tujuan di depan"};
   if(type==="roundabout"||type==="rotary")return {icon:"⟳",txt:"Masuk bundaran"};
   if(/uturn/.test(mod)||type==="uturn")return {icon:"↶",txt:"Putar balik"};
   if(/left/.test(mod))return {icon:"↰",txt:"Belok kiri"+(step.name?` ke ${step.name}`:"")};
   if(/right/.test(mod))return {icon:"↱",txt:"Belok kanan"+(step.name?` ke ${step.name}`:"")};
   return {icon:"↑",txt:step.name?`Lanjut di ${step.name}`:"Lanjut lurus"};
 }
 function renderStep(){
   if(!route||!steps.length){
     $d("#turnIcon").textContent="↑";$d("#turnDistance").textContent="—";$d("#turnText").textContent="Pilih tujuan di peta";return;
   }
   const s=steps[Math.min(activeStep,steps.length-1)],t=turnInfo(s);
   $d("#turnIcon").textContent=t.icon;$d("#turnText").textContent=t.txt;
   const meters=Math.max(0,s.distance||0);
   $d("#turnDistance").textContent=meters>=1000?(meters/1000).toFixed(1)+" km":Math.round(meters)+" m";
 }
 function speakStep(force=false){
   if(!voice||!steps.length||!window.speechSynthesis)return;
   const s=steps[Math.min(activeStep,steps.length-1)],t=turnInfo(s),meters=Math.round(s.distance||0);
   const msg=`${meters>0?meters+" meter, ":""}${t.txt}`;
   if(force||msg!==speakStep.last){
     speechSynthesis.cancel();
     const u=new SpeechSynthesisUtterance(msg);u.lang="id-ID";u.rate=1;
     speechSynthesis.speak(u);speakStep.last=msg;
   }
 }

 async function routeToDestination(force=false){
   if(!current||!dest)return;
   if(!force&&Date.now()-lastRouteAt<18000)return;
   lastRouteAt=Date.now();
   try{
     $d("#routeDestination").textContent="Menghitung rute...";
     const u=`https://router.project-osrm.org/route/v1/driving/${current.lng},${current.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson&steps=true`;
     const r=await fetch(u,{cache:"no-store"});
     const j=await r.json();
     if(!r.ok||j.code!=="Ok"||!j.routes?.length)throw new Error(j.message||"Rute tidak ditemukan");
     route=j.routes[0];steps=route.legs?.[0]?.steps||[];activeStep=0;

     if(routeLine)map.removeLayer(routeLine);
     routeLine=L.geoJSON(route.geometry,{style:{color:"#1684ff",weight:9,opacity:.96,lineCap:"round",lineJoin:"round"}}).addTo(map);

     const mins=Math.max(1,Math.round(route.duration/60)),km=route.distance/1000;
     const eta=new Date(Date.now()+route.duration*1000);
     $d("#dashRemainTime").textContent=mins;
     $d("#dashRemainKm").textContent=km.toFixed(1);
     $d("#dashEta").textContent=eta.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"});
     $d("#routeDestination").textContent=`${km.toFixed(1)} km · ${mins} min`;
     renderStep();speakStep(true);
   }catch(e){
     $d("#routeDestination").textContent="Routing gagal";
     $d("#dashStatus").textContent=e.message;
   }
 }

 function updateStepFromPosition(){
   if(!current||!steps.length)return;
   let best=activeStep,bestD=Infinity;
   for(let i=activeStep;i<Math.min(steps.length,activeStep+4);i++){
     const loc=steps[i]?.maneuver?.location;
     if(!loc)continue;
     const d=hav(current,{lng:loc[0],lat:loc[1]});
     if(d<bestD){bestD=d;best=i;}
   }
   const next=Math.min(best+(bestD<22?1:0),steps.length-1);
   if(next!==activeStep){activeStep=next;renderStep();speakStep(true);}
   else if(bestD<180)speakStep(false);
 }

 function initMap(){
   if(!window.mapboxgl){$d("#dashStatus").textContent="Mapbox GL gagal dimuat";return;}
   mapboxgl.accessToken="pk.eyJ1IjoicmljaGkxMTMiLCJhIjoiY21zdjY0bXU5MTM5bzJ5b29lYWY2ZGhvYyJ9.BKOQGTMqs87wgBOSc_3U3w";
   map=new mapboxgl.Map({
     container:"rideMap",
     style:"mapbox://styles/mapbox/navigation-night-v1",
     center:[112.63,-7.98],
     zoom:15.8,
     pitch:58,
     bearing:0,
     attributionControl:true,
     antialias:true
   });
   map.addControl(new mapboxgl.NavigationControl({showCompass:false,showZoom:false}),"top-right");
   map.on("click",e=>{
     dest={lat:e.lngLat.lat,lng:e.lngLat.lng};
     if(destMarker)destMarker.setLngLat([dest.lng,dest.lat]);
     else destMarker=new mapboxgl.Marker({color:"#1684ff"}).setLngLat([dest.lng,dest.lat]).addTo(map);
     routeToDestination(true);
   });
   map.on("load",()=>setTimeout(()=>map.resize(),50));
   map.on("dragstart",()=>{followUser=false;$d("#compassBtn")?.classList.add("follow-off");});
   map.on("zoomstart",e=>{if(e.originalEvent){followUser=false;$d("#compassBtn")?.classList.add("follow-off");}});
 }

 async function searchMapPlace(){
   const input=$d("#mapSearchInput"),box=$d("#mapSearchResults");
   const q=input?.value.trim(); if(!q||!mapboxgl?.accessToken)return;
   box.classList.remove("hidden");
   box.innerHTML='<div class="map-search-loading">Mencari...</div>';
   try{
     const prox=current?`&proximity=${current.lng},${current.lat}`:"";
     const u=`https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(q)}&limit=6&language=id${prox}&access_token=${mapboxgl.accessToken}`;
     const r=await fetch(u,{cache:"no-store"});const j=await r.json();
     if(!r.ok)throw new Error(j.message||"Search gagal");
     const features=j.features||[];
     if(!features.length){box.innerHTML='<div class="map-search-loading">Tidak ada hasil.</div>';return;}
     box.innerHTML=features.map((f,i)=>{
       const name=f.properties?.name||f.text||"Lokasi";
       const addr=f.properties?.full_address||f.properties?.place_formatted||f.place_name||"";
       return `<button data-map-result="${i}"><b>${esc(name)}</b><span>${esc(addr)}</span></button>`;
     }).join("");
     box.querySelectorAll("[data-map-result]").forEach(btn=>btn.onclick=()=>{
       const f=features[Number(btn.dataset.mapResult)],c=f.geometry?.coordinates;
       if(!c)return;
       dest={lng:c[0],lat:c[1]};
       const name=f.properties?.name||f.text||"Tujuan";
       $d("#mapSearchInput").value=name;
       box.classList.add("hidden");
       if(destMarker)destMarker.setLngLat(c);
       else destMarker=new mapboxgl.Marker({color:"#1684ff"}).setLngLat(c).addTo(map);
       followUser=false;$d("#compassBtn")?.classList.add("follow-off");
       map.flyTo({center:c,zoom:16,pitch:52,duration:700});
       routeToDestination(true);
     });
   }catch(e){box.innerHTML=`<div class="map-search-loading">${esc(e.message||String(e))}</div>`;}
 }

 function routeFeature(r){
   return {type:"Feature",properties:{},geometry:r.geometry};
 }
 function renderRoutes(){
   if(!map||!map.isStyleLoaded()){setTimeout(renderRoutes,100);return;}
   for(let i=0;i<3;i++){
     const id=`route-${i}`;
     if(map.getLayer(id))map.removeLayer(id);
     if(map.getSource(id))map.removeSource(id);
   }
   routes.forEach((r,i)=>{
     const id=`route-${i}`;
     map.addSource(id,{type:"geojson",data:routeFeature(r)});
     map.addLayer({
       id,type:"line",source:id,
       layout:{"line-cap":"round","line-join":"round"},
       paint:{
         "line-color":i===selectedRoute?"#1684ff":"#617084",
         "line-width":i===selectedRoute?9:6,
         "line-opacity":i===selectedRoute?.98:.55
       }
     });
     map.on("click",id,()=>selectRoute(i,true));
     map.on("mouseenter",id,()=>map.getCanvas().style.cursor="pointer");
     map.on("mouseleave",id,()=>map.getCanvas().style.cursor="");
   });
 }

 function renderRouteChoices(){
   const box=$d("#routeChoices");
   if(!box)return;
   if(routes.length<2){box.classList.add("hidden");box.innerHTML="";return;}
   box.classList.remove("hidden");
   box.innerHTML=routes.map((r,i)=>{
     const min=Math.max(1,Math.round(r.duration/60)),km=(r.distance/1000).toFixed(1);
     return `<button class="${i===selectedRoute?"active":""}" data-route="${i}"><b>${i===0?"UTAMA":"ALT "+i}</b><span>${min} min · ${km} km</span></button>`;
   }).join("");
   box.querySelectorAll("button").forEach(btn=>btn.onclick=()=>selectRoute(Number(btn.dataset.route),true));
 }

 function selectRoute(i,announce=false){
   if(!routes[i])return;
   selectedRoute=i;route=routes[i];steps=route.legs?.[0]?.steps||[];activeStep=0;
   const mins=Math.max(1,Math.round(route.duration/60)),km=route.distance/1000;
   const eta=new Date(Date.now()+route.duration*1000);
   $d("#dashRemainTime").textContent=mins;
   $d("#dashRemainKm").textContent=km.toFixed(1);
   $d("#dashEta").textContent=eta.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"});
   $d("#routeDestination").textContent=`${km.toFixed(1)} km · ${mins} min`;
   renderRoutes();renderRouteChoices();renderStep();
   if(announce)speakStep(true);
 }

 async function routeToDestination(force=false){
   if(!current||!dest)return;
   if(!force&&Date.now()-lastRouteAt<18000)return;
   lastRouteAt=Date.now();
   try{
     $d("#routeDestination").textContent="Mencari rute...";
     const coords=`${current.lng},${current.lat};${dest.lng},${dest.lat}`;
     const url=`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}?alternatives=true&geometries=geojson&overview=full&steps=true&language=id&access_token=${mapboxgl.accessToken}`;
     const r=await fetch(url,{cache:"no-store"});
     const j=await r.json();
     if(!r.ok||j.code!=="Ok"||!j.routes?.length)throw new Error(j.message||"Rute tidak ditemukan");
     routes=j.routes.slice(0,3);
     selectedRoute=0;
     selectRoute(0,true);

     const coordsAll=routes[0].geometry.coordinates;
     const bounds=coordsAll.reduce((b,c)=>b.extend(c),new mapboxgl.LngLatBounds(coordsAll[0],coordsAll[0]));
     map.fitBounds(bounds,{padding:{top:70,bottom:150,left:70,right:110},duration:700,pitch:55});
   }catch(e){
     $d("#routeDestination").textContent="Routing gagal";
     $d("#dashStatus").textContent=e.message||String(e);
   }
 }

 async function weather(lat,lng){
   if(weather.last&&Date.now()-weather.last<10*60*1000)return;
   weather.last=Date.now();
   try{
     const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m&timezone=auto`,{cache:"no-store"});
     const j=await r.json();
     if(j.current?.temperature_2m!=null)$d("#dashTemp").textContent=Math.round(j.current.temperature_2m)+"°C";
   }catch(e){}
 }

 function updateHeading(h){
   if(h==null||Number.isNaN(h))return;
   lastHeading=h;
   if(vehicleMarker)vehicleMarker.setRotation(h);
   $d("#compassLetter").textContent=bearingCardinal(h);
   $d("#compassBtn i").style.transform=`rotate(${h}deg)`;
 }

 function updateLocation(c){
   current={lat:c.latitude,lng:c.longitude};
   setSpeed(c.speed==null?0:c.speed*3.6);
   $d("#gpsBadge").textContent=c.accuracy<=15?"GPS LOCK":`GPS ±${Math.round(c.accuracy)}m`;
   updateHeading(c.heading);

   if(map){
     if(!vehicleMarker){
       const el=document.createElement("div");
       el.className="mapbox-vehicle-marker";
       el.innerHTML='<div class="mapbox-vehicle-halo"></div><div class="mapbox-vehicle-arrow">▲</div>';
       vehicleMarker=new mapboxgl.Marker({element:el,rotationAlignment:"map",pitchAlignment:"map"})
         .setLngLat([current.lng,current.lat]).addTo(map);
       if(lastHeading!=null)vehicleMarker.setRotation(lastHeading);
       map.easeTo({center:[current.lng,current.lat],zoom:17,pitch:58,bearing:lastHeading??0,duration:500});
     }else{
       vehicleMarker.setLngLat([current.lng,current.lat]);
     }
     if(followUser && Date.now()-lastMapFollow>900){
       lastMapFollow=Date.now();
       map.easeTo({center:[current.lng,current.lat],bearing:lastHeading??map.getBearing(),pitch:58,duration:650});
     }
   }
   weather(c.latitude,c.longitude);
   trackRidePoint(c);
   updateStepFromPosition();
   if(dest&&Date.now()-lastRouteAt>26000)routeToDestination(false);
 }

 function getScreenAngle(){
   const so=screen.orientation?.angle;
   if(typeof so==="number")return so;
   const wo=window.orientation;
   return typeof wo==="number"?wo:0;
 }

 function normalizedRoll(e){
   const angle=getScreenAngle();
   const beta=Number(e.beta)||0,gamma=Number(e.gamma)||0;
   let roll;
   if(angle===90) roll=-beta;
   else if(angle===270||angle===-90) roll=beta;
   else roll=gamma;
   return roll-leanZero;
 }

 let leanFiltered=0;
 function onOrientation(e){
   let raw=normalizedRoll(e);
   if(!Number.isFinite(raw))return;

   // Keep the real sensor range. Do not hard-clamp at ±65°, which caused the old "stuck at 65" behavior.
   // A soft sanity limit only rejects impossible wrap/jump values.
   if(raw>179)raw-=360;
   if(raw<-179)raw+=360;
   if(Math.abs(raw)>120)raw=Math.sign(raw)*120;

   // low-pass filter keeps UI stable while still following the phone quickly
   leanFiltered = leanFiltered*0.72 + raw*0.28;
   const v=leanFiltered;
   lastLean=v;

   if(v<0)maxL=Math.min(maxL,v);
   if(v>0)maxR=Math.max(maxR,v);

   $d("#leanNow").textContent=Math.round(Math.abs(v))+"°";
   $d("#leanLeft").textContent=Math.round(Math.abs(maxL))+"°";
   $d("#leanRight").textContent=Math.round(Math.abs(maxR))+"°";

   // Motor graphic follows actual roll, but cap visual rotation only so it remains readable.
   const visual=Math.max(-80,Math.min(80,v));
   $d("#leanBike").style.transform=`rotate(${visual}deg)`;
 }

 async function requestSensors(){
   try{
     if(sensorActive)return;
     if(typeof DeviceOrientationEvent!=="undefined"&&typeof DeviceOrientationEvent.requestPermission==="function"){
       const p=await DeviceOrientationEvent.requestPermission();
       if(p!=="granted")throw new Error("Izin sensor ditolak");
     }
     window.addEventListener("deviceorientationabsolute",onOrientation,true);
     window.addEventListener("deviceorientation",onOrientation,true);
     sensorActive=true;
     $d("#dashStatus").textContent="Sensor kemiringan aktif";
   }catch(e){
     $d("#dashStatus").textContent="Sensor kemiringan: "+e.message;
   }
 }

 initMap();
 on("#mapSearchBtn","click",searchMapPlace);
 const mapSearchInput=$d("#mapSearchInput");
 if(mapSearchInput){
   mapSearchInput.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();searchMapPlace()}});
   mapSearchInput.addEventListener("focus",()=>{});
 }
 if(navigator.geolocation){
   navigator.geolocation.watchPosition(
     p=>updateLocation(p.coords),
     e=>$d("#gpsBadge").textContent="GPS ERROR",
     {enableHighAccuracy:true,maximumAge:300,timeout:15000}
   );
 }

 on("#rideTrackingBtn","click",startRideTracking);
 on("#rideHistoryBtn","click",openRideHistory);
 on("#closeRideHistory","click",()=>$d("#rideHistoryModal").classList.add("hidden"));
 on("#voiceBtn","click",()=>{voice=!voice;$d("#voiceBtn").classList.toggle("off",!voice);if(voice)speakStep(true);});
 on("#dashMenuBtn","click",()=>$d("#dashMenu").classList.remove("hidden"));
 on("#closeDashMenu","click",()=>$d("#dashMenu").classList.add("hidden"));
 on("#sensorPermission","click",requestSensors);
 on("#calibrateLean","click",()=>{
   leanZero+=lastLean;
   localStorage.setItem("ric_lean_zero",String(leanZero));
   leanFiltered=0;lastLean=0;maxL=0;maxR=0;
   $d("#leanNow").textContent="0°";$d("#leanLeft").textContent="0°";$d("#leanRight").textContent="0°";
   $d("#leanBike").style.transform="rotate(0deg)";
   $d("#dashStatus").textContent="Kalibrasi kemiringan tersimpan";
 });
 on("#centerMap","click",()=>{if(current){followUser=true;$d("#compassBtn")?.classList.remove("follow-off");map?.easeTo({center:[current.lng,current.lat],zoom:17,pitch:58,bearing:lastHeading??0,duration:500})}});
 on("#clearRoute","click",()=>{
   dest=route=null;steps=[];activeStep=0;
   routes=[];selectedRoute=0;
   for(let i=0;i<3;i++){const id=`route-${i}`;if(map?.getLayer(id))map.removeLayer(id);if(map?.getSource(id))map.removeSource(id);}
   if(destMarker){destMarker.remove();destMarker=null;}
   renderRouteChoices();
   $d("#dashRemainTime").textContent="--";
   $d("#dashRemainKm").textContent="--";
   $d("#dashEta").textContent="--:--";
   $d("#routeDestination").textContent="Tap peta untuk tujuan";
   renderStep();
 });
 function setRideFullscreenMode(active){
   document.body.classList.toggle("ride-fullscreen-mode",active);
   document.documentElement.classList.toggle("ride-fullscreen-mode",active);
   const dash=$d("#rideDashboard");
   dash?.classList.toggle("force-landscape-fullscreen",active);

   // Leaflet is sensitive to viewport changes on Android Chrome.
   [0,80,180,350,700,1200].forEach(t=>setTimeout(()=>{
     try{
       map?.resize();
       if(current && map) map.easeTo({center:[current.lng,current.lat],duration:0});
     }catch(e){}
   },t));
 }

 on("#dashFullscreen","click",async()=>{
   try{
     const active=document.body.classList.contains("ride-fullscreen-mode");
     if(!active){
       // Enter layout mode first so the right map panel never collapses during the browser transition.
       setRideFullscreenMode(true);

       // Fullscreen the document root instead of the dashboard element itself.
       // This avoids Android Chromium clipping absolute children inside a fullscreen grid element.
       try{
         if(!document.fullscreenElement && document.documentElement.requestFullscreen){
           await document.documentElement.requestFullscreen({navigationUI:"hide"}).catch(()=>document.documentElement.requestFullscreen());
         }
       }catch(e){
         // Pseudo-fullscreen mode remains active even if the browser rejects native fullscreen.
       }

       try{await screen.orientation?.lock?.("landscape")}catch(e){}
     }else{
       if(document.fullscreenElement){
         try{await document.exitFullscreen()}catch(e){}
       }
       setRideFullscreenMode(false);
       try{screen.orientation?.unlock?.()}catch(e){}
     }
   }catch(e){
     $d("#dashStatus").textContent="Fullscreen gagal: "+(e?.message||e);
   }
 });

 document.addEventListener("fullscreenchange",()=>{
   // If browser exits fullscreen via Back/gesture, clean up the fixed dashboard too.
   if(!document.fullscreenElement && document.body.classList.contains("ride-fullscreen-mode")){
     setRideFullscreenMode(false);
     try{screen.orientation?.unlock?.()}catch(e){}
   }else if(document.fullscreenElement){
     setRideFullscreenMode(true);
   }
 });
 window.addEventListener("resize",()=>{
   [40,160,420].forEach(t=>setTimeout(()=>map?.resize(),t));
 });
 window.addEventListener("orientationchange",()=>{
   [80,280,650].forEach(t=>setTimeout(()=>map?.resize(),t));
 });
 setTimeout(()=>map?.resize(),300);

 // Android/Chrome usually does not require a permission prompt; iOS does.
 requestSensors();
}
function rLife(b){let s=rg("stats",{}),o=rg("opens",{}),tot=Object.values(o).reduce((a,x)=>a+(+x||0),0);b.innerHTML=`<div class="stats-grid life-grid">${[["plays","Play",s.plays||0],["cards","Cards",s.cards||0],["spots","Spots",s.spots||0],["garage","Garage logs",s.garage||0],["prompts","Prompts",s.prompts||0],["opens","Tool opens",tot]].map(x=>`<div class="stat-box"><span class="stat-value">${x[2]}</span><span class="stat-label">${x[1]}</span></div>`).join("")}</div><div class="tool-card"><b>Tool favorit</b><div class="mini-list">${Object.entries(o).sort((a,b)=>b[1]-a[1]).map(x=>`<div><span>${esc(x[0])}</span><strong>${x[1]}×</strong></div>`).join("")||"Belum ada data"}</div><button id="rReset" class="ghost">Reset Stats</button></div>`;on("#rReset","click",()=>{if(confirm("Reset Life Stats?")){rs("stats",{});rs("opens",{});rLife(b)}})}
function rPrompt(b){let a=rg("prompts",[]);b.innerHTML=`<div class="tool-card">${rf("Nama","pName","","text","Motor cinematic")}${rf("Kategori","pCat","","text","Photo / Coding")}<label>Prompt<textarea id="pText" rows="7" placeholder="Gunakan {variabel} bila perlu"></textarea></label><div class="tool-actions"><button id="pSave" class="primary">Simpan</button><button id="pCopy" class="ghost">Copy</button></div></div><div id="pList" class="tool-list"></div>`;let d=()=>$("#pList").innerHTML=a.map((x,i)=>`<div class="tool-row"><div><b>${esc(x.name)}</b><span>${esc(x.cat)}</span><p>${esc(x.text).slice(0,150)}</p></div><div><button data-pl="${i}" class="ghost tiny">Load</button><button data-pd="${i}" class="ghost tiny">×</button></div></div>`).join("")||'<p class="muted">Belum ada prompt.</p>';d();on("#pSave","click",()=>{let n=$("#pName").value.trim(),t=$("#pText").value.trim();if(!n||!t)return;a.unshift({name:n,cat:$("#pCat").value.trim(),text:t});rs("prompts",a);rstat("prompts",a.length);d()});on("#pCopy","click",()=>navigator.clipboard?.writeText($("#pText").value));$("#pList").onclick=e=>{let l=e.target.closest("[data-pl]"),x=e.target.closest("[data-pd]");if(l){let q=a[+l.dataset.pl];$("#pName").value=q.name;$("#pCat").value=q.cat;$("#pText").value=q.text}if(x){a.splice(+x.dataset.pd,1);rs("prompts",a);d()}}}
function rNP(b){let s=currentTrackInfo();b.innerHTML=`<div class="tool-card"><div class="np-card"><img src="${s?.youtube_id?ytThumb(s.youtube_id):""}"><p>NOW PLAYING</p><h2>${esc(s?titleFor(s):"No track playing")}</h2><span>${esc(s?artistFor(s):"VibeTube")}</span><b>RIC · VIBETUBE</b></div><button id="npShot" class="primary">Share / Screenshot</button><p class="tool-hint">Card memakai thumbnail YouTube aktif. Tombol Share memakai Web Share bila tersedia.</p></div>`;on("#npShot","click",async()=>{rstat("cards");let text=s?`${titleFor(s)} — ${artistFor(s)} · VibeTube`:"VibeTube";try{if(navigator.share)await navigator.share({title:"Now Playing",text});else await navigator.clipboard.writeText(text)}catch(e){}})}

const RD_DB="ric_digitalisasi_v1",RD_STORE="documents",RD_VAULT="ric_digital_vault_v1";
function rdB64(bytes){let s="";for(const v of bytes)s+=String.fromCharCode(v);return btoa(s)}
function rdBytes(value){const s=atob(value||"");return Uint8Array.from(s,c=>c.charCodeAt(0))}
function rdDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(RD_DB,1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(RD_STORE))db.createObjectStore(RD_STORE,{keyPath:"id"})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function rdAll(){const db=await rdDb();return new Promise((resolve,reject)=>{const req=db.transaction(RD_STORE,"readonly").objectStore(RD_STORE).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error)})}
async function rdPut(value){const db=await rdDb();return new Promise((resolve,reject)=>{const req=db.transaction(RD_STORE,"readwrite").objectStore(RD_STORE).put(value);req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error)})}
async function rdDelete(id){const db=await rdDb();return new Promise((resolve,reject)=>{const req=db.transaction(RD_STORE,"readwrite").objectStore(RD_STORE).delete(id);req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error)})}
async function rdDerive(pin,salt){const base=await crypto.subtle.importKey("raw",new TextEncoder().encode(pin),"PBKDF2",false,["deriveKey"]);return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:210000,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["encrypt","decrypt"])}
async function rdEncrypt(key,data){const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,data);return {iv:Array.from(iv),cipher:new Uint8Array(cipher)}}
async function rdDecrypt(key,row){return crypto.subtle.decrypt({name:"AES-GCM",iv:new Uint8Array(row.iv)},key,row.cipher)}
function rdVault(){try{return JSON.parse(localStorage.getItem(RD_VAULT)||"null")}catch(e){return null}}
async function rdCheckPin(pin){const vault=rdVault();if(!vault)return null;const key=await rdDerive(pin,rdBytes(vault.salt));const text=new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:rdBytes(vault.iv)},key,rdBytes(vault.check)));if(text!=="RIC-DIGITAL-V1")throw new Error("PIN salah");return key}
function rdClosePreview(){if(RIC.digitalObjectUrl){URL.revokeObjectURL(RIC.digitalObjectUrl);RIC.digitalObjectUrl=null}}
function rdClearThumbs(){for(const url of RIC.digitalThumbUrls||[])URL.revokeObjectURL(url);RIC.digitalThumbUrls=[]}
async function rdMakeThumb(file){
 if(!file.type.startsWith("image/"))return null;
 let bitmap=null;
 try{
  bitmap=await createImageBitmap(file);
  const maxW=360,maxH=220,scale=Math.max(maxW/bitmap.width,maxH/bitmap.height),sw=maxW/scale,sh=maxH/scale,sx=(bitmap.width-sw)/2,sy=(bitmap.height-sh)/2;
  const canvas=document.createElement("canvas");canvas.width=maxW;canvas.height=maxH;
  canvas.getContext("2d").drawImage(bitmap,sx,sy,sw,sh,0,0,maxW,maxH);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.78));
  return blob?await blob.arrayBuffer():null;
 }catch(e){return null}finally{try{bitmap?.close?.()}catch(e){}}
}
async function rdLoadThumb(row,el){
 if(!el||!row.mime.startsWith("image/"))return;
 try{
  const encrypted=row.thumbCipher?{iv:row.thumbIv,cipher:row.thumbCipher}:row;
  const data=await rdDecrypt(RIC.digitalKey,encrypted),mime=row.thumbCipher?(row.thumbMime||"image/jpeg"):row.mime;
  const url=URL.createObjectURL(new Blob([data],{type:mime}));RIC.digitalThumbUrls.push(url);
  const img=document.createElement("img");img.alt="Preview "+(row.label||row.docType);img.loading="lazy";img.src=url;el.replaceChildren(img);
 }catch(e){el.innerHTML='<span>▣</span>'}
}
function rDigital(b){
 const vault=rdVault();
 if(!vault||!RIC.digitalKey){
  b.innerHTML='<div class="tool-card digital-vault-intro"><div class="digital-lock-icon">▣</div><h2>Brankas Digital</h2><p class="muted">KTP, KK, SIM, dan STNK dienkripsi dengan PIN dan hanya disimpan di perangkat ini. File tidak dikirim ke cloud.</p>'+(vault?'<label>PIN brankas<input id="rdPin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="12" placeholder="Masukkan PIN"></label><button id="rdUnlock" class="primary">Buka Brankas</button>':'<label>Buat PIN (minimal 6 angka)<input id="rdPin" type="password" inputmode="numeric" autocomplete="new-password" maxlength="12" placeholder="Buat PIN"></label><label>Ulangi PIN<input id="rdPin2" type="password" inputmode="numeric" autocomplete="new-password" maxlength="12" placeholder="Ulangi PIN"></label><button id="rdSetup" class="primary">Buat Brankas</button>')+'<p id="rdStatus" class="status"></p><p class="tool-hint">Penting: PIN tidak dapat dipulihkan. Menghapus data aplikasi atau uninstall PWA dapat menghapus semua dokumen.</p></div>';
  const status=$("#rdStatus");
  on("#rdSetup","click",async()=>{const pin=$("#rdPin").value,pin2=$("#rdPin2").value;if(!/^\d{6,12}$/.test(pin)){status.textContent="Gunakan PIN 6–12 angka.";return}if(pin!==pin2){status.textContent="PIN tidak sama.";return}try{status.textContent="Membuat brankas…";const salt=crypto.getRandomValues(new Uint8Array(16)),key=await rdDerive(pin,salt),check=await rdEncrypt(key,new TextEncoder().encode("RIC-DIGITAL-V1"));localStorage.setItem(RD_VAULT,JSON.stringify({salt:rdB64(salt),iv:rdB64(new Uint8Array(check.iv)),check:rdB64(check.cipher)}));RIC.digitalKey=key;try{await navigator.storage?.persist?.()}catch(e){}rDigital(b)}catch(e){status.textContent="Gagal membuat brankas: "+e.message}});
  on("#rdUnlock","click",async()=>{try{status.textContent="Membuka…";RIC.digitalKey=await rdCheckPin($("#rdPin").value);rDigital(b)}catch(e){RIC.digitalKey=null;status.textContent="PIN salah atau brankas rusak."}});
  on("#rdPin","keydown",e=>{if(e.key==="Enter")$("#rdUnlock")?.click()});
  return;
 }
 b.innerHTML='<div class="tool-card digital-vault-head"><div><h2>Digitalisasi</h2><p class="muted">Brankas terenkripsi · hanya perangkat ini</p></div><button id="rdLock" class="ghost tiny">Kunci</button></div><div class="tool-card"><div class="two-fields"><label>Jenis dokumen<select id="rdType"><option>KTP</option><option>KK</option><option>SIM</option><option>STNK</option><option>Lainnya</option></select></label><label>Nama/catatan<input id="rdLabel" maxlength="60" placeholder="Contoh: KTP Ric"></label></div><label class="digital-file-picker">Pilih foto atau PDF<input id="rdFile" type="file" accept="image/*,application/pdf"></label><button id="rdSave" class="primary">Enkripsi & Simpan</button><p id="rdStatus" class="status"></p></div><div class="digital-section-head"><b>Dokumen tersimpan</b><span id="rdStorage" class="muted"></span></div><div id="rdList" class="tool-list"><p class="muted">Memuat…</p></div><div id="rdPreview" class="digital-preview hidden"><div class="digital-preview-head"><b id="rdPreviewTitle">Dokumen</b><button id="rdPreviewClose">×</button></div><div id="rdPreviewBody"></div></div>';
 const status=$("#rdStatus"),list=$("#rdList");
 async function render(){try{rdClearThumbs();const rows=(await rdAll()).sort((a,z)=>z.createdAt-a.createdAt);list.innerHTML=rows.map(x=>'<div class="tool-row digital-doc-row"><button class="digital-doc-thumb '+(x.mime==="application/pdf"?"is-pdf":"")+'" data-rd-view="'+x.id+'" data-rd-thumb="'+x.id+'" aria-label="Buka preview">'+(x.mime==="application/pdf"?'<span>PDF</span>':'<span>▣</span>')+'</button><div class="digital-doc-copy"><b><span class="digital-type">'+esc(x.docType)+'</span> '+esc(x.label||x.docType)+'</b><span>'+new Date(x.createdAt).toLocaleString("id-ID",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})+' · '+(x.size/1048576).toFixed(1)+' MB</span></div><div class="digital-doc-actions"><button class="ghost tiny" data-rd-view="'+x.id+'">Buka</button><button class="ghost tiny digital-delete" data-rd-del="'+x.id+'">Hapus</button></div></div>').join("")||'<p class="muted">Belum ada dokumen.</p>';for(const row of rows){const el=list.querySelector('[data-rd-thumb="'+CSS.escape(row.id)+'"]');if(el&&row.mime.startsWith("image/"))await rdLoadThumb(row,el)}if(navigator.storage?.estimate){const q=await navigator.storage.estimate();$("#rdStorage").textContent=q.usage?"Terpakai "+(q.usage/1048576).toFixed(1)+" MB":""}}catch(e){list.innerHTML='<p class="status">Gagal membaca brankas.</p>'}}
 on("#rdLock","click",()=>{rdClosePreview();rdClearThumbs();RIC.digitalKey=null;rDigital(b)});
 on("#rdSave","click",async()=>{const file=$("#rdFile").files?.[0];if(!file){status.textContent="Pilih foto atau PDF.";return}if(file.size>15*1024*1024){status.textContent="Ukuran maksimal 15 MB per file.";return}try{status.textContent="Membuat preview terenkripsi…";const thumbData=await rdMakeThumb(file),thumb=thumbData?await rdEncrypt(RIC.digitalKey,thumbData):null;status.textContent="Mengenkripsi dokumen…";const encrypted=await rdEncrypt(RIC.digitalKey,await file.arrayBuffer());await rdPut({id:crypto.randomUUID(),docType:$("#rdType").value,label:$("#rdLabel").value.trim(),mime:file.type||"application/octet-stream",size:file.size,createdAt:Date.now(),iv:encrypted.iv,cipher:encrypted.cipher,thumbIv:thumb?.iv||null,thumbCipher:thumb?.cipher||null,thumbMime:thumb?"image/jpeg":null});$("#rdFile").value="";$("#rdLabel").value="";status.textContent="Dokumen terenkripsi dan tersimpan.";await render()}catch(e){status.textContent="Gagal menyimpan: "+e.message}});
 list.onclick=async e=>{const view=e.target.closest("[data-rd-view]"),del=e.target.closest("[data-rd-del]");if(view){const rows=await rdAll(),row=rows.find(x=>x.id===view.dataset.rdView);if(!row)return;try{view.disabled=true;const data=await rdDecrypt(RIC.digitalKey,row);rdClosePreview();const blob=new Blob([data],{type:row.mime}),url=URL.createObjectURL(blob);RIC.digitalObjectUrl=url;$("#rdPreviewTitle").textContent=row.label||row.docType;const body=$("#rdPreviewBody");body.innerHTML=row.mime.startsWith("image/")?'<img alt="Pratinjau dokumen">':'<iframe title="Pratinjau dokumen"></iframe><a class="primary linkbtn digital-open-file" target="_blank" rel="noopener">Buka file</a>';const media=body.querySelector("img,iframe");if(media)media.src=url;const link=body.querySelector("a");if(link)link.href=url;$("#rdPreview").classList.remove("hidden")}catch(err){status.textContent="Gagal membuka dokumen."}finally{view.disabled=false}}if(del){if(!confirm("Hapus dokumen ini secara permanen dari perangkat?"))return;await rdDelete(del.dataset.rdDel);await render()}};
 on("#rdPreviewClose","click",()=>{rdClosePreview();$("#rdPreview").classList.add("hidden");$("#rdPreviewBody").innerHTML=""});
 render();
}

function rGarage(b){let a=rg("garage",[]);b.innerHTML=`<div class="tool-card">${rf("Odometer km","gKm","","number","32450")}${rf("Jenis","gType","","text","Ganti oli / Bensin / Part")}${rf("Biaya Rp","gCost","","number","50000")}<label>Catatan<textarea id="gNote" rows="3"></textarea></label><button id="gSave" class="primary">Tambah Log</button></div><div id="gList" class="tool-list"></div>`;let d=()=>$("#gList").innerHTML=a.map((x,i)=>`<div class="tool-row"><div><b>${esc(x.type)}</b><span>${(+x.km).toLocaleString("id-ID")} km · Rp${(+x.cost).toLocaleString("id-ID")}</span><p>${esc(x.note)}</p></div><button data-gd="${i}" class="ghost tiny">×</button></div>`).join("")||'<p class="muted">Belum ada log.</p>';d();on("#gSave","click",()=>{let t=$("#gType").value.trim();if(!t)return;a.unshift({km:+$("#gKm").value||0,type:t,cost:+$("#gCost").value||0,note:$("#gNote").value.trim()});rs("garage",a);rstat("garage",a.length);d()});$("#gList").onclick=e=>{let x=e.target.closest("[data-gd]");if(x){a.splice(+x.dataset.gd,1);rs("garage",a);d()}}}
function rSpots(b){let a=rg("spots",[]);b.innerHTML=`<div class="tool-card">${rf("Nama spot","sName","","text","Viewpoint")}${rf("Waktu terbaik","sTime","","text","05:30 / malam")}<div class="two-fields">${rf("Latitude","sLat","","number")}${rf("Longitude","sLng","","number")}</div><label>Catatan angle<textarea id="sNote" rows="3"></textarea></label><div class="tool-actions"><button id="sGPS" class="ghost">Ambil GPS</button><button id="sSave" class="primary">Simpan</button></div></div><div id="sList" class="tool-list"></div>`;let d=()=>$("#sList").innerHTML=a.map((x,i)=>`<div class="tool-row"><div><b>${esc(x.name)}</b><span>${esc(x.time)} · ${(+x.lat).toFixed(5)}, ${(+x.lng).toFixed(5)}</span><p>${esc(x.note)}</p></div><div><a class="ghost tiny linkbtn" target="_blank" href="https://www.google.com/maps/search/?api=1&query=${x.lat},${x.lng}">Map</a><button data-sd="${i}" class="ghost tiny">×</button></div></div>`).join("")||'<p class="muted">Belum ada spot.</p>';d();on("#sGPS","click",()=>navigator.geolocation.getCurrentPosition(p=>{$("#sLat").value=p.coords.latitude;$("#sLng").value=p.coords.longitude}));on("#sSave","click",()=>{let n=$("#sName").value.trim(),lat=+$("#sLat").value,lng=+$("#sLng").value;if(!n||!isFinite(lat)||!isFinite(lng))return;a.unshift({name:n,time:$("#sTime").value.trim(),lat,lng,note:$("#sNote").value.trim()});rs("spots",a);rstat("spots",a.length);d()});$("#sList").onclick=e=>{let x=e.target.closest("[data-sd]");if(x){a.splice(+x.dataset.sd,1);rs("spots",a);d()}}}
function ricTrackPlay(){rstat("plays")}

function register(){
 document.addEventListener("click",e=>{
  const cat=e.target.closest("[data-cat]");
  if(cat){
   e.preventDefault();
   const targetCat=cat.dataset.cat;
   showView("homeView");
   requestAnimationFrame(()=>setCategory(targetCat));
   return;
  }
  const song=e.target.closest(".song");if(song)playIndex(+song.dataset.i)
 });
 on("#refreshBtn","click",()=>generateMix("refresh"));
 on("#mixBtn","click",()=>generateMix("new_mix"));
 on("#nextBtn","click",next);on("#prevBtn","click",prev);on("#playBtn","click",togglePlay);
 on("#fullNext","click",next);on("#fullPrev","click",prev);on("#fullPlay","click",togglePlay);
 on("#closePlayer","click",()=>$("#fullPlayer")?.classList.add("hidden"));
 on("#musicModeBtn","click",()=>setMode("music"));on("#videoModeBtn","click",()=>setMode("video"));
 on("#seekBar","input",e=>{if(!state.player||!state.ready)return;const dur=state.player.getDuration()||0;if(dur)state.player.seekTo(dur*(+e.target.value/1000),true);syncProgress()});
 on("#searchBtn","click",doSearch);on("#searchInput","keydown",e=>{if(e.key==="Enter")doSearch()});
 on("#saveCloud","click",()=>{localStorage.setItem("vt_supabase_url",$("#supabaseUrl")?.value.trim()||"");localStorage.setItem("vt_supabase_key",$("#supabaseKey")?.value.trim()||"");setCloudStatus("Cloud config tersimpan. Memuat mix baru…");refreshCatalogStats();generateMix("cloud_config")});
 const urlInput=$("#supabaseUrl"),keyInput=$("#supabaseKey");if(urlInput)urlInput.value=localStorage.getItem("vt_supabase_url")||window.VIBETUBE_CLOUD_URL||"";if(keyInput)keyInput.value=localStorage.getItem("vt_supabase_key")||window.VIBETUBE_CLOUD_KEY||"";
 document.querySelectorAll(".nav").forEach(n=>n.onclick=()=>showView(n.dataset.view));
 on("#ricLauncher","click",pushRicSpace);
 on("#ricSpaceBack","click",()=>{if(history.state?.vtView==="ricSpaceView")history.back();else showView(sessionStorage.getItem("vt_last_main_view")||"homeView")});
 on("#ricToolBack","click",()=>{if(history.state?.vtView==="ricToolView")history.back();else showView("ricSpaceView")});
 document.querySelectorAll("[data-tool]").forEach(el=>el.addEventListener("click",()=>openRicTool(el.dataset.tool)));
 if(!history.state?.vtView)history.replaceState({...history.state,vtView:activeViewId()},"");
 window.addEventListener("popstate",e=>restoreNavigationState(e.state));
 document.querySelectorAll("[data-view-target]").forEach(el=>el.addEventListener("click",()=>showView(el.dataset.viewTarget)));
 const smart=$("#smartMixMode");if(smart){smart.checked=state.smartMix!==false;smart.onchange=()=>{state.smartMix=smart.checked;localStorage.setItem("vt_smart_mix",smart.checked?"1":"0");updateSmartMixStatus();generateMix("smart_mode_change")}}updateSmartMixStatus();
 on("#refreshStatsBtn","click",refreshCatalogStats);
 const syncBtn=$("#syncCatalogBtn");if(syncBtn)syncBtn.onclick=syncAllCatalogs;
}
const recoveredStartup=restorePlaybackState();
renderChips();renderPlaylists();renderSongs();
const initialTitle=$("#sectionTitle");if(initialTitle)initialTitle.textContent=CATEGORIES.find(c=>c.slug===state.category)?.name||"Fresh Mix";
register();setMode(state.mode);setupMediaSession();setupBackgroundResilience();startCatalogStatsPolling();setupYT();
try{
 const qp=new URLSearchParams(location.search);
 if(qp.get("view")==="ric-space"){
  history.replaceState({vtView:"ricSpaceView"},"",location.pathname);
  showView("ricSpaceView");
 }
}catch(e){}
if(!recoveredStartup||(!state.queue.length&&state.category!=="japanese-nightcore"))generateMix("startup");
