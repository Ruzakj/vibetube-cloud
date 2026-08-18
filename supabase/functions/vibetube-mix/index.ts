import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 try{
  const body=await req.json();
  const category=String(body.category||"indo");
  const size=Math.max(1,Math.min(Number(body.size||20),100));
  const anonymousKey=String(body.userId||"anonymous").slice(0,100);
  const smart=body.smartMix!==false;
  if(category==="japanese-nightcore")return new Response(JSON.stringify({special:true,playlistId:"PLsWiDGlW9Vst4Vrc0IhVIdRYeurX7rV8z"}),{headers:{...cors,"Content-Type":"application/json"}});
  const url=Deno.env.get("SUPABASE_URL")!;
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db=createClient(url,service);
  const fn=smart?"generate_vt_smart_mix":"generate_vt_mix";
  const {data,error}=await db.rpc(fn,{p_anonymous_key:anonymousKey,p_category:category,p_size:size});
  if(error)throw error;
  return new Response(JSON.stringify({items:data||[],category,size,smart}),{headers:{...cors,"Content-Type":"application/json"}});
 }catch(e){return new Response(JSON.stringify({error:String(e)}),{status:500,headers:{...cors,"Content-Type":"application/json"}})}
});