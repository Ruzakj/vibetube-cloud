import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS"};
const n=(s:string)=>(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const tok=(s:string)=>new Set(n(s).split(/\s+/).filter(Boolean));
function sim(a:string,b:string){const A=tok(a),B=tok(b),i=[...A].filter(x=>B.has(x)).length,u=new Set([...A,...B]).size;return u?i/u:0}
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 try{
  const urlObj=new URL(req.url); const body=req.method==='POST'?await req.json().catch(()=>({})):{};
  const category=String(body.category||urlObj.searchParams.get('category')||'').trim();
  const limit=Math.max(1,Math.min(Number(body.limit||urlObj.searchParams.get('limit')||10),25));
  const url=Deno.env.get('SUPABASE_URL')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db=createClient(url,service);
  const {data:bearer,error:se}=await db.rpc('get_vt_provider_secret',{p_name:'AUDIUS_BEARER_TOKEN'}); if(se||!bearer) throw new Error('Audius bearer secret unavailable');
  let q=db.from('vt_catalog').select('id,title,artist,category').eq('active',true).neq('category','japanese-nightcore').order('id',{ascending:true}).limit(limit);
  if(category)q=q.eq('category',category);
  const {data,error}=await q;if(error)throw error;
  const results=[];
  for(const s of data||[]){
   const u=new URL('https://api.audius.co/v1/tracks/search');u.searchParams.set('query',`${s.artist||''} ${s.title}`.trim());u.searchParams.set('limit','5');
   const r=await fetch(u,{headers:{Authorization:`Bearer ${bearer}`}});
   if(!r.ok){results.push({id:s.id,category:s.category,title:s.title,error:`Audius ${r.status}`});continue}
   const j=await r.json();const arr=Array.isArray(j?.data)?j.data:[];let best=null,bestScore=0;
   for(const t of arr){const artist=t?.user?.name||t?.user?.handle||'';const score=.65*sim(s.title||'',t?.title||'')+.35*sim(s.artist||'',artist);if(score>bestScore){bestScore=score;best=t}}
   const gated=!!best?.is_stream_gated;const accepted=!!best&&!gated&&bestScore>=.72;
   await db.from('vt_provider_matches').upsert({catalog_id:s.id,provider:'audius',provider_track_id:best?.id?String(best.id):null,provider_url:best?.permalink?`https://audius.co${best.permalink}`:null,provider_title:best?.title||null,provider_artist:best?.user?.name||best?.user?.handle||null,artwork_url:best?.artwork?.['480x480']||best?.artwork?.['150x150']||null,duration_ms:best?.duration?Number(best.duration)*1000:null,access_status:gated?'gated':'playable',match_score:Number(bestScore.toFixed(4)),match_status:accepted?'accepted':'rejected',checked_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:'catalog_id,provider'});
   results.push({category:s.category,title:s.title,artist:s.artist,accepted,score:Number(bestScore.toFixed(3)),audius_title:best?.title||null,audius_artist:best?.user?.name||best?.user?.handle||null,audius_id:best?.id||null,gated});
  }
  return Response.json({ok:true,category:category||'all',tested:results.length,accepted:results.filter((x:any)=>x.accepted).length,results},{headers:cors});
 }catch(e){return Response.json({ok:false,error:String(e)},{status:500,headers:cors})}
});