const CACHE="vibetube-shell-v9.1";
const ASSETS=["./","./index.html","./style.css","./script.js","./cloud-config.js","./ride-ui-patch.css","./ride-ui-patch.js","./portrait-speedmap-fix.js","./ride-autosave.js","./manifest.webmanifest","./icon.svg"];

self.addEventListener("install",e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(
    keys.filter(k=>k.startsWith("vibetube-shell-")&&k!==CACHE).map(k=>caches.delete(k))
  )).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(u.origin!==location.origin)return;
  if(e.request.method==="GET"){
    e.respondWith(
      fetch(e.request,{cache:"no-store"}).then(r=>{
        const copy=r.clone();
        caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});
        return r;
      }).catch(()=>caches.match(e.request))
    );
  }
});