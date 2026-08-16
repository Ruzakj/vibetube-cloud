// VibeTube Cloud configuration
// Supabase project: ejgmyxzmjkmqofacrusv
// Publishable key is safe for browser use; database permissions/RLS remain the security boundary.
window.VIBETUBE_CLOUD_URL = "https://ejgmyxzmjkmqofacrusv.supabase.co";
window.VIBETUBE_CLOUD_KEY = "sb_publishable_a8b-ZpStv-Oyo-FDVMbstA_WAgRcUbn";

// v7.6 Ride dashboard control patch loader.
(()=>{
  const css=document.createElement('link');
  css.rel='stylesheet';
  css.href='./ride-ui-v76.css?v=7.6';
  document.head.appendChild(css);

  window.addEventListener('DOMContentLoaded',()=>{
    const js=document.createElement('script');
    js.src='./ride-ui-v76.js?v=7.6';
    js.defer=true;
    document.body.appendChild(js);
  },{once:true});
})();
