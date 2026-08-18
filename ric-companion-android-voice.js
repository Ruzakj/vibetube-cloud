(()=>{
  'use strict';
  const KEY='ric-companion-v1';
  const $=s=>document.querySelector(s);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  let callActive=false,callStartedAt=0,recognition=null,listening=false,speaking=false,muted=false,busy=false;

  /* Force Angel voice notes to use the device/Android speech engine instead of ElevenLabs. */
  const originalFetch=window.fetch.bind(window);
  window.fetch=async (input,init)=>{
    const url=typeof input==='string'?input:input?.url||'';
    if(url==='/api/voice'||url.endsWith('/api/voice')){
      return new Response(JSON.stringify({error:'device_tts'}),{status:503,headers:{'Content-Type':'application/json'}});
    }
    return originalFetch(input,init);
  };

  function state(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return {}}}
  function chooseVoice(){
    if(!('speechSynthesis' in window))return null;
    const voices=speechSynthesis.getVoices();
    return voices.find(v=>/^id(-|_)/i.test(v.lang)&&/female|wanita|google|indonesia/i.test(v.name))
      ||voices.find(v=>/^id(-|_)/i.test(v.lang))
      ||voices.find(v=>/indonesia/i.test(v.name))
      ||null;
  }
  function speak(text){
    return new Promise(resolve=>{
      if(!('speechSynthesis' in window)||!text){resolve();return}
      speaking=true; listening=false; try{recognition?.stop()}catch{}
      speechSynthesis.cancel();
      const u=new SpeechSynthesisUtterance(String(text));
      u.lang='id-ID';u.rate=1.02;u.pitch=1.08;u.volume=1;
      const v=chooseVoice();if(v)u.voice=v;
      const done=()=>{speaking=false;resolve();if(callActive&&!muted)setTimeout(startListening,260)};
      u.onend=done;u.onerror=done;speechSynthesis.speak(u);
    });
  }
  speechSynthesis?.addEventListener?.('voiceschanged',()=>chooseVoice());

  function injectUi(){
    if($('#angelCallOverlay'))return;
    const style=document.createElement('style');style.id='angel-call-style';style.textContent=`
      .angel-call-overlay{position:fixed;inset:0;z-index:2147483600;background:radial-gradient(circle at 50% 24%,#242424 0,#101010 34%,#000 72%);display:none;color:#fff;font-family:Inter,system-ui,sans-serif}
      .angel-call-overlay.open{display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:calc(52px + env(safe-area-inset-top)) 24px calc(34px + env(safe-area-inset-bottom))}
      .angel-call-top{text-align:center}.angel-call-avatar{width:116px;height:116px;border-radius:50%;margin:0 auto 18px;background-image:var(--aira-avatar),linear-gradient(135deg,#f9ce34,#ee2a7b 55%,#6228d7);background-size:cover,auto;background-position:center;border:1px solid #333;box-shadow:0 16px 50px #0008}.angel-call-name{font-size:27px;font-weight:650}.angel-call-state{margin-top:8px;color:#b9b9b9;font-size:14px}.angel-call-caption{margin-top:18px;max-width:300px;min-height:42px;color:#ddd;font-size:13px;line-height:1.45}
      .angel-call-actions{display:flex;align-items:center;justify-content:center;gap:28px;width:100%}.angel-call-btn{width:66px;height:66px;border:0;border-radius:50%;display:grid;place-items:center;background:#2b2b2b;color:#fff}.angel-call-btn svg{width:28px;height:28px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.angel-call-btn.muted{background:#fff;color:#111}.angel-call-btn.hang{background:#ff3b30}.angel-call-btn:active{transform:scale(.95)}
      .angel-call-hint{position:absolute;bottom:calc(116px + env(safe-area-inset-bottom));font-size:11px;color:#777;text-align:center;width:100%;left:0;padding:0 24px}
    `;document.head.appendChild(style);
    const el=document.createElement('div');el.id='angelCallOverlay';el.className='angel-call-overlay';el.innerHTML=`
      <div class="angel-call-top"><div class="angel-call-avatar"></div><div class="angel-call-name" id="angelCallName">Angel</div><div class="angel-call-state" id="angelCallState">Memanggil…</div><div class="angel-call-caption" id="angelCallCaption"></div></div>
      <div class="angel-call-hint" id="angelCallHint"></div>
      <div class="angel-call-actions">
        <button class="angel-call-btn" id="angelCallMute" aria-label="Mute"><svg viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M9 22h6"/></svg></button>
        <button class="angel-call-btn hang" id="angelCallHang" aria-label="Tutup panggilan"><svg viewBox="0 0 24 24"><path d="M4 15c4-4 12-4 16 0"/><path d="M7 12 4 15l2 3M17 12l3 3-2 3"/></svg></button>
      </div>`;document.body.appendChild(el);
    $('#angelCallMute').onclick=()=>{muted=!muted;$('#angelCallMute').classList.toggle('muted',muted);$('#angelCallHint').textContent=muted?'Mikrofon dimatikan':'';if(muted){try{recognition?.stop()}catch{}}else if(callActive&&!speaking)startListening()};
    $('#angelCallHang').onclick=endCall;
  }

  function recognitionCtor(){return window.SpeechRecognition||window.webkitSpeechRecognition||null}
  function setupRecognition(){
    const C=recognitionCtor();if(!C)return null;
    const r=new C();r.lang='id-ID';r.interimResults=false;r.continuous=false;r.maxAlternatives=1;
    r.onstart=()=>{listening=true;if(callActive&&!speaking&&!muted){$('#angelCallState').textContent='Mendengarkan…';$('#angelCallHint').textContent='Ngomong aja, Angel bakal jawab'}};
    r.onresult=e=>{listening=false;const text=Array.from(e.results).map(x=>x[0]?.transcript||'').join(' ').trim();if(text)handleUserSpeech(text)};
    r.onerror=e=>{listening=false;if(!callActive)return;if(['not-allowed','service-not-allowed'].includes(e.error)){const h=$('#angelCallHint');if(h)h.textContent='Izin mikrofon ditolak. Izinkan mikrofon untuk ngobrol lewat telepon.';return}if(!speaking&&!muted)setTimeout(startListening,700)};
    r.onend=()=>{listening=false;if(callActive&&!speaking&&!muted&&!busy)setTimeout(startListening,380)};
    return r;
  }
  function startListening(){if(!callActive||muted||speaking||busy||listening)return;if(!recognition)recognition=setupRecognition();if(!recognition){$('#angelCallHint').textContent='Speech recognition tidak tersedia di browser ini.';return}try{recognition.start()}catch{}}

  function callSystemPrompt(){
    const s=state(),bot=s.botName||'Angel',user='Ric';
    return `Kamu adalah ${bot}, perempuan 22 tahun dan pacar ${user}. Ini percakapan TELEPON suara real-time. Balas natural seperti sedang menelepon, bahasa Indonesia chat sehari-hari, hangat dan spontan. Jawaban biasanya 1-3 kalimat pendek agar nyaman didengar. Jangan pakai markdown, bullet, emoji, atau menjelaskan bahwa kamu AI. Jangan selalu bertanya. Ingatan hubungan yang tersedia:\n${String(s.memory||'').slice(0,1400)}`;
  }
  function recentContext(userText){
    const s=state();const list=Array.isArray(s?.chats?.partner)?s.chats.partner:[];
    const recent=list.filter(m=>['user','assistant'].includes(m.role)&&m.content).slice(-8).map(m=>({role:m.role,content:String(m.content).slice(0,700)}));
    recent.push({role:'user',content:userText});return recent;
  }
  async function handleUserSpeech(text){
    if(!callActive||busy)return;busy=true;$('#angelCallCaption').textContent=`Ric: ${text}`;$('#angelCallState').textContent='Angel mikir…';
    try{
      const response=await originalFetch('/api/companion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({system:callSystemPrompt(),messages:recentContext(text)})});
      const data=await response.json().catch(()=>({}));if(!response.ok||!data.reply)throw new Error(data.error||'AI gagal');
      $('#angelCallCaption').textContent=`Angel: ${data.reply}`;$('#angelCallState').textContent='Angel ngomong…';await speak(data.reply);
    }catch(e){$('#angelCallCaption').textContent='Koneksi Angel lagi bermasalah.';await speak('Bentar ya sayang, koneksiku lagi gangguan. Coba ngomong lagi.');}
    finally{busy=false;if(callActive&&!muted&&!speaking)setTimeout(startListening,300)}
  }

  async function startCall(){
    if(callActive)return;injectUi();callActive=true;callStartedAt=Date.now();muted=false;busy=false;$('#angelCallOverlay').classList.add('open');const s=state();$('#angelCallName').textContent=s.botName||'Angel';$('#angelCallState').textContent='Memanggil…';$('#angelCallCaption').textContent='';$('#angelCallHint').textContent='';$('#angelCallMute').classList.remove('muted');
    try{await navigator.mediaDevices?.getUserMedia?.({audio:true})}catch{}
    await sleep(900);if(!callActive)return;$('#angelCallState').textContent='Terhubung';
    const greetings=['Halo sayang, aku denger kok.','Hai Ric, iya aku di sini.','Halo, Angel angkat nih.'];await speak(greetings[Math.floor(Math.random()*greetings.length)]);
  }
  function endCall(){
    if(!callActive)return;const duration=Math.max(1,Math.round((Date.now()-callStartedAt)/1000));callActive=false;busy=false;listening=false;speaking=false;try{recognition?.abort()}catch{};speechSynthesis?.cancel();$('#angelCallOverlay')?.classList.remove('open');
    try{window.RicAiraChat?.recordCall?.({outcome:'answered',duration,detail:'Panggilan keluar'})}catch{}
  }

  function bindCallButton(){
    const button=document.querySelector('header button[aria-label="Panggilan"]');if(!button||button.dataset.outgoingBound==='1')return false;button.dataset.outgoingBound='1';button.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();startCall()},{capture:true});button.title='Telepon Angel';return true;
  }
  function init(){injectUi();bindCallButton();[200,600,1200,2200].forEach(ms=>setTimeout(bindCallButton,ms))}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();