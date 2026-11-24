const screens = ["welcome-screen","templates-screen","review-screen"];
const showScreen = (id) => {
  screens.forEach(screen => document.getElementById(screen).classList.toggle("active", screen === id));
  window.scrollTo({top:0,behavior:"smooth"});
};
const urlInput = document.getElementById("youtube-url");
const urlHint = document.getElementById("url-hint");
const isYouTubeUrl = value => {
  try {
    const url = new URL(value);
    return ["youtube.com","www.youtube.com","m.youtube.com","youtu.be","www.youtube-nocookie.com"].includes(url.hostname);
  } catch { return false; }
};
document.getElementById("continue-btn").addEventListener("click", () => {
  const value = urlInput.value.trim();
  if (!isYouTubeUrl(value)) {
    urlHint.textContent = "Please paste a valid YouTube video link to continue.";
    urlHint.classList.add("error");
    urlInput.focus();
    return;
  }
  urlHint.textContent = "Link added. Choose your editing style next.";
  urlHint.classList.remove("error");
  showScreen("templates-screen");
});
urlInput.addEventListener("input", () => { urlHint.textContent = "Example: https://youtube.com/watch?v=…"; urlHint.classList.remove("error"); });
document.getElementById("back-btn").addEventListener("click", () => showScreen("welcome-screen"));
document.getElementById("templates-back-btn").addEventListener("click", () => showScreen("templates-screen"));
let selectedTemplate = "overlay";
let selectedCaption = "bold";
const templateNames = {overlay:"Facecam overlay",stacked:"Stacked reaction", "corner-left":"Corner reaction"};
const captionNames = {bold:"Bold pop",clean:"Clean",highlight:"Word highlight"};
document.querySelectorAll(".template-card").forEach(card => card.addEventListener("click", () => {
  document.querySelectorAll(".template-card").forEach(item => item.classList.remove("selected"));
  card.classList.add("selected");
  selectedTemplate = card.dataset.template;
}));
document.querySelectorAll(".caption-choice").forEach(choice => choice.addEventListener("click", () => {
  document.querySelectorAll(".caption-choice").forEach(item => item.classList.remove("active"));
  choice.classList.add("active");
  selectedCaption = choice.dataset.caption;
}));
document.getElementById("review-btn").addEventListener("click", () => {
  const creator = document.getElementById("creator-name").value.trim() || "@yourchannel";
  document.getElementById("review-url").textContent = urlInput.value.trim();
  document.getElementById("review-template").textContent = templateNames[selectedTemplate];
  document.getElementById("review-caption").textContent = captionNames[selectedCaption] + " · Hindi speech in Hinglish";
  document.getElementById("review-creator").textContent = creator;
  showScreen("review-screen");
});

