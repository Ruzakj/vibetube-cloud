// VibeTube Cloud configuration
// Supabase project: ejgmyxzmjkmqofacrusv
// Publishable key is safe for browser use; database permissions/RLS remain the security boundary.
window.VIBETUBE_CLOUD_URL = "https://ejgmyxzmjkmqofacrusv.supabase.co";
window.VIBETUBE_CLOUD_KEY = "sb_publishable_a8b-ZpStv-Oyo-FDVMbstA_WAgRcUbn";

// Companion voice/call runtime. Loaded only on the Angel companion page.
if (location.pathname.endsWith('/ric-companion.html') || location.pathname.endsWith('/ric-companion')) {
  const script = document.createElement('script');
  script.src = './ric-companion-android-voice.js?v=1.0.0';
  script.async = false;
  document.head.appendChild(script);
}

// Speedometer native fullscreen bridge. The bridge is a no-op on PWA/browser.
// In the Android shell it lets the fullscreen control request true landscape
// orientation + immersive system UI instead of relying on WebView orientation lock.
{
  const script = document.createElement('script');
  script.src = './speedmap-native-fullscreen.js?v=1.0.0';
  script.async = false;
  document.head.appendChild(script);
}
