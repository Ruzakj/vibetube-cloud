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
function openRicTool(n,fromHistory=false){if(!fromHistory&&!(history.state?.vtView==="ricToolView"&&history.state?.ricTool===n))history.pushState({vtView:"ricToolView",ricTool:n},"");showView("ricToolView");let m={speedmap:["Speedometer + Arah","GPS speed, kompas & arah"],promptlab:["Prompt Lab","Template prompt personal"],nowplaying:["Card Studio","Buat kartu dari track VibeTube aktif"],digitalisasi:["Digitalisasi","Brankas KTP, KK, SIM & STNK"],expense:["Expense Tracker","Budget & insight keuangan personal"],photospots:["Photo Spot Book","Koleksi spot foto"]};if(!m[n]){showView("ricSpaceView");return}$("#ricToolView").dataset.tool=n;$("#ricToolBody").className="ric-tool-body tool-"+n;$("#ricToolTitle").textContent=m[n][0];$("#ricToolSubtitle").textContent=m[n][1];let o=rg("opens",{});o[n]=(o[n]||0)+1;rs("opens",o);({speedmap:rSpeed,promptlab:rPrompt,nowplaying:rNP,digitalisasi:rDigital,expense:rExpense,photospots:rSpots}[n])($("#ricToolBody"))}
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
     $("#rdCount").textContent=rows.length+" FILE";list.innerHTML=rows.map(x=>`<button class="ride-history-row" data-ride="${x.id}"><div><b>${new Date(x.started_at).toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"})}</b><span>${new Date(x.started_at).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})} · ${fmtDuration(x.duration_sec)}</span></div><div><strong>${(Number(x.distance_m)/1000).toFixed(1)} km</strong><span>MAX ${Math.round(x.max_speed_kmh||0)} km/h · LEAN ${Math.round(x.max_lean_left||0)}°/${Math.round(x.max_lean_right||0)}°</span></div></button>`).join("")||'<p class="tool-hint">Belum ada Ride History.</p>';
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

 let mapboxLoader=null;
 function loadMapbox(){
   if(window.mapboxgl)return Promise.resolve();
   if(mapboxLoader)return mapboxLoader;
   mapboxLoader=new Promise((resolve,reject)=>{
     if(!document.querySelector("link[data-mapbox]")){const css=document.createElement("link");css.rel="stylesheet";css.href="https://api.mapbox.com/mapbox-gl-js/v3.14.0/mapbox-gl.css";css.dataset.mapbox="1";document.head.appendChild(css)}
     const js=document.createElement("script");js.src="https://api.mapbox.com/mapbox-gl-js/v3.14.0/mapbox-gl.js";js.async=true;js.onload=resolve;js.onerror=()=>reject(new Error("Mapbox GL gagal dimuat"));document.head.appendChild(js);
   });
   return mapboxLoader;
 }
 async function initMap(){
   try{await loadMapbox()}catch(e){$d("#dashStatus").textContent=e.message;return}
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
const RIC_PROMPT_STARTERS=[{"name":"Natural Photo Enhance","cat":"Photo · Enhancement","text":"Edit foto secara langsung dengan hasil natural dan realistis. Tingkatkan ketajaman detail, dynamic range, pencahayaan, serta reduksi noise secara halus. Pertahankan wajah, bentuk tubuh, pakaian, pose, objek utama, latar, perspektif, dan seluruh detail asli. Gunakan white balance netral, warna bersih, highlight terkontrol, shadow tetap berdetail, dan hindari hasil berlebihan, oversaturated, terlalu kuning, atau terlihat seperti AI."},{"name":"Latest iPhone Pro Look","cat":"Photo · Color Grade","text":"Terapkan tampilan kamera iPhone Pro terbaru pada foto ini tanpa mengubah isi foto. Gunakan Smart HDR yang natural, white balance netral, skin tone akurat, highlight lembut, shadow terbuka secukupnya, detail tajam namun tidak over-sharpened, serta warna hijau dan langit yang realistis. Hindari yellow cast, saturasi berlebihan, efek plastik, dan perubahan pada subjek manusia."},{"name":"Keep Human 100% Original","cat":"Photo · Safe Edit","text":"EDIT THE IMAGE DIRECTLY. Pertahankan subjek manusia 100% seperti foto asli: jangan mengubah wajah, ekspresi, rambut, pose, bentuk tubuh, proporsi, pakaian, aksesori, warna kulit, atau identitas. Hanya ubah bagian berikut: {jelaskan_area_yang_diubah}. Samakan pencahayaan, bayangan, perspektif, depth of field, grain, dan kualitas kamera agar edit menyatu secara realistis."},{"name":"Motor Cinematic Night","cat":"Motorcycle · Photo","text":"Buat foto motor terlihat cinematic, modern, dan realistis tanpa mengubah desain atau komponen motor sedikit pun. Pertajam tekstur mesin, ban, rangka, cat, dan refleksi metal. Gunakan pencahayaan samping yang terarah, black level dalam tetapi tetap berdetail, tone netral dengan aksen teal dan merah yang sangat halus, depth of field natural seperti lensa 50mm f/1.8, serta grain film tipis. Hindari golden hour, bentuk motor berubah, dan tampilan AI."},{"name":"Remove Background Clean","cat":"Photo · Cutout","text":"Hapus seluruh latar belakang dan semua objek lain, lalu pertahankan hanya {objek_utama}. Jangan mengubah bentuk, warna, tekstur, proporsi, bayangan internal, tulisan, logo, atau detail objek utama. Rapikan tepi secara presisi termasuk bagian tipis dan transparan. Hasil akhir harus berupa PNG dengan background transparan dan resolusi setinggi mungkin."},{"name":"Waterfall Natural Long Exposure","cat":"Photo · Landscape","text":"Tambahkan intensitas aliran air pada air terjun secara moderat dan buat gerakan air menyerupai long exposure yang realistis. Pertahankan batu, pepohonan, manusia, komposisi, perspektif, warna lingkungan, dan pencahayaan asli. Air harus menyatu dengan jalur alami, memiliki volume yang masuk akal, detail cipratan halus, dan tidak terlihat berlebihan atau dihasilkan AI."},{"name":"Food Photo Premium","cat":"Photo · Product","text":"Tingkatkan foto makanan agar terlihat premium, menggugah selera, dan tetap natural. Jadikan {makanan_utama} sebagai fokus, pertajam tekstur penting, seimbangkan warna, kurangi gangguan latar, dan tambahkan depth of field lembut seperti kamera profesional. Pertahankan bentuk dan jumlah makanan asli. Hindari warna terlalu merah, kuning berlebihan, kilap palsu, serta styling yang tidak ada pada foto."},{"name":"PWA Full Audit & Fix","cat":"Coding · PWA","text":"Audit proyek PWA ini secara menyeluruh. Temukan penyebab error, lag, stuck, event listener ganda, race condition, cache/service worker usang, masalah responsive layout, elemen tumpang tindih, tombol yang tidak dapat diklik, serta state yang hilang saat aplikasi ditutup. Perbaiki langsung tanpa menghapus fitur yang sudah bekerja. Pertahankan data pengguna, optimalkan untuk Android portrait dan landscape, kemudian jalankan pemeriksaan sintaks, alur navigasi, persistence, dan cache update sebelum deploy."},{"name":"Modern Minimal UI Upgrade","cat":"Coding · UI/UX","text":"Perbarui antarmuka menjadi modern, minimalis, premium, dan konsisten tanpa mengubah fungsi inti. Gunakan hierarchy teks yang jelas, spacing lega, kartu sederhana, radius konsisten, warna gelap netral dengan satu aksen, tombol mudah disentuh, serta responsive layout yang pas di layar Android tanpa horizontal overflow. Hindari dekorasi berlebihan, gradient terlalu ramai, animasi berat, dan komponen yang saling tumpang tindih."},{"name":"Bug Reproduction & Root Cause","cat":"Coding · Debug","text":"Jangan langsung menebak solusi. Reproduksi masalah berikut: {jelaskan_bug}. Telusuri alur event, state, DOM, network, storage, service worker, dan console error. Identifikasi root cause yang dapat dibuktikan, jelaskan singkat mengapa bug terjadi, implementasikan perbaikan paling kecil yang stabil, lalu uji kasus normal, kasus tepi, refresh, background/foreground, dan tombol Back Android."},{"name":"Trip Planner Indonesia","cat":"Travel · Planning","text":"Buat rencana perjalanan ke {tujuan} untuk {jumlah_orang} orang selama {durasi}. Susun jadwal realistis, urutan lokasi yang efisien, estimasi waktu perjalanan, transportasi, tiket, bensin, makan, parkir, perlengkapan, cuaca yang perlu diantisipasi, serta dana darurat. Tampilkan total anggaran dan biaya per orang. Prioritaskan keselamatan, waktu istirahat, dan opsi cadangan jika cuaca atau akses berubah."},{"name":"Instagram Caption Personal","cat":"Social · Writing","text":"Buat caption Instagram untuk foto {konteks_foto}. Gunakan gaya personal, tenang, percaya diri, sedikit puitis tetapi tidak berlebihan atau terkesan dibuat AI. Hindari kalimat motivasi klise. Buat 3 versi: sangat pendek, medium, dan storytelling singkat. Tambahkan maksimal 5 hashtag yang relevan dan tidak spam."},{"name":"Prompt Refiner Pro","cat":"AI · Prompting","text":"Ubah instruksi berikut menjadi prompt yang jelas dan mudah dipahami AI: {instruksi_awal}. Pertahankan tujuan utama, lalu susun prioritas perubahan, bagian yang wajib dipertahankan, batasan yang dilarang, standar realisme, komposisi, pencahayaan, perspektif, kualitas hasil, serta kriteria keberhasilan. Hilangkan instruksi yang bertentangan dan jangan menambahkan perubahan yang tidak diminta."},{"name":"Document Scan Cleanup","cat":"Document · Archive","text":"Rapikan hasil scan dokumen pribadi ini hanya untuk arsip digital. Luruskan perspektif, crop tepi dokumen, netralkan white balance, kurangi bayangan dan glare, tingkatkan keterbacaan teks, serta bersihkan noise secara halus. Jangan mengubah, menebak, menambahkan, mengganti, atau merekonstruksi data, nomor, foto identitas, tanda tangan, cap, barcode, maupun elemen keamanan dokumen."},{"name":"Add Woman to Motorcycle — Natural","cat":"Photo · Composite","text":"Add a realistic young woman to the original motorcycle photo without changing or regenerating any part of the existing image. Preserve the motorcycle, background, lighting, composition, camera angle, perspective, reflections, image noise, and all original details exactly. Let her naturally lean against or sit on the motorcycle—choose the pose that best fits the existing angle. Use realistic anatomy, scale, body weight, contact points, hand placement, feet placement, shadows, and depth of field. Her outfit and attitude should complement the existing man's overall style while remaining feminine and unique. She should look toward the camera with a soft candid expression. Apply only extremely subtle handheld motion blur to her while keeping the face recognizable."},{"name":"Woman from Face Reference","cat":"Photo · Composite","text":"Use the second attached image only as the facial identity reference for the woman. Add her naturally into the first photo without altering the original subject, motorcycle, background, lighting, camera angle, or composition. Preserve her recognizable facial structure while adapting expression, hair, body pose, perspective, lighting, color temperature, grain, and sharpness to match the first photo. Choose a feminine outfit whose overall aesthetic and color palette complement the man's style without copying his clothes exactly."},{"name":"Natural Couple Goals","cat":"Photo · Portrait","text":"Keep the original photo unchanged except for the requested subtle interaction or expression adjustment. Make the two subjects feel naturally close like a candid couple moment—relaxed posture, believable eye direction, soft genuine expressions, and realistic personal space. Do not exaggerate affection, change identities, alter clothing, reshape bodies, or create a staged model pose. Match all original lighting, shadows, perspective, depth of field, and camera texture."},{"name":"Cafe Portrait — Neutral Cinematic","cat":"Photo · Portrait","text":"Enhance this café portrait while preserving the human subject exactly. Keep the warm café atmosphere but neutralize excessive yellow and orange cast. Brighten the face subtly, balance highlights and shadows, soften distracting background details, reduce the dominance of the table, and add gentle subject separation with natural depth of field. If requested, add a realistic cup of coffee and subtle light rays that match the existing perspective and lighting. Keep skin tones neutral and avoid an overprocessed AI look."},{"name":"Mountain Fog Portrait","cat":"Photo · Portrait","text":"Improve this mountain portrait without changing the person, pose, outfit, face, rocks, or natural landscape. Use a selective mask to brighten the subject, recover fog highlights, add only light dehaze, and preserve the misty mountain atmosphere. Create gentle depth using a natural fog gradient, balanced contrast, neutral color temperature, and realistic skin tone. Avoid oversaturation, artificial skies, or removing the characteristic fog."},{"name":"Night Portrait — Clean Cinematic","cat":"Photo · Portrait","text":"Enhance this night portrait while keeping the subject completely unchanged. Reduce harsh overhead flare and distracting lamps, soften direct flash, brighten the face naturally, recover shadow detail, and gently blur or de-emphasize the background. Use a clean neutral cinematic grade, realistic night colors, subtle grain, and balanced highlights. Do not make the image yellow, plastic, overly smooth, or artificially bright."},{"name":"Retro Kodak Motorcycle Night","cat":"Motorcycle · Photo","text":"Apply a realistic retro Kodak night-film look to the motorcycle photo without changing the motorcycle or scene geometry. Use deep but detailed blacks, restrained warm highlights, neutral midtones, subtle halation around practical lights, fine analog grain, and natural wet-ground reflections. Emphasize engine texture and metal surfaces with controlled directional light. Avoid golden-hour coloring, heavy teal-orange grading, fake fog, or excessive film damage."},{"name":"Motorcycle Motion Blur","cat":"Motorcycle · Action","text":"Create a realistic sense of motorcycle movement while preserving the exact motorcycle design, rider, camera perspective, and original environment. Add physically believable rotational blur to the wheels and directional motion blur to the background while keeping the main motorcycle and important details sharp. Match the road direction, speed, lighting, reflections, and depth of field. Avoid warped wheels, stretched bodywork, fake speed lines, or excessive blur."},{"name":"Motorcycle Detail Enhancement","cat":"Motorcycle · Photo","text":"Enhance every visible detail of the main motorcycle without redesigning it. Increase clarity selectively on the engine, frame, exhaust, tank, suspension, tires, cables, bolts, paint texture, and metal reflections. Deepen blacks while retaining detail and reduce attention from background motorcycles or people. Keep the original proportions, components, decals, scratches, camera angle, and natural lighting."},{"name":"Remove Distracting Person or Motorcycle","cat":"Photo · Cleanup","text":"Remove only {objek_yang_dihapus} from the original photo. Reconstruct the covered background using nearby textures, geometry, lighting, reflections, shadows, and depth of field so the edit is invisible. Do not change the main person, main motorcycle, composition, crop, colors, perspective, or any unrelated detail."},{"name":"Square 1:1 Without Changing Photo","cat":"Photo · Resize","text":"Convert this image to a clean 1:1 square composition and improve clarity without changing any existing person, object, face, motorcycle, background detail, color, or lighting. Extend or crop only where necessary, prioritizing the original composition and keeping the main subject naturally centered. Avoid stretching, regenerating details, face alteration, aggressive sharpening, or adding new objects."},{"name":"Black & White Line Art","cat":"Illustration · Line Art","text":"Convert the supplied image into clean black-and-white line art. Preserve the exact silhouette, proportions, perspective, components, and recognizable details. Use confident variable-width outlines, simplified internal detail, pure white background, and solid black or dark-gray lines. Remove photographic colors, textures, shadows, and background clutter without redesigning the subject."},{"name":"Whimsical Hand-Painted Animation","cat":"Illustration · Animation","text":"Transform the photo into a warm hand-painted Japanese animation illustration with soft watercolor backgrounds, expressive but recognizable faces, gentle natural lighting, organic linework, and a whimsical cinematic atmosphere. Preserve the original identities, pose, clothing, composition, key objects, and environment. Avoid exaggerated anatomy, overly saturated colors, or changing the scene meaning."},{"name":"Dark Anime Portrait — Red Eyes","cat":"Illustration · Anime","text":"Create a dark anime-inspired close-up portrait based on the original subject. Preserve the recognizable facial structure, hairstyle, pose, and outfit. Use dramatic low-key lighting, deep neutral shadows, subtle atmospheric particles, and controlled glowing red eyes as the main accent. Keep the result elegant and cinematic—not demonic, gory, oversaturated, or cluttered."},{"name":"Anime Hunter Aura — Purple Gold","cat":"Illustration · Anime","text":"Turn the subject into a powerful anime close-up with an intense hunter-like presence. Preserve identity and facial proportions. Add a controlled purple-and-gold energy aura concentrated around the eyes and silhouette, layered atmospheric depth, sharp rim lighting, subtle particles, and cinematic contrast. Keep the face readable and avoid excessive glow, random symbols, distorted anatomy, or an overbusy background."},{"name":"Character Reference Sheet — Multi Angle","cat":"Design · Character","text":"Create a clean character reference sheet from the supplied subject showing front, back, left side, right side, front three-quarter, and back three-quarter views. Preserve the same face, hairstyle, body proportions, outfit, colors, accessories, and design details consistently across every angle. Use a plain neutral background, even studio lighting, aligned scale, relaxed neutral pose, and no dramatic perspective."},{"name":"Hair Color Brand Comparison","cat":"Beauty · Hair","text":"Create a neat comparison collage using the original portrait and change only the hair color in each panel. Keep the face, skin tone, hairstyle shape, body, pose, clothes, lighting, and background identical. Show realistic shades inspired by available Miranda or Garnier hair-color families, with natural roots, highlights, shadows, and hair texture. Label each shade clearly without altering identity."},{"name":"1/7 Motorcycle Figure — RIC","cat":"Product · Miniature","text":"Create a realistic 1/7-scale collectible figure of the exact motorcycle shown in the reference, preserving all design details, colors, parts, decals, and proportions. Place it on a premium transparent acrylic display base labeled “RIC”, on a clean desk beside a laptop showing the motorcycle's 3D model. Use realistic miniature materials, studio product lighting, shallow depth of field, and believable scale."},{"name":"Rotating Figure Product Video","cat":"Video · Product","text":"Create a premium product-video sequence of the 1/7-scale motorcycle figure on its RIC acrylic base. Use a slow smooth 360-degree turntable rotation, macro detail shots of the engine and bodywork, controlled studio reflections, shallow depth of field, and subtle realistic exhaust smoke only if appropriate. Preserve the figure design consistently in every frame. Avoid camera shake, morphing parts, excessive smoke, or changing decals."},{"name":"Modern Cafe Racer Conversion","cat":"Motorcycle · Concept","text":"Convert the referenced motorcycle into a modern minimalist café racer while preserving the frame, engine, tank identity, wheel alignment, and as many original parts as possible. Use a clubman handlebar, compact modern seat matching the supplied reference, clean lighting, restrained colors, and only practical modifications that could realistically be built. Keep proportions believable and avoid extreme futuristic parts or a brat-café appearance."},{"name":"Motorcycle Front Three-Quarter View","cat":"Motorcycle · Reference","text":"Show the exact referenced motorcycle from a front three-quarter angle, continuing logically toward the rear. Preserve every component, paint color, decal, tire, wheel, engine detail, seat, handlebar, and body proportion. Use consistent studio lighting and realistic perspective. Do not redesign, simplify, mirror incorrectly, or invent hidden mechanical details."},{"name":"Photo Collage Side-by-Side Motorcycles","cat":"Photo · Composite","text":"Place the two referenced motorcycles side by side in one believable composition. Preserve both motorcycles exactly, match their scale, horizon, camera perspective, lighting, ground contact, shadows, reflections, sharpness, and image noise. Keep adequate spacing and a clean comparison layout. Do not merge components, change colors, or make either motorcycle look regenerated."}];
function rPrompt(b){
 let a=rg("prompts",[]);
 if(localStorage.getItem("ric_prompt_seed_v3")!=="1"){const existing=new Set(a.map(x=>String(x.name||"").toLowerCase()));a=[...a,...RIC_PROMPT_STARTERS.filter(x=>!existing.has(x.name.toLowerCase()))];rs("prompts",a);localStorage.setItem("ric_prompt_seed_v3","1")}
 let query="",category="Semua",page=0;const PER_PAGE=8;
 b.innerHTML='<div class="tool-card prompt-editor-card"><div class="prompt-card-head"><div><p>PROMPT EDITOR</p><b>Buat atau ubah template</b></div><span>＋</span></div>'+rf("Nama","pName","","text","Motor cinematic")+rf("Kategori","pCat","","text","Photo / Coding")+'<label>Prompt<textarea id="pText" rows="9" placeholder="Gunakan {variabel} bila perlu"></textarea></label><div class="tool-actions"><button id="pSave" class="primary">Simpan</button><button id="pCopy" class="ghost">Copy</button></div><p id="pStatus" class="tool-hint"></p></div><section class="prompt-library-panel"><div class="prompt-library-head"><div><p>PROMPT LIBRARY</p><b>Koleksi Template</b></div><span id="pTotal">0 prompt</span></div><label class="prompt-search"><span>⌕</span><input id="pSearch" type="search" autocomplete="off" placeholder="Cari judul atau kata di dalam prompt…"><button id="pSearchClear" type="button" aria-label="Hapus pencarian">×</button></label><div id="pCategories" class="prompt-category-bar" aria-label="Filter kategori"></div><div class="prompt-results-head"><span id="pResultInfo">Memuat…</span><span id="pPageInfo"></span></div><div id="pList" class="tool-list prompt-result-list"></div><div class="prompt-page-controls"><button id="pPrev" class="ghost">‹ Sebelumnya</button><button id="pNext" class="ghost">Berikutnya ›</button></div></section>';
 const list=$("#pList"),cats=$("#pCategories"),resultInfo=$("#pResultInfo"),pageInfo=$("#pPageInfo"),total=$("#pTotal"),status=$("#pStatus");
 function promptGroup(value){const c=String(value||"").toLocaleLowerCase("id");if(/photo|beauty|document/.test(c))return "Foto & Editing";if(/motorcycle|motor|product|video/.test(c))return "Motor & Kreatif";if(/illustration|design|anime|art/.test(c))return "Ilustrasi & Desain";if(/coding|ui|pwa|debug/.test(c))return "Coding & UI";if(/travel|social|writing/.test(c))return "Travel & Sosial";if(/ai|prompt/.test(c))return "AI & Prompt";return "Lainnya"}function categories(){const order=["Foto & Editing","Motor & Kreatif","Ilustrasi & Desain","Coding & UI","Travel & Sosial","AI & Prompt","Lainnya"];const used=new Set(a.map(x=>promptGroup(x.cat)));return ["Semua",...order.filter(x=>used.has(x))]}
 function filtered(){
  const q=query.trim().toLocaleLowerCase("id");
  return a.map((x,i)=>({x,i})).filter(({x})=>(category==="Semua"||promptGroup(x.cat)===category)&&(!q||[x.name,x.cat,x.text].some(v=>String(v||"").toLocaleLowerCase("id").includes(q))));
 }
 function renderCategories(){
  cats.innerHTML=categories().map(x=>'<button class="prompt-chip '+(x===category?"active":"")+'" data-pcat="'+esc(x)+'">'+esc(x)+'</button>').join("");
 }
 function render(){
  const rows=filtered(),pages=Math.max(1,Math.ceil(rows.length/PER_PAGE));page=Math.max(0,Math.min(page,pages-1));const shown=rows.slice(page*PER_PAGE,page*PER_PAGE+PER_PAGE);
  total.textContent=a.length+" prompt";resultInfo.textContent=rows.length+(query?" hasil pencarian":" prompt ditemukan");pageInfo.textContent="Halaman "+(page+1)+" / "+pages;
  list.innerHTML=shown.map(({x,i})=>'<article class="tool-row prompt-library-row"><div><div class="prompt-row-meta"><span>'+esc(x.cat||"Lainnya")+'</span><i>#'+String(i+1).padStart(2,"0")+'</i></div><b>'+esc(x.name)+'</b><p>'+esc(x.text).slice(0,230)+(String(x.text).length>230?"…":"")+'</p></div><div class="prompt-row-actions"><button data-pl="'+i+'" class="ghost tiny">Load</button><button data-pcopy="'+i+'" class="ghost tiny">Copy</button><button data-pd="'+i+'" class="ghost tiny prompt-delete">×</button></div></article>').join("")||'<div class="prompt-empty"><b>Tidak ada prompt ditemukan</b><span>Coba kata lain atau pilih kategori Semua.</span></div>';
  $("#pPrev").disabled=page<=0;$("#pNext").disabled=page>=pages-1;renderCategories();
 }
 on("#pSearch","input",e=>{query=e.target.value;page=0;render()});
 on("#pSearchClear","click",()=>{$("#pSearch").value="";query="";page=0;render();$("#pSearch").focus()});
 cats.onclick=e=>{const chip=e.target.closest("[data-pcat]");if(!chip)return;category=chip.dataset.pcat;page=0;render()};
 on("#pPrev","click",()=>{if(page>0){page--;render();list.scrollIntoView({behavior:"smooth",block:"start"})}});
 on("#pNext","click",()=>{if((page+1)*PER_PAGE<filtered().length){page++;render();list.scrollIntoView({behavior:"smooth",block:"start"})}});
 on("#pSave","click",()=>{const n=$("#pName").value.trim(),t=$("#pText").value.trim(),cat=$("#pCat").value.trim()||"Lainnya";if(!n||!t){status.textContent="Nama dan isi prompt wajib diisi.";return}a.unshift({name:n,cat,text:t});rs("prompts",a);rstat("prompts",a.length);status.textContent="Prompt tersimpan.";query="";category="Semua";page=0;$("#pSearch").value="";render()});
 on("#pCopy","click",async()=>{try{await navigator.clipboard.writeText($("#pText").value);status.textContent="Prompt disalin."}catch(e){status.textContent="Gagal menyalin prompt."}});
 list.onclick=async e=>{
  const load=e.target.closest("[data-pl]"),copy=e.target.closest("[data-pcopy]"),del=e.target.closest("[data-pd]");
  if(load){const q=a[+load.dataset.pl];$("#pName").value=q.name;$("#pCat").value=q.cat;$("#pText").value=q.text;status.textContent="Template dimuat ke editor.";window.scrollTo({top:0,behavior:"smooth"})}
  if(copy){try{await navigator.clipboard.writeText(a[+copy.dataset.pcopy].text);status.textContent="Prompt disalin."}catch(err){status.textContent="Gagal menyalin prompt."}}
  if(del){const item=a[+del.dataset.pd];if(!confirm('Hapus prompt "'+item.name+'"?'))return;a.splice(+del.dataset.pd,1);rs("prompts",a);render()}
 };
 render();
}
function rNP(b){
 if(RIC.npTimer){clearInterval(RIC.npTimer);RIC.npTimer=null}
 const track=currentTrackInfo(),id=track?.youtube_id||"",title=track?titleFor(track):"No track playing",artist=track?artistFor(track):"VibeTube",thumb=id?ytThumb(id):"";
 const savedTheme=localStorage.getItem("ric_np_theme")||"aura",theme=["aura","mono","glass"].includes(savedTheme)?savedTheme:"aura";
 b.innerHTML='<div class="np-premium-shell"><div class="np-toolbar"><div><p>NOW PLAYING STUDIO</p><b>Card Preview</b></div><div class="np-themes"><button data-np-theme="aura">Aura</button><button data-np-theme="mono">Mono</button><button data-np-theme="glass">Glass</button></div></div><div id="npPremiumCard" class="np-premium-card theme-'+theme+'" style="--np-art:url(\''+thumb+'\')"><div class="np-ambient"></div><div class="np-card-top"><span><i></i> NOW PLAYING</span><b>RIC / VIBETUBE</b></div><div class="np-art-wrap"><div class="np-art-frame">'+(thumb?'<img src="'+thumb+'" alt="Artwork lagu aktif">':'<div class="np-art-empty">♫</div>')+'<div class="np-art-shine"></div></div></div><div class="np-live-meta"><p id="npArtist">'+esc(artist)+'</p><h2 id="npTitle">'+esc(title)+'</h2><div class="np-equalizer" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="np-progress-track"><i id="npProgressFill"></i></div><div class="np-time"><span id="npCurrent">0:00</span><span id="npDuration">0:00</span></div></div><div class="np-card-foot"><span>PERSONAL MUSIC SPACE</span><b>R.</b></div></div><div class="np-action-grid"><button id="npOpen" class="ghost">Buka Player</button><button id="npCopy" class="ghost">Copy Info</button><button id="npShare" class="primary">Share Card</button></div><p id="npActionStatus" class="tool-hint">Tema dan progress mengikuti lagu yang sedang aktif.</p></div>';
 const card=$("#npPremiumCard"),status=$("#npActionStatus");
 function applyTheme(name){card.className="np-premium-card theme-"+name;localStorage.setItem("ric_np_theme",name);document.querySelectorAll("[data-np-theme]").forEach(x=>x.classList.toggle("active",x.dataset.npTheme===name))}
 applyTheme(theme);
 document.querySelectorAll("[data-np-theme]").forEach(x=>x.onclick=()=>applyTheme(x.dataset.npTheme));
 function info(){return track?title+" — "+artist+" · VibeTube"+(id?"\nhttps://youtu.be/"+id:""):"VibeTube · No track playing"}
 on("#npOpen","click",()=>{if(track)$("#fullPlayer")?.classList.remove("hidden");else status.textContent="Belum ada lagu aktif."});
 on("#npCopy","click",async()=>{try{await navigator.clipboard.writeText(info());status.textContent="Info lagu disalin."}catch(e){status.textContent="Gagal menyalin info."}});
 on("#npShare","click",async()=>{rstat("cards");try{if(navigator.share)await navigator.share({title:"Now Playing · VibeTube",text:info()});else{await navigator.clipboard.writeText(info());status.textContent="Web Share tidak tersedia · info disalin."}}catch(e){if(e?.name!=="AbortError")status.textContent="Share gagal."}});
 function live(){
  if($("#ricToolView")?.dataset.tool!=="nowplaying"){clearInterval(RIC.npTimer);RIC.npTimer=null;return}
  const current=currentTrackInfo();if((current?.youtube_id||"")!==id){clearInterval(RIC.npTimer);RIC.npTimer=null;rNP(b);return}
  let cur=state.lastKnownPosition||0,dur=state.lastKnownDuration||0;
  try{if(state.player&&state.ready){cur=Number(state.player.getCurrentTime?.()||cur);dur=Number(state.player.getDuration?.()||dur)}}catch(e){}
  $("#npProgressFill").style.width=(dur?Math.max(0,Math.min(100,cur/dur*100)):0)+"%";$("#npCurrent").textContent=formatTime(cur);$("#npDuration").textContent=formatTime(dur);
  card.classList.toggle("is-playing",!!state.playing);
 }
 live();RIC.npTimer=setInterval(live,750);
}

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
  b.innerHTML='<div class="tool-card digital-vault-intro digital-auth-card"><div class="digital-grid-glow"></div><div class="digital-lock-icon"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 5 54 13v17c0 14-8.4 23.5-22 29C18.4 53.5 10 44 10 30V13z"/><rect x="23" y="29" width="18" height="14" rx="4"/><path d="M27 29v-4a5 5 0 0 1 10 0v4"/></svg></div><p class="digital-eyebrow">RIC SECURE STORAGE</p><h2>Brankas Digital</h2><p class="digital-auth-copy">Simpan identitas penting dalam ruang privat yang hanya dapat dibuka dari perangkat ini.</p><div class="digital-security-strip"><span>AES-256</span><span>LOCAL VAULT</span><span>ZERO CLOUD</span></div><div class="digital-auth-form">'+(vault?'<label>PIN BRANKAS<input id="rdPin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="12" placeholder="••••••"></label><button id="rdUnlock" class="primary digital-main-action">Buka Brankas <span>→</span></button>':'<label>BUAT PIN · 6–12 ANGKA<input id="rdPin" type="password" inputmode="numeric" autocomplete="new-password" maxlength="12" placeholder="••••••"></label><label>ULANGI PIN<input id="rdPin2" type="password" inputmode="numeric" autocomplete="new-password" maxlength="12" placeholder="••••••"></label><button id="rdSetup" class="primary digital-main-action">Aktifkan Brankas <span>→</span></button>')+'<p id="rdStatus" class="status"></p></div><p class="digital-warning">PIN tidak dapat dipulihkan. Menghapus data aplikasi atau uninstall PWA dapat menghapus dokumen.</p></div>';
  const status=$("#rdStatus");
  on("#rdSetup","click",async()=>{const pin=$("#rdPin").value,pin2=$("#rdPin2").value;if(!/^\d{6,12}$/.test(pin)){status.textContent="Gunakan PIN 6–12 angka.";return}if(pin!==pin2){status.textContent="PIN tidak sama.";return}try{status.textContent="Membuat brankas…";const salt=crypto.getRandomValues(new Uint8Array(16)),key=await rdDerive(pin,salt),check=await rdEncrypt(key,new TextEncoder().encode("RIC-DIGITAL-V1"));localStorage.setItem(RD_VAULT,JSON.stringify({salt:rdB64(salt),iv:rdB64(new Uint8Array(check.iv)),check:rdB64(check.cipher)}));RIC.digitalKey=key;try{await navigator.storage?.persist?.()}catch(e){}rDigital(b)}catch(e){status.textContent="Gagal membuat brankas: "+e.message}});
  on("#rdUnlock","click",async()=>{try{status.textContent="Membuka…";RIC.digitalKey=await rdCheckPin($("#rdPin").value);rDigital(b)}catch(e){RIC.digitalKey=null;status.textContent="PIN salah atau brankas rusak."}});
  on("#rdPin","keydown",e=>{if(e.key==="Enter")$("#rdUnlock")?.click()});
  return;
 }
 b.innerHTML='<div class="digital-vault-shell"><div class="tool-card digital-vault-head"><div class="digital-vault-title"><div class="digital-vault-mark"><svg viewBox="0 0 64 64" aria-hidden="true"><rect x="9" y="10" width="46" height="44" rx="12"/><path d="M20 25h24M20 34h15M20 43h20"/></svg></div><div><p class="digital-eyebrow">SECURE DOCUMENT VAULT</p><h2>Digitalisasi</h2><p class="muted">Identitas digital · tersimpan lokal</p></div></div><div class="digital-head-actions"><span class="digital-encrypted-pill"><i></i>AES-256</span><button id="rdLock" class="ghost tiny">Kunci</button></div></div><div class="tool-card digital-upload-card"><div class="digital-card-title"><div><p class="digital-eyebrow">NEW DOCUMENT</p><h3>Tambah dokumen</h3></div><span>01</span></div><div class="two-fields digital-fields"><label>JENIS DOKUMEN<select id="rdType"><option>KTP</option><option>KK</option><option>SIM</option><option>STNK</option><option>Lainnya</option></select></label><label>NAMA / CATATAN<input id="rdLabel" maxlength="60" placeholder="Contoh: KTP Ric"></label></div><label class="digital-file-picker"><span class="digital-upload-icon"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 44V14M20 26l12-12 12 12"/><path d="M12 43v8h40v-8"/></svg></span><strong>Pilih foto atau PDF</strong><small>Ketuk untuk kamera, galeri, atau file · maks. 15 MB</small><input id="rdFile" type="file" accept="image/*,application/pdf"></label><button id="rdSave" class="primary digital-main-action">Enkripsi & Simpan <span>→</span></button><p id="rdStatus" class="status"></p></div><div class="digital-section-head"><div><p class="digital-eyebrow">PRIVATE LIBRARY</p><b>Dokumen tersimpan</b></div><div class="digital-library-meta"><strong id="rdCount">0 FILE</strong><span id="rdStorage" class="muted"></span></div></div><div id="rdList" class="tool-list digital-doc-grid"><p class="muted">Memuat…</p></div><div id="rdPreview" class="digital-preview hidden"><div class="digital-preview-head"><div><small>SECURE PREVIEW</small><b id="rdPreviewTitle">Dokumen</b></div><button id="rdPreviewClose">×</button></div><div id="rdPreviewBody"></div></div></div>';
 const status=$("#rdStatus"),list=$("#rdList");
 async function render(){try{rdClearThumbs();const rows=(await rdAll()).sort((a,z)=>z.createdAt-a.createdAt);list.innerHTML=rows.map(x=>'<div class="tool-row digital-doc-row" data-doc-type="'+esc(x.docType)+'"><button class="digital-doc-thumb '+(x.mime==="application/pdf"?"is-pdf":"")+'" data-rd-view="'+x.id+'" data-rd-thumb="'+x.id+'" aria-label="Buka preview">'+(x.mime==="application/pdf"?'<span>PDF</span>':'<span>▣</span>')+'</button><div class="digital-doc-copy"><b><span class="digital-type">'+esc(x.docType)+'</span> '+esc(x.label||x.docType)+'</b><span>'+new Date(x.createdAt).toLocaleString("id-ID",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})+' · '+(x.size/1048576).toFixed(1)+' MB</span></div><div class="digital-doc-actions"><button class="ghost tiny" data-rd-view="'+x.id+'">Buka</button><button class="ghost tiny digital-delete" data-rd-del="'+x.id+'">Hapus</button></div></div>').join("")||'<p class="muted">Belum ada dokumen.</p>';for(const row of rows){const el=list.querySelector('[data-rd-thumb="'+CSS.escape(row.id)+'"]');if(el&&row.mime.startsWith("image/"))await rdLoadThumb(row,el)}if(navigator.storage?.estimate){const q=await navigator.storage.estimate();$("#rdStorage").textContent=q.usage?"Terpakai "+(q.usage/1048576).toFixed(1)+" MB":""}}catch(e){list.innerHTML='<p class="status">Gagal membaca brankas.</p>'}}
 on("#rdFile","change",()=>{const f=$("#rdFile").files?.[0];if(f)status.textContent="Siap dienkripsi · "+f.name});
 on("#rdLock","click",()=>{rdClosePreview();rdClearThumbs();RIC.digitalKey=null;rDigital(b)});
 on("#rdSave","click",async()=>{const file=$("#rdFile").files?.[0];if(!file){status.textContent="Pilih foto atau PDF.";return}if(file.size>15*1024*1024){status.textContent="Ukuran maksimal 15 MB per file.";return}try{status.textContent="Membuat preview terenkripsi…";const thumbData=await rdMakeThumb(file),thumb=thumbData?await rdEncrypt(RIC.digitalKey,thumbData):null;status.textContent="Mengenkripsi dokumen…";const encrypted=await rdEncrypt(RIC.digitalKey,await file.arrayBuffer());await rdPut({id:crypto.randomUUID(),docType:$("#rdType").value,label:$("#rdLabel").value.trim(),mime:file.type||"application/octet-stream",size:file.size,createdAt:Date.now(),iv:encrypted.iv,cipher:encrypted.cipher,thumbIv:thumb?.iv||null,thumbCipher:thumb?.cipher||null,thumbMime:thumb?"image/jpeg":null});$("#rdFile").value="";$("#rdLabel").value="";status.textContent="Dokumen terenkripsi dan tersimpan.";await render()}catch(e){status.textContent="Gagal menyimpan: "+e.message}});
 list.onclick=async e=>{const view=e.target.closest("[data-rd-view]"),del=e.target.closest("[data-rd-del]");if(view){const rows=await rdAll(),row=rows.find(x=>x.id===view.dataset.rdView);if(!row)return;try{view.disabled=true;const data=await rdDecrypt(RIC.digitalKey,row);rdClosePreview();const blob=new Blob([data],{type:row.mime}),url=URL.createObjectURL(blob);RIC.digitalObjectUrl=url;$("#rdPreviewTitle").textContent=row.label||row.docType;const body=$("#rdPreviewBody");body.innerHTML=row.mime.startsWith("image/")?'<img alt="Pratinjau dokumen">':'<iframe title="Pratinjau dokumen"></iframe><a class="primary linkbtn digital-open-file" target="_blank" rel="noopener">Buka file</a>';const media=body.querySelector("img,iframe");if(media)media.src=url;const link=body.querySelector("a");if(link)link.href=url;$("#rdPreview").classList.remove("hidden")}catch(err){status.textContent="Gagal membuka dokumen."}finally{view.disabled=false}}if(del){if(!confirm("Hapus dokumen ini secara permanen dari perangkat?"))return;await rdDelete(del.dataset.rdDel);await render()}};
 on("#rdPreviewClose","click",()=>{rdClosePreview();$("#rdPreview").classList.add("hidden");$("#rdPreviewBody").innerHTML=""});
 render();
}


