import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
function clean(s:string){return String(s||'').replace(/\s+/g,' ').trim().slice(0,240)}
function isoSeconds(v:string){const m=String(v||'').match(/^P(?:([0-9]+)D)?T?(?:([0-9]+)H)?(?:([0-9]+)M)?(?:([0-9]+)S)?$/);if(!m)return 0;return (+m[1]||0)*86400+(+m[2]||0)*3600+(+m[3]||0)*60+(+m[4]||0)}
function rejectText(s:string){return /(full\s*album|playlist|mix\b|nonstop|compilation|kompilasi|kumpulan|podcast|episode|news|berita|livestream|live\s+stream|kids|nursery|lagu\s+anak|karaoke)/i.test(s)}
async function ytGet(path:string,params:Record<string,string>,key:string){const u=new URL(`https://www.googleapis.com/youtube/v3/${path}`);for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);u.searchParams.set('key',key);const r=await fetch(u,{headers:{accept:'application/json'}});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`YouTube API ${r.status}: ${j?.error?.message||'request failed'}`);return j}

Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 try{
  const body=await req.json().catch(()=>({}));
  const q=clean(body.q); const limit=Math.max(1,Math.min(Number(body.limit||20),25));
  if(!q)return Response.json({ok:true,items:[],source:'none'},{headers:cors});
  const url=Deno.env.get('SUPABASE_URL')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,db=createClient(url,service);
  const safe=q.replace(/[%_]/g,' ').trim();
  const {data:local,error:localErr}=await db.from('vt_catalog').select('youtube_id,title,artist,category,active').eq('active',true).or(`title.ilike.%${safe}%,artist.ilike.%${safe}%`).limit(limit);
  if(localErr)throw localErr;
  const seen=new Set<string>(); const items:any[]=[];
  for(const x of local||[]){if(!x?.youtube_id||seen.has(x.youtube_id))continue;seen.add(x.youtube_id);items.push({youtube_id:x.youtube_id,title:x.title,artist:x.artist,category:x.category,source:'catalog'});}
  if(items.length>=Math.min(8,limit))return Response.json({ok:true,items:items.slice(0,limit),source:'catalog',youtubeFallback:false},{headers:{...cors,'Cache-Control':'no-store'}});
  const key=Deno.env.get('YOUTUBE_API_KEY');
  if(!key)return Response.json({ok:true,items:items.slice(0,limit),source:'catalog',youtubeFallback:false,warning:'YouTube API key unavailable'},{headers:{...cors,'Cache-Control':'no-store'}});
  try{
   const s=await ytGet('search',{part:'snippet',type:'video',videoEmbeddable:'true',maxResults:String(Math.min(25,limit+10)),q,order:'relevance'},key);
   const raw=new Map<string,any>();
   for(const it of s.items||[]){const id=String(it?.id?.videoId||'');const title=clean(it?.snippet?.title),artist=clean(it?.snippet?.channelTitle);if(!id||seen.has(id)||rejectText(`${title} ${artist}`))continue;raw.set(id,{title,artist});}
   const ids=[...raw.keys()];
   if(ids.length){const v=await ytGet('videos',{part:'snippet,contentDetails,status',id:ids.join(',')},key);for(const it of v.items||[]){const id=String(it?.id||'');const meta=raw.get(id);if(!meta||seen.has(id))continue;const sec=isoSeconds(it?.contentDetails?.duration);if(!it?.status?.embeddable||it?.status?.privacyStatus!=='public'||sec<60||sec>900)continue;const title=clean(it?.snippet?.title||meta.title),artist=clean(it?.snippet?.channelTitle||meta.artist);if(rejectText(`${title} ${artist}`))continue;seen.add(id);items.push({youtube_id:id,title,artist,category:'search',source:'youtube-search'});if(items.length>=limit)break;}}
   return Response.json({ok:true,items:items.slice(0,limit),source:items.some(x=>x.source==='youtube-search')?'hybrid':'catalog',youtubeFallback:true},{headers:{...cors,'Cache-Control':'no-store'}});
  }catch(e){return Response.json({ok:true,items:items.slice(0,limit),source:'catalog',youtubeFallback:false,warning:String(e)},{headers:{...cors,'Cache-Control':'no-store'}})}
 }catch(e){return Response.json({ok:false,error:String(e)},{status:500,headers:{...cors,'Cache-Control':'no-store'}})}
});