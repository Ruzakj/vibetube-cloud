import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};

const TARGET_DEFAULT = 750;
const TARGET_MAX = 1000;
const MAX_PAGES_PER_QUERY = 10;
const MIN_DURATION = 45;
const MAX_DURATION = 12 * 60;
const CLIENT_VERSION = "2.20260813.01.00";

function text(v:any): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (v.simpleText) return v.simpleText;
  if (Array.isArray(v.runs)) return v.runs.map((x:any)=>x.text||"").join("");
  return "";
}
function walk(node:any, out:any[]=[]): any[] {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) { for (const x of node) walk(x,out); return out; }
  for (const [k,v] of Object.entries(node)) {
    if (k === "videoRenderer" || k === "playlistVideoRenderer") out.push(v);
    else if (k !== "continuationCommand") walk(v,out);
  }
  return out;
}
function continuations(node:any, out:string[]=[]): string[] {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) { for (const x of node) continuations(x,out); return out; }
  if (node.continuationCommand?.token) out.push(node.continuationCommand.token);
  for (const [k,v] of Object.entries(node)) if (k !== "videoRenderer" && k !== "playlistVideoRenderer") continuations(v,out);
  return out;
}
function durationSeconds(s:string): number {
  const p = s.split(":").map(Number);
  if (!p.length || p.some(Number.isNaN)) return 0;
  if (p.length===2) return p[0]*60+p[1];
  if (p.length===3) return p[0]*3600+p[1]*60+p[2];
  return 0;
}
function looksLikeLongForm(title:string): boolean {
  return /full\s*album|full album|album full|meg[a]?mix|\bmix\b|compilation|playlist|podcast|episode|ep\.|radio|live stream|livestream|1 hour|2 hours|3 hours|4 hours|8 hours|10 hours|relaxing music|study music|sleep music|lofi mix/i.test(title);
}
function looksLikeShort(title:string): boolean {
  return /#shorts\b|\bshorts\b|tiktok compilation|reels compilation/i.test(title);
}
function normalizeTitle(title:string): string {
  return title.replace(/\s+/g," ").trim().slice(0,240);
}
function categoryQueries(category:string): string[] {
  const q:Record<string,string[]> = {
    jawa:["lagu jawa terbaru 2026","lagu jawa terbaru 2025","jawa pop terbaru","campursari terbaru"],
    barat:["western pop hits 2026","english pop songs 2025","international pop hits","pop songs official audio"],
    indo:["lagu indonesia terbaru 2026","pop indonesia terbaru 2025","indonesian hits 2026","lagu indonesia populer"],
    galau:["lagu galau indonesia 2026","lagu sedih indonesia 2025","indonesian sad songs","lagu patah hati indonesia"],
    "morning-vibes":["morning chill pop","acoustic morning songs","coffee shop chill songs","morning vibes music"],
    "pop-punk":["pop punk cover lagu indonesia","pop punk indonesia 2026","cover lagu indonesia pop punk","poppunk cover indonesia"],
    nightcore:["nightcore 2026","nightcore songs","nightcore playlist songs","nightcore music"],
    "japanese-nightcore":["japanese nightcore","nightcore japanese songs","anime nightcore","japan nightcore songs"]
  };
  return q[category] || q.indo;
}

async function ytRequest(endpoint:string, body:any): Promise<any> {
  const r = await fetch(`https://www.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false`, {
    method:"POST",
    headers:{"content-type":"application/json","origin":"https://www.youtube.com","user-agent":"Mozilla/5.0"},
    body:JSON.stringify({context:{client:{clientName:"WEB",clientVersion:CLIENT_VERSION,hl:"id",gl:"ID"}},...body})
  });
  if (!r.ok) throw new Error(`YouTube metadata HTTP ${r.status}`);
  return await r.json();
}