function rExpense(b){
 const KEY="expense_v1",BUDGET_KEY="expense_budget_v1",fmt=new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0});
 let rows=rg(KEY,[]),type="expense",month=new Date().toISOString().slice(0,7),filter="all",query="";
 const cats={expense:["Makan","Transport","Belanja","Tagihan","Kesehatan","Hiburan","Lainnya"],income:["Gaji","Bonus","Penjualan","Refund","Lainnya"]};
 const icons={Makan:"◉",Transport:"➤",Belanja:"◇",Tagihan:"▤",Kesehatan:"＋",Hiburan:"▶",Gaji:"↓",Bonus:"✦",Penjualan:"↗",Refund:"↙",Lainnya:"•"};
 const money=n=>fmt.format(Number(n)||0),safeRows=()=>rows.filter(x=>x&&x.id&&["expense","income"].includes(x.type));
 function monthRows(){return safeRows().filter(x=>String(x.date||"").slice(0,7)===month)}
 function budgets(){return rg(BUDGET_KEY,{})}
 function setBudget(value){const all=budgets();all[month]=Math.max(0,Number(value)||0);rs(BUDGET_KEY,all)}
 function csvCell(value){let s=String(value??"");if(/^[=+\-@]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
 function exB64(bytes){let out="";const u=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);for(let i=0;i<u.length;i+=32768)out+=String.fromCharCode(...u.subarray(i,i+32768));return btoa(out)}
 function exBytes(value){const raw=atob(value),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out}
 async function exKey(pin,salt){const base=await crypto.subtle.importKey("raw",new TextEncoder().encode(pin),"PBKDF2",false,["deriveKey"]);return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:210000,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["encrypt","decrypt"])}
 function exDownload(name,text){const blob=new Blob([text],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 b.innerHTML=`<div class="expense-shell">
  <section class="expense-hero">
   <div class="expense-hero-top"><div><p class="expense-eyebrow">MONTHLY CONTROL</p><h2>Financial overview</h2></div><label class="expense-month"><span>BULAN</span><input id="exMonth" type="month" value="${month}"></label></div>
   <div class="expense-balance"><span>SALDO BULAN INI</span><strong id="exBalance">Rp0</strong><small id="exBalanceNote">Pemasukan dikurangi pengeluaran</small></div>
   <div class="expense-metrics"><div><span>PEMASUKAN</span><b id="exIncome">Rp0</b></div><div><span>PENGELUARAN</span><b id="exOut">Rp0</b></div><div><span>TRANSAKSI</span><b id="exCount">0</b></div></div>
  </section>
  <section class="tool-card expense-budget-card"><div class="expense-section-title"><div><p class="expense-eyebrow">BUDGET CONTROL</p><b>Anggaran bulanan</b></div><button id="exBudgetEdit" class="ghost tiny">Atur</button></div><div class="expense-budget-values"><strong id="exBudgetUsed">Rp0</strong><span id="exBudgetTotal">dari Rp0</span></div><div class="expense-progress"><i id="exBudgetBar"></i></div><p id="exBudgetHint" class="expense-hint">Belum ada anggaran.</p></section>
  <section class="tool-card expense-entry-card"><div class="expense-section-title"><div><p class="expense-eyebrow">QUICK ENTRY</p><b>Tambah transaksi</b></div><span class="expense-local-pill">LOCAL ONLY</span></div>
   <div class="expense-type-switch"><button data-ex-type="expense" class="active">Pengeluaran</button><button data-ex-type="income">Pemasukan</button></div>
   <div class="expense-entry-grid"><label>NOMINAL<input id="exAmount" type="number" inputmode="numeric" min="1" placeholder="0"></label><label>KATEGORI<select id="exCategory"></select></label><label>CATATAN<input id="exNote" maxlength="80" placeholder="Contoh: Bensin"></label><label>TANGGAL<input id="exDate" type="date" value="${new Date().toISOString().slice(0,10)}"></label></div>
   <button id="exSave" class="primary expense-save">Simpan Transaksi <span>→</span></button><p id="exStatus" class="status"></p>
  </section>
  <section class="tool-card expense-insight-card"><div class="expense-section-title"><div><p class="expense-eyebrow">SPENDING INSIGHT</p><b>Distribusi pengeluaran</b></div><span id="exTopCat">—</span></div><div id="exChart" class="expense-chart"></div></section>
  <section class="expense-ledger"><div class="expense-section-title"><div><p class="expense-eyebrow">LEDGER</p><b>Riwayat transaksi</b></div><div class="expense-ledger-actions"><button id="exBackup" class="ghost tiny">Backup</button><button id="exRestore" class="ghost tiny">Restore</button><button id="exExport" class="ghost tiny">CSV</button><input id="exRestoreFile" type="file" accept=".ricexpense,.json,application/json" hidden></div></div>
   <div class="expense-filters"><label><span>⌕</span><input id="exSearch" type="search" placeholder="Cari catatan atau kategori"></label><select id="exFilter"><option value="all">Semua</option><option value="expense">Pengeluaran</option><option value="income">Pemasukan</option></select></div>
   <div id="exList" class="expense-list"></div>
  </section>
 </div>`;
 function fillCats(){const select=$("#exCategory");select.innerHTML=cats[type].map(x=>'<option>'+esc(x)+'</option>').join("");document.querySelectorAll("[data-ex-type]").forEach(x=>x.classList.toggle("active",x.dataset.exType===type))}
 function render(){
  rows=safeRows();const current=monthRows(),income=current.filter(x=>x.type==="income").reduce((a,x)=>a+Number(x.amount||0),0),out=current.filter(x=>x.type==="expense").reduce((a,x)=>a+Number(x.amount||0),0),balance=income-out,budget=Number(budgets()[month]||0),ratio=budget?Math.min(100,out/budget*100):0;
  $("#exIncome").textContent=money(income);$("#exOut").textContent=money(out);$("#exCount").textContent=current.length;$("#exBalance").textContent=money(balance);$("#exBalance").classList.toggle("negative",balance<0);
  $("#exBudgetUsed").textContent=money(out);$("#exBudgetTotal").textContent="dari "+money(budget);$("#exBudgetBar").style.width=ratio+"%";$("#exBudgetBar").classList.toggle("over",budget>0&&out>budget);
  $("#exBudgetHint").textContent=!budget?"Belum ada anggaran untuk bulan ini.":out>budget?"Melebihi anggaran "+money(out-budget):"Sisa anggaran "+money(budget-out);
  const groups={};current.filter(x=>x.type==="expense").forEach(x=>groups[x.category]=(groups[x.category]||0)+Number(x.amount||0));const ranked=Object.entries(groups).sort((a,z)=>z[1]-a[1]);$("#exTopCat").textContent=ranked[0]?"Terbesar · "+ranked[0][0]:"Belum ada data";
  $("#exChart").innerHTML=ranked.slice(0,5).map(([cat,val])=>'<div class="expense-bar-row"><div><span>'+esc(icons[cat]||"•")+'</span><b>'+esc(cat)+'</b><small>'+money(val)+'</small></div><i><em style="width:'+(out?Math.max(4,val/out*100):0)+'%"></em></i></div>').join("")||'<p class="expense-empty">Tambahkan pengeluaran untuk melihat insight.</p>';
  const q=query.toLowerCase().trim();const shown=current.filter(x=>(filter==="all"||x.type===filter)&&(!q||(x.note+" "+x.category).toLowerCase().includes(q))).sort((a,z)=>String(z.date).localeCompare(String(a.date))||z.createdAt-a.createdAt);
  $("#exList").innerHTML=shown.map(x=>'<article class="expense-row"><div class="expense-row-icon '+x.type+'">'+esc(icons[x.category]||"•")+'</div><div class="expense-row-copy"><b>'+esc(x.note||x.category)+'</b><span>'+esc(x.category)+' · '+new Date(x.date+"T12:00:00").toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"})+'</span></div><strong class="'+x.type+'">'+(x.type==="expense"?"− ":"+ ")+money(x.amount)+'</strong><button data-ex-del="'+esc(x.id)+'" aria-label="Hapus transaksi">×</button></article>').join("")||'<p class="expense-empty">Tidak ada transaksi pada filter ini.</p>';
 }
 fillCats();render();
 document.querySelectorAll("[data-ex-type]").forEach(btn=>btn.onclick=()=>{type=btn.dataset.exType;fillCats()});
 on("#exMonth","change",e=>{month=e.target.value||month;render()});
 on("#exFilter","change",e=>{filter=e.target.value;render()});on("#exSearch","input",e=>{query=e.target.value;render()});
 on("#exSave","click",()=>{const amount=Math.floor(Number($("#exAmount").value)||0),date=$("#exDate").value,note=$("#exNote").value.trim();if(amount<=0||amount>999999999999){$("#exStatus").textContent="Nominal tidak valid.";return}if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){ $("#exStatus").textContent="Tanggal wajib diisi.";return}rows.unshift({id:crypto.randomUUID(),type,amount,category:$("#exCategory").value,note:note.slice(0,80),date,createdAt:Date.now()});rows=rows.slice(0,2000);rs(KEY,rows);$("#exAmount").value="";$("#exNote").value="";month=date.slice(0,7);$("#exMonth").value=month;$("#exStatus").textContent="Transaksi tersimpan lokal.";render()});
 on("#exBudgetEdit","click",()=>{const current=Number(budgets()[month]||0),value=prompt("Anggaran untuk "+month+" (rupiah)",current||"");if(value===null)return;const parsed=Number(String(value).replace(/[^0-9]/g,""));if(!Number.isFinite(parsed)){return}setBudget(parsed);render()});
 $("#exList").onclick=e=>{const del=e.target.closest("[data-ex-del]");if(!del||!confirm("Hapus transaksi ini?"))return;rows=rows.filter(x=>x.id!==del.dataset.exDel);rs(KEY,rows);render()};
 on("#exBackup","click",async()=>{
  const pin=prompt("Buat PIN backup (6–12 angka)");if(pin===null)return;
  if(!/^\d{6,12}$/.test(pin)){ $("#exStatus").textContent="PIN harus 6–12 angka.";return}
  const confirmPin=prompt("Ulangi PIN backup");if(confirmPin!==pin){$("#exStatus").textContent="PIN konfirmasi tidak sama.";return}
  try{
   $("#exStatus").textContent="Mengenkripsi backup…";
   const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),key=await exKey(pin,salt);
   const payload={version:1,exportedAt:new Date().toISOString(),transactions:safeRows(),budgets:budgets()};
   const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(JSON.stringify(payload)));
   exDownload("ric-expense-backup-"+new Date().toISOString().slice(0,10)+".ricexpense",JSON.stringify({format:"RIC_EXPENSE_BACKUP_V1",kdf:"PBKDF2-SHA256",iterations:210000,salt:exB64(salt),iv:exB64(iv),data:exB64(cipher)}));
   $("#exStatus").textContent="Backup terenkripsi berhasil dibuat.";
  }catch(err){$("#exStatus").textContent="Backup gagal: "+err.message}
 });
 on("#exRestore","click",()=>$("#exRestoreFile").click());
 on("#exRestoreFile","change",async e=>{
  const file=e.target.files?.[0];e.target.value="";if(!file)return;
  if(file.size>5*1024*1024){$("#exStatus").textContent="File backup terlalu besar.";return}
  const pin=prompt("Masukkan PIN backup");if(pin===null)return;
  try{
   $("#exStatus").textContent="Membuka backup…";
   const backup=JSON.parse(await file.text());
   if(backup.format!=="RIC_EXPENSE_BACKUP_V1"||!backup.salt||!backup.iv||!backup.data)throw new Error("format");
   const key=await exKey(pin,exBytes(backup.salt));
   const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:exBytes(backup.iv)},key,exBytes(backup.data));
   const payload=JSON.parse(new TextDecoder().decode(plain));
   if(payload.version!==1||!Array.isArray(payload.transactions)||!payload.budgets||typeof payload.budgets!=="object")throw new Error("payload");
   const clean=payload.transactions.slice(0,2000).filter(x=>x&&["expense","income"].includes(x.type)&&Number(x.amount)>0&&/^\d{4}-\d{2}-\d{2}$/.test(String(x.date))).map(x=>({id:String(x.id||crypto.randomUUID()),type:x.type,amount:Math.floor(Number(x.amount)),category:String(x.category||"Lainnya").slice(0,40),note:String(x.note||"").slice(0,80),date:String(x.date),createdAt:Number(x.createdAt)||Date.now()}));
   const cleanBudgets={};Object.entries(payload.budgets).forEach(([k,v])=>{if(/^\d{4}-\d{2}$/.test(k)&&Number.isFinite(Number(v))&&Number(v)>=0)cleanBudgets[k]=Number(v)});
   if(!confirm("Restore "+clean.length+" transaksi? Data Expense Tracker saat ini akan diganti.")){ $("#exStatus").textContent="Restore dibatalkan.";return}
   rows=clean;rs(KEY,rows);rs(BUDGET_KEY,cleanBudgets);month=new Date().toISOString().slice(0,7);$("#exMonth").value=month;render();$("#exStatus").textContent="Backup berhasil dipulihkan.";
  }catch(err){$("#exStatus").textContent="Restore gagal. PIN salah atau file rusak."}
 });
 on("#exExport","click",()=>{const data=monthRows();if(!data.length){$("#exStatus").textContent="Belum ada transaksi untuk diekspor.";return}const csv=["Tanggal,Jenis,Kategori,Catatan,Nominal",...data.map(x=>[x.date,x.type,x.category,x.note,x.amount].map(csvCell).join(","))].join("\n"),blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="ric-expense-"+month+".csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
}

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
 on("#musicModeBtn","click",()=>setMode("music"));on("#videoModeBtn","click",()=>setMode("video"));on("#npStudioBtn","click",()=>{$("#fullPlayer")?.classList.add("hidden");openRicTool("nowplaying")});
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
