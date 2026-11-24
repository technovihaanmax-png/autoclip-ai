const screens=["welcome-screen","templates-screen","review-screen"];
const showScreen=id=>{screens.forEach(s=>document.getElementById(s).classList.toggle("active",s===id));window.scrollTo({top:0,behavior:"smooth"});};
const urlInput=document.getElementById("youtube-url");
const urlHint=document.getElementById("url-hint");
const isYouTubeUrl=value=>{try{return ["youtube.com","www.youtube.com","m.youtube.com","youtu.be","www.youtube-nocookie.com"].includes(new URL(value).hostname);}catch{return false;}};
document.getElementById("continue-btn").addEventListener("click",()=>{
 const value=urlInput.value.trim();
 if(value&&!isYouTubeUrl(value)){urlHint.textContent="Please paste a valid YouTube link, or leave it blank.";urlHint.classList.add("error");return;}
 urlHint.textContent=value?"Link saved as a reference. Select the downloaded recording next.":"No problem — upload the saved recording on the next screen.";
 urlHint.classList.remove("error");showScreen("templates-screen");
});
urlInput.addEventListener("input",()=>{urlHint.textContent="You will still need to select the saved video file below.";urlHint.classList.remove("error");});
document.getElementById("back-btn").addEventListener("click",()=>showScreen("welcome-screen"));
document.getElementById("templates-back-btn").addEventListener("click",()=>showScreen("templates-screen"));
let selectedTemplate="overlay",selectedCaption="bold";
const templateNames={overlay:"Facecam overlay",stacked:"Stacked reaction","corner-left":"Corner reaction"};
const captionNames={bold:"Bold pop",clean:"Clean",highlight:"Word highlight"};
document.querySelectorAll(".template-card").forEach(card=>card.addEventListener("click",()=>{
 document.querySelectorAll(".template-card").forEach(x=>x.classList.remove("selected"));card.classList.add("selected");selectedTemplate=card.dataset.template;
}));
document.querySelectorAll(".caption-choice").forEach(choice=>choice.addEventListener("click",()=>{
 document.querySelectorAll(".caption-choice").forEach(x=>x.classList.remove("active"));choice.classList.add("active");selectedCaption=choice.dataset.caption;
}));
document.getElementById("review-btn").addEventListener("click",()=>{
 const creator=document.getElementById("creator-name").value.trim()||"@yourchannel";
 document.getElementById("review-url").textContent=urlInput.value.trim()||"Local saved recording";
 document.getElementById("review-template").textContent=templateNames[selectedTemplate];
 document.getElementById("review-caption").textContent=captionNames[selectedCaption]+" · Hindi speech in Hinglish";
 document.getElementById("review-creator").textContent=creator;showScreen("review-screen");
});
const fileInput=document.getElementById("video-file"),sourceVideo=document.getElementById("source-video");
const renderBtn=document.getElementById("render-btn"),renderStatus=document.getElementById("render-status");
const facecamInput=document.getElementById("facecam-file"),facecamVideo=document.getElementById("facecam-video");
const captionsToggle=document.getElementById("hinglish-captions");
let videoObjectUrl=null,facecamObjectUrl=null,whisperPipeline=null;
function romanizeHindi(input){
 const map={"अ":"a","आ":"aa","इ":"i","ई":"ee","उ":"u","ऊ":"oo","ए":"e","ऐ":"ai","ओ":"o","औ":"au","क":"k","ख":"kh","ग":"g","घ":"gh","च":"ch","छ":"chh","ज":"j","झ":"jh","ट":"t","ठ":"th","ड":"d","ढ":"dh","ण":"n","त":"t","थ":"th","द":"d","ध":"dh","न":"n","प":"p","फ":"ph","ब":"b","भ":"bh","म":"m","य":"y","र":"r","ल":"l","व":"v","श":"sh","ष":"sh","स":"s","ह":"h","ा":"aa","ि":"i","ी":"ee","ु":"u","ू":"oo","े":"e","ै":"ai","ो":"o","ौ":"au","ं":"n","ँ":"n","्":"","़":""};
 const consonants=new Set("कखगघचछजझटठडढणतथदधनपफबभमयरलवशषसह");
 const chars=[...String(input)];let out="";
 for(let i=0;i<chars.length;i++){const c=chars[i],n=chars[i+1];if(consonants.has(c)){out+=map[c];if(n==="्"){i++;continue;}if(n&&map[n]){out+=map[n];i++;}else out+="a";}else out+=map[c]??c;}
 return out.replace(/\s+/g," ").trim();
}
async function getWhisper(){
 if(whisperPipeline)return whisperPipeline;
 renderStatus.textContent="Loading free Hindi speech model (first use may take a while)…";
 const {pipeline,env}=await import("https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2");
 env.allowLocalModels=false;env.useBrowserCache=true;
 whisperPipeline=await pipeline("automatic-speech-recognition","Xenova/whisper-tiny");
 return whisperPipeline;
}
function openDatabase(){
 return new Promise((resolve,reject)=>{const request=indexedDB.open("autoclip-ai",1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains("jobs"))request.result.createObjectStore("jobs");};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
}
async function saveJob(clips){
 const db=await openDatabase();await new Promise((resolve,reject)=>{const tx=db.transaction("jobs","readwrite");tx.objectStore("jobs").put(clips,"latest");tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
}
async function decodeAudio(file){
 const AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw new Error("Web Audio is unavailable in this browser.");
 const ctx=new AC();try{return await ctx.decodeAudioData(await file.arrayBuffer());}finally{await ctx.close();}
}
function buildEnergy(audio){
 const rate=audio.sampleRate,channels=audio.numberOfChannels,duration=audio.duration;
 const step=Math.max(1,Math.floor(rate/4)),values=[];
 const data=Array.from({length:channels},(_,i)=>audio.getChannelData(i));
 for(let start=0;start<audio.length;start+=step){
  const end=Math.min(audio.length,start+step);let sum=0,count=0;
  for(const channel of data)for(let i=start;i<end;i+=4){sum+=channel[i]*channel[i];count++;}
  values.push(Math.sqrt(sum/Math.max(1,count)));
 }
 return {values,secondsPer:step/rate,duration};
}
function chooseMoments(energy,count,duration){
 const clipLength=Math.min(32,Math.max(18,Math.floor(duration/(count*1.35))));
 const windowCount=Math.max(1,Math.floor(clipLength/energy.secondsPer));
 const candidates=[];
 for(let start=0;start+windowCount<energy.values.length;start+=Math.max(1,Math.floor(energy.secondsPer>0?1/energy.secondsPer:1))){
  let score=0,peak=0;for(let i=start;i<start+windowCount;i++){const v=energy.values[i]||0;score+=v;peak=Math.max(peak,v);}
  candidates.push({start:start*energy.secondsPer,end:Math.min(duration,(start+windowCount)*energy.secondsPer),score:score/windowCount+peak*.12});
 }
 candidates.sort((a,b)=>b.score-a.score);
 const selected=[];
 for(const c of candidates){if(selected.every(s=>c.end+5<s.start||c.start>s.end+5)){selected.push(c);if(selected.length===count)break;}}
 selected.sort((a,b)=>a.start-b.start);
 return selected;
}
function audioForRange(buffer,start,end){
 const rate=buffer.sampleRate,from=Math.floor(start*rate),to=Math.min(buffer.length,Math.floor(end*rate)),len=to-from;
 const mono=new Float32Array(len);
 for(let ch=0;ch<buffer.numberOfChannels;ch++){const d=buffer.getChannelData(ch);for(let i=0;i<len;i++)mono[i]+=d[from+i]/buffer.numberOfChannels;}
 const out=new Float32Array(Math.floor(len*16000/rate));
 for(let i=0;i<out.length;i++){const p=i*rate/16000,l=Math.floor(p),frac=p-l;out[i]=mono[l]*(1-frac)+(mono[Math.min(l+1,len-1)]||0)*frac;}
 return out;
}
async function makeCaptions(buffer,start,end){
 if(!captionsToggle.checked)return [];
 try{
  const model=await getWhisper();const audio=audioForRange(buffer,start,end);
  const result=await model(audio,{sampling_rate:16000,language:"hindi",task:"transcribe",return_timestamps:true});
  return (result.chunks||[]).map(c=>({start:Array.isArray(c.timestamp)?(c.timestamp[0]||0):0,end:Array.isArray(c.timestamp)?(c.timestamp[1]||0):0,text:romanizeHindi(c.text||"")})).filter(c=>c.text);
 }catch(error){console.warn("Caption generation unavailable",error);return [];}
}
function waitForSeek(video,time){
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Video seek timed out")),15000);const done=()=>{clearTimeout(timer);video.removeEventListener("seeked",done);resolve();};video.addEventListener("seeked",done,{once:true});video.currentTime=time;});
}
async function renderOneClip(segment,index,total,buffer){
 renderStatus.textContent="Editing clip "+(index+1)+" of "+total+"…";
 const captions=await makeCaptions(buffer,segment.start,segment.end);
 const canvas=document.createElement("canvas");canvas.width=540;canvas.height=960;
 const ctx=canvas.getContext("2d",{alpha:false});
 const drawCover=(video,x,y,w,h)=>{if(!video.videoWidth||!video.videoHeight)return;const scale=Math.max(w/video.videoWidth,h/video.videoHeight),dw=video.videoWidth*scale,dh=video.videoHeight*scale;ctx.drawImage(video,x+(w-dw)/2,y+(h-dh)/2,dw,dh);};
 let raf=0;
 const draw=()=>{
  if(sourceVideo.paused||sourceVideo.ended)return;
  const W=canvas.width,H=canvas.height;ctx.fillStyle="#08080b";ctx.fillRect(0,0,W,H);
  if(selectedTemplate==="stacked"&&facecamVideo.readyState>=2){drawCover(sourceVideo,0,0,W,H*.56);drawCover(facecamVideo,0,H*.56,W,H*.44);}
  else{drawCover(sourceVideo,0,0,W,H);if(facecamVideo.readyState>=2&&facecamVideo.videoWidth){const size=Math.round(W*.34),x=selectedTemplate==="corner-left"?18:W-size-18,y=H-size-28;ctx.save();ctx.beginPath();ctx.arc(x+size/2,y+size/2,size/2,0,Math.PI*2);ctx.clip();drawCover(facecamVideo,x,y,size,size);ctx.restore();ctx.beginPath();ctx.arc(x+size/2,y+size/2,size/2,0,Math.PI*2);ctx.lineWidth=5;ctx.strokeStyle="#fff";ctx.stroke();}}
  const t=sourceVideo.currentTime-segment.start,cap=captions.find(c=>t>=c.start&&t<=c.end);
  if(cap){ctx.font="bold 29px Arial";ctx.textAlign="center";ctx.lineWidth=7;ctx.strokeStyle="#000";ctx.fillStyle="#fff";ctx.strokeText(cap.text.slice(0,38),W/2,H*.79);ctx.fillText(cap.text.slice(0,38),W/2,H*.79);}
  const creator=(document.getElementById("creator-name").value.trim()||"@yourchannel").slice(0,32);
  ctx.font="bold 20px Arial";ctx.textAlign="center";ctx.lineWidth=4;ctx.strokeStyle="rgba(0,0,0,.7)";ctx.strokeText(creator,W/2,38);ctx.fillStyle="#fff";ctx.fillText(creator,W/2,38);
  raf=requestAnimationFrame(draw);
 };
 const canvasStream=canvas.captureStream(24),tracks=[...canvasStream.getVideoTracks()];let sourceStream=null;
 try{sourceStream=sourceVideo.captureStream?sourceVideo.captureStream():null;if(sourceStream)sourceStream.getAudioTracks().forEach(t=>tracks.push(t));}catch(e){console.warn("Audio capture unavailable",e);}
 const stream=new MediaStream(tracks),mime=["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"].find(x=>MediaRecorder.isTypeSupported(x));
 if(!mime)throw new Error("This browser cannot export WebM video.");
 const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2200000}),parts=[];
 const finished=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data&&e.data.size)parts.push(e.data);};recorder.onerror=()=>reject(new Error("Recording failed"));recorder.onstop=()=>resolve(new Blob(parts,{type:mime}));});
 try{
  sourceVideo.pause();if(facecamVideo.src){facecamVideo.pause();await waitForSeek(facecamVideo,Math.min(segment.start,Math.max(0,(facecamVideo.duration||0)-.1)));}
  await waitForSeek(sourceVideo,segment.start);recorder.start(400);await sourceVideo.play();if(facecamVideo.src)await facecamVideo.play().catch(()=>{});
  draw();
  await new Promise(resolve=>{const check=()=>{if(sourceVideo.currentTime>=segment.end||sourceVideo.ended){sourceVideo.pause();facecamVideo.pause();resolve();}else setTimeout(check,100);};check();});
  if(recorder.state!=="inactive")recorder.stop();const blob=await finished;
  return {blob,start:segment.start,end:segment.end,title:"Moment "+String(index+1).padStart(2,"0"),captions:captions.length>0};
 }finally{if(raf)cancelAnimationFrame(raf);sourceVideo.pause();facecamVideo.pause();canvasStream.getTracks().forEach(t=>t.stop());if(sourceStream)sourceStream.getTracks().forEach(t=>{if(t.kind==="audio")t.stop();});}
}
facecamInput.addEventListener("change",()=>{
 const file=facecamInput.files&&facecamInput.files[0];if(!file)return;
 if(facecamObjectUrl)URL.revokeObjectURL(facecamObjectUrl);facecamObjectUrl=URL.createObjectURL(file);facecamVideo.src=facecamObjectUrl;document.getElementById("facecam-label").textContent=file.name;facecamVideo.load();
});
fileInput.addEventListener("change",()=>{
 const file=fileInput.files&&fileInput.files[0];if(!file)return;
 if(videoObjectUrl)URL.revokeObjectURL(videoObjectUrl);videoObjectUrl=URL.createObjectURL(file);sourceVideo.src=videoObjectUrl;sourceVideo.style.display="block";document.getElementById("file-label").textContent=file.name;renderBtn.disabled=false;renderStatus.textContent="Recording loaded. Choose how many Shorts to generate.";sourceVideo.load();
});
renderBtn.addEventListener("click",async()=>{
 const file=fileInput.files&&fileInput.files[0];if(!file){renderStatus.textContent="Choose your saved livestream video first.";return;}
 if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream){renderStatus.textContent="Your browser does not support local video export. Update Chrome.";return;}
 if(!Number.isFinite(sourceVideo.duration)||sourceVideo.duration<45){renderStatus.textContent="The recording needs to be at least 45 seconds long.";return;}
 if(sourceVideo.duration>1800){renderStatus.textContent="For this browser-only first version, use a recording under 30 minutes to avoid Chromebook memory problems.";return;}
 renderBtn.disabled=true;
 try{
  renderStatus.textContent="Analysing the recording audio…";
  const buffer=await decodeAudio(file),count=Number(document.getElementById("clip-count").value)||8;
  const energy=buildEnergy(buffer),moments=chooseMoments(energy,count,sourceVideo.duration);
  if(!moments.length)throw new Error("No suitable moments found. Try a longer recording.");
  const outputs=[];
  for(let i=0;i<moments.length;i++){outputs.push(await renderOneClip(moments[i],i,moments.length,buffer));}
  renderStatus.textContent="Saving "+outputs.length+" clips for approval…";
  await saveJob(outputs);
  window.location.href="approval.html";
 }catch(error){console.error(error);renderStatus.textContent=error.message||"Something went wrong. Try a shorter video.";renderBtn.disabled=false;}
});
window.addEventListener("pagehide",()=>{if(videoObjectUrl)URL.revokeObjectURL(videoObjectUrl);if(facecamObjectUrl)URL.revokeObjectURL(facecamObjectUrl);});
