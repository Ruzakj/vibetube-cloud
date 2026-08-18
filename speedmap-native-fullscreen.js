(()=>{
  const isAndroidApp=()=>!!(window.RicAndroid&&typeof window.RicAndroid.setSpeedometerLandscape==='function');
  let nativeLandscape=false;
  function enterNativeLandscape(){
    try{window.RicAndroid.setSpeedometerLandscape(true);nativeLandscape=true;}catch(e){console.warn('Native landscape unavailable',e)}
  }
  function exitNativeLandscape(){
    try{window.RicAndroid.setSpeedometerLandscape(false);nativeLandscape=false;}catch(e){console.warn('Native portrait restore unavailable',e)}
  }
  function bind(){
    const btn=document.querySelector('.ric-pc-full');
    if(!btn||btn.dataset.nativeFsBound==='1')return;
    btn.dataset.nativeFsBound='1';
    btn.addEventListener('click',()=>{
      if(isAndroidApp()){
        if(nativeLandscape) exitNativeLandscape();
        else enterNativeLandscape();
      }
    },true);
  }
  document.addEventListener('click',e=>{if(e.target.closest('[data-tool="speedmap"]'))setTimeout(bind,120)},true);
  window.addEventListener('resize',bind,{passive:true});
  window.addEventListener('orientationchange',bind,{passive:true});
  document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&nativeLandscape)exitNativeLandscape();});
  [0,80,180,400,900].forEach(ms=>setTimeout(bind,ms));
})();
