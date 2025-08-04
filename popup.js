  
// Send message to background script to start capture

document.getElementById("start").addEventListener("click", () => {
  const phase = document.getElementById("phaseSelect").value;
  chrome.runtime.sendMessage({ action: "start-capture", phase });
});

// Send message to background script to stop capture
document.getElementById("stop").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "stop-capture" });
});