browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return false;
  }
  if (message.type === "status") {
    const tabId = sender.tab && sender.tab.id;
    if (tabId !== undefined) {
      const text = message.text ? "Mark and Copy. " + message.text : "Mark and Copy";
      browser.action.setTitle({ tabId: tabId, title: text });
      browser.action.setBadgeText({ tabId: tabId, text: message.badge || "" });
      browser.action.setBadgeBackgroundColor({ tabId: tabId, color: "#1a1a1a" });
      if (browser.action.setBadgeTextColor) {
        browser.action.setBadgeTextColor({ tabId: tabId, color: "#ffffff" });
      }
    }
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === "capture") {
    captureRect(message)
      .then((png) => {
        sendResponse({ ok: true, dataUrl: "data:image/png;base64," + png });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: String(error) });
      });
    return true;
  }
  if (message.type === "copy") {
    copyPng(message.dataUrl)
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: String(error) });
      });
    return true;
  }
  return false;
});

function captureRect(rect) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const parts = [];
    const port = browser.runtime.connectNative("mark_and_copy");
    const finish = (fn) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timer);
      try {
        port.disconnect();
      } catch (error) {
        // The host is already gone.
      }
      fn();
    };
    const timer = window.setTimeout(() => {
      finish(() => reject(new Error("timed out")));
    }, 8000);
    port.onMessage.addListener((msg) => {
      if (!msg || msg.ok !== true || typeof msg.data !== "string") {
        finish(() => reject(new Error((msg && msg.error) || "capture failed")));
        return;
      }
      parts[msg.index] = msg.data;
      const got = parts.filter((part) => typeof part === "string").length;
      if (got === msg.count) {
        finish(() => resolve(parts.join("")));
      }
    });
    port.onDisconnect.addListener(() => {
      const reason = browser.runtime.lastError;
      window.setTimeout(() => {
        finish(() => reject(new Error(reason ? reason.message : "host disconnected")));
      }, 50);
    });
    port.postMessage({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    });
  });
}

async function copyPng(dataUrl) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  await navigator.clipboard.write([
    new ClipboardItem({ "image/png": blob })
  ]);
}