const fileInput = document.getElementById("video-file");
const sourceVideo = document.getElementById("source-video");
const renderBtn = document.getElementById("render-btn");
const renderStatus = document.getElementById("render-status");
const downloadLink = document.getElementById("download-clip");
let videoObjectUrl = null;
let facecamObjectUrl = null;
const facecamInput = document.getElementById("facecam-file");
const facecamVideo = document.getElementById("facecam-video");
const autoFindBtn=document.getElementById("auto-find-btn");
const captionsToggle=document.getElementById("hinglish-captions");
let whisperPipeline=null, captionChunks=[];
function romanizeHindi(input){
 const m={"अ":"a","आ":"aa","इ":"i","ई":"ee","उ":"u","ऊ":"oo","ए":"e","ऐ":"ai","ओ":"o","औ":"au","क":"k","ख":"kh","ग":"g","घ":"gh","ङ":"ng","च":"ch","छ":"chh","ज":"j","झ":"jh","ञ":"ny","ट":"t","ठ":"th","ड":"d","ढ":"dh","ण":"n","त":"t","थ":"th","द":"d","ध":"dh","न":"n","प":"p","फ":"ph","ब":"b","भ":"bh","म":"m","य":"y","र":"r","ल":"l","व":"v","श":"sh","ष":"sh","स":"s","ह":"h","ा":"aa","ि":"i","ी":"ee","ु":"u","ू":"oo","े":"e","ै":"ai","ो":"o","ौ":"au","ं":"n","ँ":"n","ः":"h","्":"","़":""};
 const cons=new Set("कखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसह".split(""));
 const a=[...String(input)];let out="";
 for(let i=0;i<a.length;i++){let c=a[i],n=a[i+1];if(cons.has(c)){out+=m[c];if(n==="्"){i++;continue;}if(n&&["ा","ि","ी","ु","ू","े","ै","ो","ौ","ं","ँ","ः","़"].includes(n)){out+=m[n]||"";i++;}else out+="a";}else out+=m[c]??c;}
 return out.replace(/\s+/g," ").trim();
}
async function getWhisper(){
 if(whisperPipeline)return whisperPipeline;
 renderStatus.textContent="Loading free Hindi speech model… first use downloads it.";
 const {pipeline,env}=await import("https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2");
 env.allowLocalModels=false;env.useBrowserCache=true;
 whisperPipeline=await pipeline("automatic-speech-recognition","Xenova/whisper-tiny");
 return whisperPipeline;
}
async function getClipAudio(start,end){
 const file=fileInput.files&&fileInput.files[0];if(!file)throw new Error("Choose a video first.");
 const AC=window.AudioContext||window.webkitAudioContext,ac=new AC();
 try{
  const decoded=await ac.decodeAudioData(await file.arrayBuffer()),rate=decoded.sampleRate;
  const from=Math.floor(start*rate),to=Math.min(decoded.length,Math.floor(end*rate)),len=to-from;
  if(len<=0)throw new Error("No audio in this section.");
  const mono=new Float32Array(len);
  for(let c=0;c<decoded.numberOfChannels;c++){const d=decoded.getChannelData(c);for(let i=0;i<len;i++)mono[i]+=d[from+i]/decoded.numberOfChannels;}
  const out=new Float32Array(Math.floor(len*16000/rate));
  for(let i=0;i<out.length;i++){const p=i*rate/16000,l=Math.floor(p),f=p-l;out[i]=mono[l]*(1-f)+(mono[Math.min(l+1,len-1)]||0)*f;}
  return out;
 }finally{await ac.close();}
}
autoFindBtn.addEventListener("click",async()=>{
 autoFindBtn.disabled=true;
 try{
  const audio=await getClipAudio(0,sourceVideo.duration),win=16000,count=Math.floor(audio.length/win);
  if(count<5)throw new Error("Video is too short for auto moment detection.");
  const levels=[];for(let w=0;w<count;w++){let sum=0;for(let i=w*win;i<(w+1)*win;i++)sum+=audio[i]*audio[i];levels.push(Math.sqrt(sum/win));}
  const seconds=Math.min(30,Math.max(8,Math.floor(audio.length/16000))),span=Math.min(count,seconds);let best=0,score=-1;
  for(let s=0;s<=count-span;s++){let v=0;for(let j=s;j<s+span;j++)v+=levels[j];if(v>score){score=v;best=s;}}
  document.getElementById("clip-start").value=best.toFixed(1);
  document.getElementById("clip-end").value=Math.min(sourceVideo.duration,best+seconds).toFixed(1);
  sourceVideo.currentTime=best;
  renderStatus.textContent="An energetic section is selected. Preview it, then create your Short.";
 }catch(e){renderStatus.textContent=e.message||"Auto moment detection failed. Set the times manually.";}
 finally{autoFindBtn.disabled=false;}
});

