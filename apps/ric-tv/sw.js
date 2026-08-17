const CACHE="ric-tv-shell-v6";
const ASSETS=["./","./index.html","./manifest.webmanifest","./icon.svg"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("ric-tv-shell-")&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
async function update(request){const response=await fetch(request,{cache:"no-cache"});if(response.ok){const cache=await caches.open(CACHE);cache.put(request,response.clone()).catch(()=>{})}return response}
self.addEventListener("fetch",event=>{const request=event.request,url=new URL(request.url);if(request.method!=="GET"||url.origin!==location.origin)return;if(request.mode==="navigate"){event.respondWith(update(request).catch(()=>caches.match(request).then(hit=>hit||caches.match("./index.html"))));return}event.respondWith(caches.match(request).then(hit=>{const fresh=update(request).catch(()=>null);if(hit){event.waitUntil(fresh);return hit}return fresh.then(response=>response||Response.error())}))});
