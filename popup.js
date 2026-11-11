const statusNode = document.querySelector("#status");
const highlighterButton = document.querySelector("#highlighter");
const bingoButton = document.querySelector("#bingo");
const scoreButton = document.querySelector("#score");
const copyButton = document.querySelector("#copy");
const closeButton = document.querySelector("#close");

function setStatus(text) {
  statusNode.textContent = text;
}

function toolButtons(state) {
  const highlighter = state && state.tool === "highlighter";
  const bingo = state && (state.tool === "bingo" || state.tool === "score");
  highlighterButton.setAttribute("aria-pressed", highlighter ? "true" : "false");
  bingoButton.setAttribute("aria-pressed", bingo ? "true" : "false");
  highlighterButton.textContent = highlighter ? "Highlighter. On." : "Highlighter";
  bingoButton.textContent = bingo ? "Bingo. On." : "Bingo";
  const ready = !!(state && state.hasSelection);
  const scored = !!(state && state.count > 0);
  copyButton.hidden = !ready;
  scoreButton.hidden = !scored;
}

async function currentTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function send(message) {
  const tab = await currentTab();
  if (!tab || tab.id === undefined) {
    throw new Error("no tab");
  }
  await browser.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["mark.js", "content.js"]
  });
  return browser.tabs.sendMessage(tab.id, message);
}

function showFailure() {
  setStatus("This page cannot be used.");
  toolButtons(null);
}

async function refresh() {
  try {
    const state = await send({ type: "getState" });
    toolButtons(state);
    setStatus((state && state.status) || "Click a tool.");
  } catch (error) {
    showFailure();
  }
}

highlighterButton.addEventListener("click", async () => {
  try {
    await send({ type: "start", tool: "highlighter" });
    window.close();
  } catch (error) {
    showFailure();
  }
});

bingoButton.addEventListener("click", async () => {
  try {
    await send({ type: "start", tool: "bingo" });
    window.close();
  } catch (error) {
    showFailure();
  }
});

scoreButton.addEventListener("click", async () => {
  try {
    await send({ type: "score" });
    window.close();
  } catch (error) {
    showFailure();
  }
});

copyButton.addEventListener("click", async () => {
  try {
    const result = await send({ type: "copy" });
    if (result && result.ok) {
      setStatus("Copied.");
    } else {
      setStatus("Copy did not work. Click Copy.");
    }
  } catch (error) {
    setStatus("Copy did not work. Click Copy.");
  }
});

closeButton.addEventListener("click", async () => {
  try {
    await send({ type: "close" });
  } catch (error) {
    // The page tool is already gone.
  }
  window.close();
});

refresh();