facecamInput.addEventListener("change", () => {
  const file = facecamInput.files && facecamInput.files[0];
  if (!file) return;
  if (facecamObjectUrl) URL.revokeObjectURL(facecamObjectUrl);
  facecamObjectUrl = URL.createObjectURL(file);
  facecamVideo.src = facecamObjectUrl;
  document.getElementById("facecam-label").textContent = file.name;
  facecamVideo.load();
});
fileInput.addEventListener("change", () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
  videoObjectUrl = URL.createObjectURL(file);
  sourceVideo.src = videoObjectUrl;
  sourceVideo.style.display = "block";
  document.getElementById("file-label").textContent = file.name;
  downloadLink.hidden = true;
  renderBtn.disabled = false;
  renderStatus.textContent = "Video loaded locally. Set the start and end time, then create your clip.";
  sourceVideo.onloadedmetadata = () => {
    document.getElementById("clip-start").value = "0";
    document.getElementById("clip-end").value = Math.min(15, Math.floor(sourceVideo.duration*10)/10);
    document.getElementById("clip-end").max = sourceVideo.duration;
  };
});
renderBtn.addEventListener("click", async () => {
  const startTime = Math.max(0, Number(document.getElementById("clip-start").value) || 0);
  const endTime = Number(document.getElementById("clip-end").value);
  if (!sourceVideo.src || !Number.isFinite(endTime) || endTime <= startTime || endTime > sourceVideo.duration) {
    renderStatus.textContent = "Please enter a valid start and end time within your video.";
    return;
  }
  if (endTime - startTime > 45) {
    renderStatus.textContent = "For smooth Chromebook performance, keep this first test to 45 seconds or less.";
    return;
  }
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
    renderStatus.textContent = "This browser does not support local video recording. Update Chrome and try again.";
    return;
  }
  renderBtn.disabled = true;
  downloadLink.hidden = true;
  renderStatus.textContent = "Preparing your clip… processing starts now.";
  captionChunks=[];
  if(captionsToggle.checked){try{const audio=await getClipAudio(startTime,endTime);const asr=await getWhisper();renderStatus.textContent="Transcribing Hindi speech into Hinglish captions…";const result=await asr(audio,{sampling_rate:16000,language:"hindi",task:"transcribe",return_timestamps:true,chunk_length_s:20});captionChunks=(result.chunks||[]).map(c=>({start:Array.isArray(c.timestamp)?(c.timestamp[0]||0):0,end:Array.isArray(c.timestamp)?(c.timestamp[1]||0):0,text:romanizeHindi(c.text||"")})).filter(c=>c.text);if(!captionChunks.length&&result.text)captionChunks=[{start:0,end:endTime-startTime,text:romanizeHindi(result.text)}];}catch(e){renderStatus.textContent="Captions unavailable: "+(e.message||"model error")+". Continuing without captions.";captionChunks=[];}}
  const canvas = document.createElement("canvas");
  canvas.width = 540;
  canvas.height = 960;
  const ctx = canvas.getContext("2d", { alpha: false });
  const drawCover = (video, x, y, w, h) => {
    const vw=video.videoWidth, vh=video.videoHeight;
    if (!vw || !vh) return;
    const scale=Math.max(w/vw,h/vh);
    const dw=vw*scale, dh=vh*scale;
    ctx.drawImage(video,x+(w-dw)/2,y+(h-dh)/2,dw,dh);
  };
  let rafId=0;
  const drawFrame = () => {
    if (sourceVideo.paused || sourceVideo.ended) return;
    const W=canvas.width,H=canvas.height;
    ctx.fillStyle="#08080b";ctx.fillRect(0,0,W,H);
    if (selectedTemplate === "stacked" && facecamVideo.readyState >= 2) {
      drawCover(sourceVideo,0,0,W,H*0.56);
      drawCover(facecamVideo,0,H*0.56,W,H*0.44);
    } else {
      drawCover(sourceVideo,0,0,W,H);
      if (facecamVideo.readyState >= 2 && facecamVideo.videoWidth) {
        if (selectedTemplate === "corner-left") {
          const size= Math.round(W*0.34), x=18, y=H-size-28;
          ctx.save();ctx.beginPath();ctx.arc(x+size/2,y+size/2,size/2,0,Math.PI*2);ctx.clip();
          drawCover(facecamVideo,x,y,size,size);ctx.restore();
          ctx.beginPath();ctx.arc(x+size/2,y+size/2,size/2,0,Math.PI*2);ctx.lineWidth=5;ctx.strokeStyle="#ffffff";ctx.stroke();
        } else {
          const size=Math.round(W*0.34),x=W-size-18,y=H-size-28;
          ctx.save();ctx.beginPath();ctx.arc(x+size/2,y+size/2,size/2,0,Math.PI*2);ctx.clip();
          drawCover(facecamVideo,x,y,size,size);ctx.restore();
          ctx.beginPath();ctx.arc(x+size/2,y+size/2,size/2,0,Math.PI*2);ctx.lineWidth=5;ctx.strokeStyle="#ffffff";ctx.stroke();
        }
      }
    }
    const t=sourceVideo.currentTime-startTime;const cap=captionChunks.find(c=>t>=c.start&&t<=c.end);if(cap&&cap.text){ctx.font="bold 30px Arial";ctx.textAlign="center";ctx.lineWidth=7;ctx.strokeStyle="rgba(0,0,0,.9)";ctx.fillStyle="#fff";ctx.strokeText(cap.text.slice(0,42),W/2,H*.79);ctx.fillText(cap.text.slice(0,42),W/2,H*.79);}
    const creator=(document.getElementById("creator-name").value.trim() || "@yourchannel").slice(0,32);
    ctx.font="bold 20px Arial";ctx.textAlign="center";ctx.lineWidth=4;ctx.strokeStyle="rgba(0,0,0,.6)";
    ctx.strokeText(creator,W/2,38);ctx.fillStyle="#fff";ctx.fillText(creator,W/2,38);
    rafId=requestAnimationFrame(drawFrame);
  };
  const canvasStream=canvas.captureStream(24);
  const tracks=[...canvasStream.getVideoTracks()];
  let sourceStream=null;
  try {
    sourceStream=sourceVideo.captureStream ? sourceVideo.captureStream() : (sourceVideo.mozCaptureStream ? sourceVideo.mozCaptureStream() : null);
    if(sourceStream) sourceStream.getAudioTracks().forEach(track=>tracks.push(track));
  } catch(e) { console.warn("Source audio capture unavailable",e); }
  const combinedStream=new MediaStream(tracks);
  const mimeType=["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"].find(type=>MediaRecorder.isTypeSupported(type));
  if(!mimeType){renderStatus.textContent="WebM recording is not supported in this browser.";renderBtn.disabled=false;canvasStream.getTracks().forEach(t=>t.stop());return;}
  const chunks=[];
  let recorder;
  try { recorder=new MediaRecorder(combinedStream,{mimeType,videoBitsPerSecond:2500000}); }
  catch(error){renderStatus.textContent="Could not start recording. Try a shorter or smaller source video.";renderBtn.disabled=false;canvasStream.getTracks().forEach(t=>t.stop());return;}
  let stopped=false;
  const cleanup=()=>{
    if(rafId)cancelAnimationFrame(rafId);
    canvasStream.getTracks().forEach(track=>track.stop());
    if(sourceStream)sourceStream.getTracks().forEach(track=>{if(track.kind==="audio")track.stop();});
    sourceVideo.pause();facecamVideo.pause();
    renderBtn.disabled=false;
  };
  recorder.ondataavailable=e=>{if(e.data && e.data.size)chunks.push(e.data);};
  recorder.onerror=()=>{if(!stopped){stopped=true;cleanup();renderStatus.textContent="Recording failed. Try a shorter clip."; }};
  recorder.onstop=()=>{
    if(stopped)return;stopped=true;cleanup();
    if(!chunks.length){renderStatus.textContent="No video data was recorded. Try another file.";return;}
    const blob=new Blob(chunks,{type:mimeType});
    const outputUrl=URL.createObjectURL(blob);
    downloadLink.href=outputUrl;downloadLink.hidden=false;
    renderStatus.textContent="Your vertical clip is ready. Download it below. Export format: WebM."+(captionsToggle.checked?(captionChunks.length?" Hinglish captions added.":" Captions unavailable for this file."):"");
  };
  try {
    sourceVideo.pause();
    if(facecamVideo.src){facecamVideo.currentTime=Math.min(startTime,Math.max(0,facecamVideo.duration||0));await facecamVideo.play().catch(()=>{});}
    sourceVideo.currentTime=startTime;
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("Video seek timed out")),10000);
      sourceVideo.addEventListener("seeked",()=>{clearTimeout(timer);resolve();},{once:true});
    });
    recorder.start(500);
    await sourceVideo.play();
    drawFrame();
    const stopAt=()=>{if(sourceVideo.currentTime>=endTime && recorder.state!=="inactive"){sourceVideo.pause();if(facecamVideo.src)facecamVideo.pause();recorder.stop();}};
    sourceVideo.addEventListener("timeupdate",stopAt);
    recorder.addEventListener("stop",()=>sourceVideo.removeEventListener("timeupdate",stopAt),{once:true});
    renderStatus.textContent="Creating your clip… keep this tab open until it finishes.";
  } catch(error) {
    if(recorder.state!=="inactive")recorder.stop();else cleanup();
    renderStatus.textContent="Could not play or seek this file. Try a different video.";
  }
});
window.addEventListener("pagehide",()=>{
  if(videoObjectUrl)URL.revokeObjectURL(videoObjectUrl);
  if(facecamObjectUrl)URL.revokeObjectURL(facecamObjectUrl);
});
