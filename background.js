let markerWindowId = null;
let selecting = false;
let selectTool = "";
let selectStatus = "Click one corner.";
let idleStatus = "Click a tool.";
let stagedUrl = null;
let alreadyCopied = false;
let stageGeneration = 0;

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return false;
  }
  if (message.type === "status") {
    setChrome(message.text || "", message.badge || "");
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === "ready") {
    selecting = false;
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === "writeClipboard") {
    copyPng(message.dataUrl).then(() => {
      sendResponse({ ok: true });
    }, (error) => {
      sendResponse({ ok: false, error: String(error) });
    });
    return true;
  }
  if (message.type === "stage") {
    if (typeof message.dataUrl === "string" && message.dataUrl.indexOf("data:image/png") === 0) {
      stagedUrl = message.dataUrl;
    }
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === "copied") {
    alreadyCopied = true;
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === "getState") {
    if (selecting) {
      sendResponse(selectState());
      return false;
    }
    route(message).then(sendResponse, () => sendResponse(idleState()));
    return true;
  }
  if (message.type === "start") {
    const tool = message.tool === "bingo" ? "bingo" : "highlighter";
    if (selecting) {
      sendResponse(selectState());
      return false;
    }
    markerTabId().then((tabId) => {
      if (tabId !== null) {
        return browser.tabs.sendMessage(tabId, message).then(sendResponse, () => sendResponse(idleState()));
      }
      sendResponse({
        ok: true,
        tool: tool,
        count: 0,
        status: "Click one corner."
      });
      window.setTimeout(() => {
        beginSelect(tool);
      }, 80);
    });
    return true;
  }
  if (message.type === "score") {
    route(message).then(sendResponse, (error) => {
      sendResponse({ ok: false, error: String(error), status: idleStatus });
    });
    return true;
  }
  return false;
});

browser.windows.onRemoved.addListener((windowId) => {
  if (windowId !== markerWindowId) {
    return;
  }
  markerWindowId = null;
  selecting = false;
  const generation = stageGeneration;
  browser.storage.session.remove([
    "mark-and-copy-picture",
    "mark-and-copy-tool"
  ]);
  window.setTimeout(() => {
    if (generation !== stageGeneration) {
      return;
    }
    const url = stagedUrl;
    const skip = alreadyCopied;
    stagedUrl = null;
    alreadyCopied = false;
    if (skip) {
      idleStatus = "Copied.";
      setChrome("Copied.", "");
      return;
    }
    if (!url) {
      idleStatus = "Click a tool.";
      setChrome("", "");
      return;
    }
    copyPng(url).then(() => {
      if (generation !== stageGeneration) {
        return;
      }
      idleStatus = "Copied.";
      setChrome("Copied.", "");
    }, () => {
      if (generation !== stageGeneration) {
        return;
      }
      idleStatus = "Copy did not work.";
      setChrome("Copy did not work.", "");
    });
  }, 80);
});

function selectState() {
  return {
    tool: selectTool,
    count: 0,
    status: selectStatus
  };
}

function idleState() {
  return {
    tool: "",
    count: 0,
    status: idleStatus
  };
}

function setChrome(text, badge) {
  const title = text ? "Mark and Copy. " + text : "Mark and Copy";
  browser.action.setTitle({ title: title });
  browser.action.setBadgeText({ text: badge || "" });
  browser.action.setBadgeBackgroundColor({ color: "#1a1a1a" });
  if (browser.action.setBadgeTextColor) {
    browser.action.setBadgeTextColor({ color: "#ffffff" });
  }
}

function markerTabId() {
  if (markerWindowId === null) {
    return Promise.resolve(null);
  }
  return browser.windows.get(markerWindowId, { populate: true }).then((win) => {
    const tab = win.tabs && win.tabs[0];
    if (!tab) {
      markerWindowId = null;
      return null;
    }
    return tab.id;
  }, () => {
    markerWindowId = null;
    return null;
  });
}

function route(message) {
  return markerTabId().then((tabId) => {
    if (tabId === null) {
      return idleState();
    }
    return browser.tabs.sendMessage(tabId, message);
  });
}

function copyPng(dataUrl) {
  return fetch(dataUrl).then((response) => response.blob()).then((blob) => {
    return navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob })
    ]);
  });
}

function beginSelect(tool) {
  selecting = true;
  selectTool = tool;
  selectStatus = "Click one corner.";
  idleStatus = "Click a tool.";
  stageGeneration += 1;
  stagedUrl = null;
  alreadyCopied = false;
  setChrome(selectStatus, "");
  selectPng((text) => {
    selectStatus = text;
    setChrome(text, "");
  }).then((png) => {
    const dataUrl = "data:image/png;base64," + png;
    stagedUrl = dataUrl;
    return browser.storage.session.set({
      "mark-and-copy-picture": dataUrl,
      "mark-and-copy-tool": tool
    }).then(() => browser.windows.create({
      url: browser.runtime.getURL("marker.html"),
      type: "popup",
      width: 640,
      height: 480,
      focused: true
    }));
  }).then((created) => {
    markerWindowId = created.id;
    window.setTimeout(() => {
      selecting = false;
    }, 8000);
  }).catch((error) => {
    const reason = String(error);
    if (reason.indexOf("cancel") !== -1) {
      idleStatus = "Click a tool.";
      setChrome("", "");
    } else {
      idleStatus = "The picture did not copy.";
      setChrome(idleStatus, "");
    }
    selecting = false;
  });
}

function selectPng(onStatus) {
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
    }, 600000);
    port.onMessage.addListener((msg) => {
      if (msg && msg.event === "status" && typeof msg.text === "string") {
        onStatus(msg.text);
        return;
      }
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
    port.postMessage({ cmd: "select" });
  });
}
