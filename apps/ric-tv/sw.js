const CACHE="ric-tv-shell-v8";
const ASSETS=["./","./index.html","./manifest.webmanifest","./icon.svg"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("ric-tv-shell-")&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
async function update(request){const response=await fetch(request,{cache:"no-cache"});if(response.ok){const cache=await caches.open(CACHE);cache.put(request,response.clone()).catch(()=>{})}return response}
async function rewriteNavigation(request){
  const response=await fetch(request,{cache:"no-cache"});
  if(!response.ok)return response;
  const type=response.headers.get("content-type")||"";
  if(!type.includes("text/html"))return response;
  let html=await response.text();
  const replacements=[
    ['fetch(url,{cache:"no-store",mode:"cors"})','fetch("/api/playlist?url="+encodeURIComponent(url),{cache:"no-store"})'],
    ['String(text).slice(0,5*1024*1024)','String(text).slice(0,20*1024*1024)'],
    ['if(out.length>=600)break',''],
    ['custom=[...rows.filter(x=>!existing.has(x.url)),...custom].slice(0,600)','custom=[...rows.filter(x=>!existing.has(x.url)),...custom]']
  ];
  for(const [from,to] of replacements)if(html.includes(from))html=html.replace(from,to);
  const headers=new Headers(response.headers);headers.set("Cache-Control","no-store");
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}
self.addEventListener("fetch",event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=="GET"||url.origin!==location.origin)return;
  if(request.mode==="navigate"){event.respondWith(rewriteNavigation(request).catch(()=>caches.match(request).then(hit=>hit||caches.match("./index.html"))));return}
  event.respondWith(caches.match(request).then(hit=>{const fresh=update(request).catch(()=>null);if(hit){event.waitUntil(fresh);return hit}return fresh.then(response=>response||Response.error())}));
});
