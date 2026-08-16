(()=>{
  const moveRideButton=()=>{
    const search=document.querySelector('.ride-map-searchbar');
    const btn=document.querySelector('#rideTrackingBtn');
    if(!search||!btn)return false;
    if(btn.parentElement!==search){
      btn.classList.add('ride-tracking-inline');
      search.appendChild(btn);
    }
    return true;
  };
  const obs=new MutationObserver(()=>moveRideButton());
  obs.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click',()=>setTimeout(moveRideButton,0),true);
  moveRideButton();
})();
