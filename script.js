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
document.getElementById("finish-btn").addEventListener("click", () => {
  alert("Your AUTOCLIP AI setup is saved in this preview. The video-processing engine is the next build stage.");
});