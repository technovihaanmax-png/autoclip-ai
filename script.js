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
  const start = Math.max(0, Number(document.getElementById("clip-start").value) || 0);
  const end = Number(document.getElementById("clip-end").value);
  if (!sourceVideo.src || !Number.isFinite(end) || end <= start || end > sourceVideo.duration) {
    renderStatus.textContent = "Please enter a valid start and end time within your video.";
    return;
  }
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
    renderStatus.textContent = "This browser does not support local video recording. Try an updated Chrome browser.";
    return;
  }
  renderBtn.disabled = true;
  downloadLink.hidden = true;
  renderStatus.textContent = "Preparing your vertical clip… keep this tab open.";
  const canvas = document.createElement("canvas");
  canvas.width = 720; canvas.height = 1280;
  const ctx = canvas.getContext("2d");
  const drawFrame = () => {
    if (sourceVideo.paused || sourceVideo.ended) return;
    const sw=sourceVideo.videoWidth, sh=sourceVideo.videoHeight;
    if (sw && sh) {
      const scale=Math.max(canvas.width/sw,canvas.height/sh);
      const dw=sw*scale, dh=sh*scale;
      ctx.fillStyle="#08080b";ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(sourceVideo,(canvas.width-dw)/2,(canvas.height-dh)/2,dw,dh);
    }
    requestAnimationFrame(drawFrame);
  };
  const canvasStream=canvas.captureStream(30);
  let combinedStream=canvasStream;
  try {
    const sourceStream=sourceVideo.captureStream ? sourceVideo.captureStream() : sourceVideo.mozCaptureStream();
    sourceStream.getAudioTracks().forEach(track=>canvasStream.addTrack(track));
  } catch(e) { console.warn("Audio capture unavailable",e); }
  const mimeType=["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"].find(type=>MediaRecorder.isTypeSupported(type));
  if (!mimeType) { renderStatus.textContent="WebM recording is not supported in this browser.";renderBtn.disabled=false;return; }
  const chunks=[];
  const recorder=new MediaRecorder(combinedStream,{mimeType});
  recorder.ondataavailable=e=>{if(e.data && e.data.size)chunks.push(e.data);};
  recorder.onerror=()=>{renderStatus.textContent="Recording failed. Try a shorter clip.";renderBtn.disabled=false;};
  recorder.onstop=()=>{
    const blob=new Blob(chunks,{type:mimeType});
    const url=URL.createObjectURL(blob);
    downloadLink.href=url;downloadLink.hidden=false;
    renderStatus.textContent="Your vertical clip is ready. Download it below. This first version exports WebM.";
    renderBtn.disabled=false;
    canvasStream.getTracks().forEach(t=>t.stop());
  };
  sourceVideo.pause();
  sourceVideo.currentTime=start;
  await new Promise(resolve=>sourceVideo.addEventListener("seeked",resolve,{once:true}));
  recorder.start(500);
  sourceVideo.play().then(drawFrame).catch(()=>{
    recorder.stop();renderStatus.textContent="Could not play this video. Try another file.";renderBtn.disabled=false;
  });
  const stopAt=()=>{if(sourceVideo.currentTime>=end){sourceVideo.pause();if(recorder.state!=="inactive")recorder.stop();sourceVideo.removeEventListener("timeupdate",stopAt);}};
  sourceVideo.addEventListener("timeupdate",stopAt);
  sourceVideo.addEventListener("ended",()=>{if(recorder.state!=="inactive")recorder.stop();},{once:true});
  renderStatus.textContent="Recording your clip… keep this tab open until it finishes.";
});
