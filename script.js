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
const faceTrackingToggle=document.getElementById("face-tracking"),actionZoomToggle=document.getElementById("action-zoom");
let videoObjectUrl=null,facecamObjectUrl=null,whisperPipeline=null,faceDetector=null,energyProfile=null;
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
 const clipLength=Math.min(32,Math.max(8,Math.floor(duration/(count*1.12))));
 const windowCount=Math.max(1,Math.floor(clipLength/energy.secondsPer));
 const candidates=[];
 for(let start=0;start+windowCount<energy.values.length;start+=Math.max(1,Math.floor(energy.secondsPer>0?1/energy.secondsPer:1))){
  let score=0,peak=0;for(let i=start;i<start+windowCount;i++){const v=energy.values[i]||0;score+=v;peak=Math.max(peak,v);}
  candidates.push({start:start*energy.secondsPer,end:Math.min(duration,(start+windowCount)*energy.secondsPer),score:score/windowCount+peak*.12});
 }
 candidates.sort((a,b)=>b.score-a.score);
 const selected=[];
 for(const c of candidates){if(selected.every(s=>c.end+2<s.start||c.start>s.end+2)){selected.push(c);if(selected.length===count)break;}}
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
 if(video.readyState>=2&&Math.abs(video.currentTime-time)<0.05)return Promise.resolve();
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Video seek timed out")),15000);const done=()=>{clearTimeout(timer);video.removeEventListener("seeked",done);resolve();};video.addEventListener("seeked",done,{once:true});video.currentTime=time;});
}
async function prepareFaceDetector(){
 if(!faceTrackingToggle.checked||faceDetector)return faceDetector;
 try{
  renderStatus.textContent="Loading lightweight face-tracking model…";
  const vision=await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14");
  const files=await vision.FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
  faceDetector=await vision.FaceDetector.createFromOptions(files,{baseOptions:{modelAssetPath:"https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",delegate:"CPU"},runningMode:"VIDEO",minDetectionConfidence:.45});
 }catch(error){console.warn("Face tracking model unavailable; using center crop.",error);faceDetector=null;}
 return faceDetector;
}
function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function portraitCrop(video,zoom=1,face=null){
 const vw=video.videoWidth,vh=video.videoHeight;if(!vw||!vh)return null;
 let cropW=Math.min(vw,vh*9/16)/zoom,cropH=cropW*16/9;
 let cx=vw/2,cy=vh/2;
 if(face){cx=face.x+face.w/2;cy=face.y+face.h*.52;cropW=Math.min(cropW,Math.max(vh*9/16,face.w*3.1));cropH=cropW*16/9;}
 cropW=Math.min(vw,cropW);cropH=Math.min(vh,cropH);
 const sx=clamp(cx-cropW/2,0,vw-cropW),sy=clamp(cy-cropH*.40,0,vh-cropH);
 return {sx,sy,sw:cropW,sh:cropH};
}
function zoomAtTime(time){
 if(!actionZoomToggle.checked||!energyProfile)return 1;
 const index=clamp(Math.floor(time/energyProfile.secondsPer),0,energyProfile.values.length-1);
 const rms=energyProfile.values[index]||0,lo=energyProfile.p20||0,hi=energyProfile.p90||1;
 return 1+clamp((rms-lo)/Math.max(.0001,hi-lo),0,1)*.13;
}
function generatedTitle(captions){
 const words=(captions||[]).map(c=>c.text).join(" ").replace(/[^\p{L}\p{N}\s]/gu," ").split(/\s+/).filter(w=>w.length>2);
 if(!words.length)return "THE MOMENT YOU MISSED";
 const phrase=words.slice(0,7).join(" ").trim();
 return phrase.length>42?phrase.slice(0,39).trim()+"…":phrase.toUpperCase();
}
function drawWrappedText(ctx,text,x,y,maxWidth,lineHeight){
 const words=String(text||"").split(/\s+/);let line="",lines=[];
 for(const word of words){const test=line?line+" "+word:word;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word;}else line=test;}
 if(line)lines.push(line);lines.slice(0,2).forEach((row,i)=>{ctx.strokeText(row,x,y+i*lineHeight);ctx.fillText(row,x,y+i*lineHeight);});
}
async function renderOneClip(segment,index,total,buffer){
 renderStatus.textContent="Editing clip "+(index+1)+" of "+total+"…";
 const captions=await makeCaptions(buffer,segment.start,segment.end);
 const canvas=document.createElement("canvas");canvas.width=540;canvas.height=960;
 const ctx=canvas.getContext("2d",{alpha:false});
 const drawCover=(video,x,y,w,h)=>{if(!video.videoWidth||!video.videoHeight)return;const scale=Math.max(w/video.videoWidth,h/video.videoHeight),dw=video.videoWidth*scale,dh=video.videoHeight*scale;ctx.drawImage(video,x+(w-dw)/2,y+(h-dh)/2,dw,dh);};
 let raf=0,lastDetect=-1,trackedFace=null;
 const title=generatedTitle(captions);
 const draw=()=>{
  if(sourceVideo.paused||sourceVideo.ended)return;
  const W=canvas.width,H=canvas.height,elapsed=sourceVideo.currentTime-segment.start;
  ctx.fillStyle="#08080b";ctx.fillRect(0,0,W,H);
  if(faceDetector&&faceTrackingToggle.checked&&sourceVideo.readyState>=2&&elapsed-lastDetect>=.5){
   lastDetect=elapsed;try{const result=faceDetector.detectForVideo(sourceVideo,performance.now()),box=result.detections?.[0]?.boundingBox;trackedFace=box?{x:box.originX,y:box.originY,w:box.width,h:box.height}:null;}catch(e){console.warn("Face tracking frame skipped",e);}
  }
  if(selectedTemplate==="stacked"&&facecamVideo.readyState>=2){drawCover(sourceVideo,0,0,W,H*.56);drawCover(facecamVideo,0,H*.56,W,H*.44);}
  else{
   const crop=portraitCrop(sourceVideo,zoomAtTime(sourceVideo.currentTime),faceTrackingToggle.checked?trackedFace:null);
   if(crop)ctx.drawImage(sourceVideo,crop.sx,crop.sy,crop.sw,crop.sh,0,0,W,H);else drawCover(sourceVideo,0,0,W,H);
   if(facecamVideo.readyState>=2&&facecamVideo.videoWidth){const size=Math.round(W*.34),x=selectedTemplate==="corner-left"?18:W-size-18,y=H-size-28;ctx.save();ctx.beginPath();ctx.arc(x+size/2,y+size/2,size/2,0,Math.PI*2);ctx.clip();drawCover(facecamVideo,x,y,size,size);ctx.restore();ctx.beginPath();ctx.arc(x+size/2,y+size/2,size/2,0,Math.PI*2);ctx.lineWidth=5;ctx.strokeStyle="#fff";ctx.stroke();}
  }
  const cap=captions.find(c=>elapsed>=c.start&&elapsed<=c.end);
  const creator=(document.getElementById("creator-name").value.trim()||"@yourchannel").slice(0,32);
  ctx.textAlign="center";ctx.lineJoin="round";
  ctx.font="bold 18px Arial";ctx.lineWidth=4;ctx.strokeStyle="rgba(0,0,0,.85)";ctx.fillStyle="#fff";ctx.strokeText(creator,W/2,34);ctx.fillText(creator,W/2,34);
  ctx.font="900 25px Arial";ctx.lineWidth=6;ctx.strokeStyle="#09090b";ctx.fillStyle="#fff";drawWrappedText(ctx,title,W/2,82,W-54,30);
  if(cap){ctx.font=selectedCaption==="clean"?"600 27px Arial":"900 30px Arial";ctx.lineWidth=selectedCaption==="clean"?4:7;ctx.strokeStyle="#080808";ctx.fillStyle=selectedCaption==="highlight"?"#ffe16b":"#fff";drawWrappedText(ctx,cap.text.slice(0,70),W/2,H*.79,W-44,34);}
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
  return {blob,start:segment.start,end:segment.end,title,captions:captions.length>0};
 }finally{if(raf)cancelAnimationFrame(raf);sourceVideo.pause();facecamVideo.pause();canvasStream.getTracks().forEach(t=>t.stop());if(sourceStream)sourceStream.getTracks().forEach(t=>{if(t.kind==="audio")t.stop();});}
}
facecamInput.addEventListener("change",()=>{
 const file=facecamInput.files&&facecamInput.files[0];if(!file)return;
 if(facecamObjectUrl)URL.revokeObjectURL(facecamObjectUrl);facecamObjectUrl=URL.createObjectURL(file);facecamVideo.src=facecamObjectUrl;document.getElementById("facecam-label").textContent=file.name;facecamVideo.load();
});
fileInput.addEventListener("change",()=>{
 const file=fileInput.files&&fileInput.files[0];if(!file)return;
 if(videoObjectUrl)URL.revokeObjectURL(videoObjectUrl);videoObjectUrl=URL.createObjectURL(file);sourceVideo.src=videoObjectUrl;sourceVideo.style.display="block";document.getElementById("file-label").textContent=file.name;renderBtn.disabled=true;renderStatus.textContent="Loading video details…";sourceVideo.onloadedmetadata=()=>{renderBtn.disabled=false;renderStatus.textContent="Recording loaded. Choose how many Shorts to generate.";};sourceVideo.onerror=()=>{renderStatus.textContent="This video format could not be opened by Chrome. Try MP4 (H.264) or WebM.";};sourceVideo.load();
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
  const energy=buildEnergy(buffer);
  const sorted=[...energy.values].sort((a,b)=>a-b);energy.p20=sorted[Math.floor(sorted.length*.2)]||0;energy.p90=sorted[Math.floor(sorted.length*.9)]||1;energyProfile=energy;
  await prepareFaceDetector();
  const moments=chooseMoments(energy,count,sourceVideo.duration);
  if(!moments.length)throw new Error("No suitable moments found. Try a longer recording.");
  const outputs=[];
  for(let i=0;i<moments.length;i++){outputs.push(await renderOneClip(moments[i],i,moments.length,buffer));}
  renderStatus.textContent="Saving "+outputs.length+" clips for approval…";
  await saveJob(outputs);
  window.location.href="approval.html";
 }catch(error){console.error(error);renderStatus.textContent=error.message||"Something went wrong. Try a shorter video.";renderBtn.disabled=false;}
});
window.addEventListener("pagehide",()=>{if(videoObjectUrl)URL.revokeObjectURL(videoObjectUrl);if(facecamObjectUrl)URL.revokeObjectURL(facecamObjectUrl);if(faceDetector)faceDetector.close();});
