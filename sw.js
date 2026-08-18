const CACHE_PREFIX="ric-space-live-cache-";
const CACHE_NAME=`${CACHE_PREFIX}network-first`;

self.addEventListener("install",event=>event.waitUntil(self.skipWaiting()));

self.addEventListener("activate",event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(
    keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME).map(key=>caches.delete(key))
  )).then(()=>self.clients.claim())
));

async function latestOrCache(request){
  try{
    // Vercel revisions must be visible immediately. Bypass the browser HTTP
    // cache; Cache API is used only as an offline fallback.
    const freshRequest=new Request(request,{cache:"no-store"});
    const response=await fetch(freshRequest);
    if(response.ok){
      const cache=await caches.open(CACHE_NAME);
      await cache.put(request,response.clone());
    }
    return response;
  }catch(error){
    const cached=await caches.match(request);
    if(cached)return cached;
    throw error;
  }
}

self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  event.respondWith(latestOrCache(event.request));
});