async function collectSearch(query:string, needed:number, existing:Set<string>) {
  const items:any[]=[];
  let data = await ytRequest("search", {query});
  for (let page=0; page<MAX_PAGES_PER_QUERY && items.length<needed; page++) {
    const renderers=walk(data).filter(x=>x.videoId);
    for (const x of renderers) {
      const id=String(x.videoId||"");
      const title=normalizeTitle(text(x.title));
      const artist=normalizeTitle(text(x.ownerText)||text(x.shortBylineText)||"YouTube");
      const length=text(x.lengthText);
      const dur=durationSeconds(length);
      if (!id || !title || existing.has(id) || items.some(v=>v.youtube_id===id)) continue;
      if (looksLikeShort(title) || looksLikeLongForm(title)) continue;
      if (dur && (dur<MIN_DURATION || dur>MAX_DURATION)) continue;
      items.push({youtube_id:id,title,artist});
      if (items.length>=needed) break;
    }
    if (items.length>=needed) break;
    const token=continuations(data)[0];
    if (!token) break;
    data=await ytRequest("search", {continuation:token});
  }
  return items;
}

async function collectPlaylist(playlistId:string, needed:number, existing:Set<string>) {
  const items:any[]=[];
  let data=await ytRequest("browse", {browseId:`VL${playlistId}`});
  for (let page=0; page<MAX_PAGES_PER_QUERY && items.length<needed; page++) {
    for (const x of walk(data)) {
      const id=String(x.videoId||"");
      const title=normalizeTitle(text(x.title));
      const artist=normalizeTitle(text(x.shortBylineText)||text(x.longBylineText)||"YouTube");
      const length=text(x.lengthText);
      const dur=durationSeconds(length);
      if (!id || !title || existing.has(id) || items.some(v=>v.youtube_id===id)) continue;
      if (looksLikeShort(title) || looksLikeLongForm(title)) continue;
      if (dur && (dur<MIN_DURATION || dur>MAX_DURATION)) continue;
      items.push({youtube_id:id,title,artist});
      if (items.length>=needed) break;
    }
    if (items.length>=needed) break;
    const token=continuations(data)[0];
    if (!token) break;
    data=await ytRequest("browse", {continuation:token});
  }
  return items;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok",{headers:cors});
  try {
    const body=await req.json().catch(()=>({}));
    const category=String(body.category||"indo").toLowerCase().trim();
    const target=Math.max(100,Math.min(Number(body.target||TARGET_DEFAULT),TARGET_MAX));
    const playlistId=String(body.playlistId||"").trim();
    const url=Deno.env.get("SUPABASE_URL")!;
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db=createClient(url,service);

    const {count,error:countError}=await db.from("vt_catalog").select("youtube_id",{count:"exact",head:true}).eq("active",true).ilike("category",category);
    if (countError) throw countError;
    const before=count||0;
    if (before>=target) return new Response(JSON.stringify({ok:true,category,before,added:0,after:before,target,skipped:"target_reached"}),{headers:{...cors,"Content-Type":"application/json"}});

    const {data:existingRows,error:existingError}=await db.from("vt_catalog").select("youtube_id").eq("active",true).ilike("category",category);
    if (existingError) throw existingError;
    const existing=new Set((existingRows||[]).map((x:any)=>x.youtube_id));
    let candidates:any[]=[];
    const need=target-before;
    if (playlistId) candidates=await collectPlaylist(playlistId,need,existing);
    if (candidates.length<need) {
      for (const query of categoryQueries(category)) {
        if (candidates.length>=need) break;
        const got=await collectSearch(query,Math.min(need-candidates.length,300),new Set([...existing,...candidates.map(x=>x.youtube_id)]));
        candidates.push(...got);
      }
    }

    if (candidates.length) {
      const rows=candidates.map(x=>({youtube_id:x.youtube_id,title:x.title,artist:x.artist,category,source:playlistId?`youtube_playlist:${playlistId}`:`youtube_search:${category}`,active:true}));
      const {error}=await db.from("vt_catalog").upsert(rows,{onConflict:"youtube_id,category",ignoreDuplicates:true});
      if (error) throw error;
    }
    const {count:after}=await db.from("vt_catalog").select("youtube_id",{count:"exact",head:true}).eq("active",true).ilike("category",category);
    return new Response(JSON.stringify({ok:true,category,before,added:candidates.length,after:after||0,target,queries:playlistId?0:categoryQueries(category).length}),{headers:{...cors,"Content-Type":"application/json"}});
  } catch (e) {
    return new Response(JSON.stringify({ok:false,error:String(e)}),{status:500,headers:{...cors,"Content-Type":"application/json"}});
  }
});
