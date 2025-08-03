
// Handle start/stop capture commands
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "start-capture") {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: (selectedPhase) => window.startCapture?.(selectedPhase),
          args: [message.phase]
        });
      });
    } else if (message.action === "stop-capture") {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: () => window.stopCapture?.()
        });
      });
    }
    else if (message?.action === "GET_CURRENT_TAB_ID") {
      if (sender?.tab?.id !== undefined) {
        sendResponse({ tabId: sender.tab.id });
      } else {
        sendResponse({ tabId: null });
      }
    }
    else if (message.action === "CLEANUP_CONTROLS_ON_ALL_TABS") {
      cleanupControlsOnAllTabs(); // defined in the same file
    }
    return true; // Required for async response
  });

  function getStorage(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, resolve);
    });
  }


function setStorage(obj, callback = null) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(obj, () => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }

      if (typeof callback === "function") {
        callback(); // Optional callback if user passed one
      }

      resolve();
    });
  });
}

  async function cleanupControlsOnAllTabs() {
    const { activeCaptureTabs = [] } = await getStorage(["activeCaptureTabs"]);
    for (const tabId of activeCaptureTabs) {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          window.removeManualControlButtons?.();
        }
      });
    }
  
    await setStorage({ activeCaptureTabs: [] });
  }
  
// remove stale leftover states from previous session
  chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.remove(["isCapturing", "capturePhase","previousActiveTabId","currentActiveTabId"]);
  });
// Re-apply capture on tab switch, only if active
// chrome.tabs.onActivated.addListener((activeInfo) => {
//     chrome.storage.local.get(["isCapturing", "phase"], ({ isCapturing, phase }) => {
//       if (isCapturing && phase) {
//         chrome.scripting.executeScript({
//           target: { tabId: activeInfo.tabId },
//           func: (selectedPhase) => window.startCapture?.(selectedPhase),
//           args: [phase]
//         });
//       }
//     });
//   });
  
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const newTabId = activeInfo.tabId;
    
    const { isCapturing, capturePhase } = await chrome.storage.local.get(["isCapturing", "capturePhase"]);

    // 🔥 Immediately snapshot the old tab ID
    // 🔁 Update the current one before any async work
    const { currentActiveTabId = null} = await chrome.storage.local.get(["currentActiveTabId"]);
    let previousActiveTabId = null;
    if(isCapturing) {
       previousActiveTabId = currentActiveTabId;
    }

    await chrome.storage.local.set({
      previousActiveTabId,
      currentActiveTabId: newTabId
    });


    if (isCapturing && capturePhase) {
      chrome.scripting.executeScript({
        target: { tabId: activeInfo.tabId },
        files: ["content.js","toast.js","db.js"] // Inject the content script first
      }, () => {
        if (previousActiveTabId !== null && previousActiveTabId !== newTabId){

          // this way you send messsage to content.js to invoke push capture for you
          chrome.tabs.sendMessage(previousActiveTabId, {
            action: "PUSH_PENDING_CAPTURE_BEFORE_TAB_SWITCH"
          }).catch((err) => {
            console.warn(`Failed to send PUSH_PENDING_CAPTURE to tab ${previousActiveTabId}:`, err);
          });
        }

        chrome.scripting.executeScript({
          target: { tabId: activeInfo.tabId },
          func: (selectedPhase) => window.startCapture?.(selectedPhase),
          args: [capturePhase]
        });
      });
    }
  });

  
// // Inject into all tabs on install
//   chrome.runtime.onInstalled.addListener(() => {
//     chrome.tabs.query({}, (tabs) => {
//       for (const tab of tabs) {
//         if (tab.id && tab.url?.startsWith("http")) {
//           chrome.scripting.executeScript({
//             target: { tabId: tab.id },
//             files: ["content.js"]
//           });
//         }
//       }
//     });
//   });

// // Inject content.js into new or refreshed tabs
//   chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
//     if (changeInfo.status === "complete" && /^https?:/.test(tab.url)) {
//       chrome.scripting.executeScript({
//         target: { tabId },
//         files: ["content.js"]
//       });
//     }
//   });

//   chrome.tabs.onCreated.addListener((tab) => {
//     if (tab.url && /^https?:/.test(tab.url)) {
//       chrome.scripting.executeScript({
//         target: { tabId: tab.id },
//         files: ["content.js"]
//       });
//     }
//   });

// // If the tab is refreshed or navigates to a new URL, content scripts are cleared.
// chrome.webNavigation.onCompleted.addListener(async (details) => {
//   const { isCapturing, phase } = await chrome.storage.local.get(["isCapturing", "phase"]);
//   if (isCapturing) {
//     chrome.scripting.executeScript({
//       target: { tabId: details.tabId },
//       func: (selectedPhase) => window.startCapture?.(selectedPhase),
//       args: [phase]
//     });
//   }
// });