(()=>{
  let patched=false, leanPatched=false, statusTimer=null;

  function patchLean(){
    if(leanPatched || typeof onOrientation!=="function") return;
    leanPatched=true;
    const old=onOrientation;
    try{window.removeEventListener("deviceorientationabsolute",old,true)}catch(e){}
    try{window.removeEventListener("deviceorientation",old,true)}catch(e){}

    onOrientation=function(e){
      let raw=normalizedRoll(e);
      if(!Number.isFinite(raw)) return;
      if(raw>179)raw-=360;
      if(raw<-179)raw+=360;
      // Reject phone-orientation flips / impossible motorcycle lean instead of clamping and getting stuck.
      if(Math.abs(raw)>72) return;
      if(Number.isFinite(lastLean) && Math.abs(raw-lastLean)>38) return;

      leanFiltered=leanFiltered*0.72+raw*0.28;
      const v=leanFiltered;
      lastLean=v;

      // Max lean is a ride statistic: only capture plausible samples while a ride is recording.
      if(rideActive){
        if(v<0)maxL=Math.min(maxL,v);
        if(v>0)maxR=Math.max(maxR,v);
      }

      const now=document.querySelector("#leanNow"),left=document.querySelector("#leanLeft"),right=document.querySelector("#leanRight"),bike=document.querySelector("#leanBike");
      if(now)now.textContent=Math.round(Math.abs(v))+"°";
      if(left)left.textContent=Math.round(Math.abs(maxL))+"°";
      if(right)right.textContent=Math.round(Math.abs(maxR))+"°";
      if(bike)bike.style.transform=`rotate(${Math.max(-65,Math.min(65,v))}deg)`;
    };

    if(typeof sensorActive!=="undefined" && sensorActive){
      window.addEventListener("deviceorientationabsolute",onOrientation,true);
      window.addEventListener("deviceorientation",onOrientation,true);
    }
  }

  function patchDashboard(){
    const dash=document.querySelector("#rideDashboard");
    const controls=document.querySelector(".ride-controls");
    const rideBtn=document.querySelector("#rideTrackingBtn");
    const fsBtn=document.querySelector("#dashFullscreen");
    const compass=document.querySelector("#compassBtn");
    const voice=document.querySelector("#voiceBtn");
    const menu=document.querySelector("#dashMenuBtn");
    if(!dash||!controls||!rideBtn||!fsBtn||!compass||!voice||!menu) return;
    if(patched && controls.contains(rideBtn) && controls.contains(fsBtn)) return;
    patched=true;

    controls.classList.add("ride-controls-v76");

    compass.classList.add("recenter-control");
    compass.title="Ikuti posisi GPS";
    const ci=compass.querySelector("i");
    if(ci){ci.textContent="◎";ci.setAttribute("aria-hidden","true")}

    voice.classList.add("voice-control");
    rideBtn.classList.add("ride-round-btn","ride-track-control");
    rideBtn.title="Mulai / Stop Ride Tracking";
    fsBtn.classList.add("ride-round-btn","fullscreen-control");
    fsBtn.title="Fullscreen";
    menu.classList.add("menu-control");

    // Rebuild the right-side control order. Moving nodes preserves their existing click listeners.
    controls.append(compass,voice,rideBtn,fsBtn,menu);

    let badge=document.querySelector("#rideTrackingStatus");
    if(!badge){
      badge=document.createElement("div");
      badge.id="rideTrackingStatus";
      badge.className="ride-tracking-status hidden";
      dash.querySelector(".ride-right")?.appendChild(badge);
    }

    if(statusTimer)clearInterval(statusTimer);
    statusTimer=setInterval(()=>{
      const recording=rideBtn.classList.contains("recording");
      badge.classList.toggle("hidden",!recording);
      if(recording){
        const t=(rideBtn.textContent||"").replace(/^Stop Ride\s*·?\s*/i,"");
        badge.textContent=`● REC${t?" · "+t:""}`;
      }
    },350);

    patchLean();
  }

  const mo=new MutationObserver(patchDashboard);
  mo.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener("DOMContentLoaded",patchDashboard);
  patchDashboard();
})();
