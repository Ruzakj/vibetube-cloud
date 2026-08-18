(()=>{
  // Compatibility shim for the Ride History renderer.
  // Older history code updates #rdCount, while the current modal no longer renders it.
  // Keep the legacy target available without changing the visible UI.
  function ensureRideHistoryCompat(){
    const modal=document.querySelector('#rideHistoryModal');
    if(!modal||document.querySelector('#rdCount'))return;
    const el=document.createElement('span');
    el.id='rdCount';
    el.hidden=true;
    el.setAttribute('aria-hidden','true');
    modal.appendChild(el);
  }
  ensureRideHistoryCompat();
  document.addEventListener('click',e=>{
    if(e.target.closest('#rideHistoryBtn'))setTimeout(ensureRideHistoryCompat,0);
  },true);
  const observer=new MutationObserver(ensureRideHistoryCompat);
  observer.observe(document.body,{childList:true,subtree:true});
  setTimeout(()=>observer.disconnect(),10000);
})();
