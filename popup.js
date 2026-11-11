const statusNode = document.querySelector("#status");
const highlighterButton = document.querySelector("#highlighter");
const bingoButton = document.querySelector("#bingo");
const scoreButton = document.querySelector("#score");

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
  scoreButton.hidden = !(bingo && state.count > 0);
}

function send(message) {
  return browser.runtime.sendMessage(message);
}

async function refresh() {
  try {
    const state = await send({ type: "getState" });
    toolButtons(state);
    setStatus((state && state.status) || "Click a tool.");
  } catch (error) {
    toolButtons(null);
    setStatus("Click a tool.");
  }
}

highlighterButton.addEventListener("click", async () => {
  try {
    await send({ type: "start", tool: "highlighter" });
    window.close();
  } catch (error) {
    setStatus("The picture did not copy.");
  }
});

bingoButton.addEventListener("click", async () => {
  try {
    await send({ type: "start", tool: "bingo" });
    window.close();
  } catch (error) {
    setStatus("The picture did not copy.");
  }
});

scoreButton.addEventListener("click", async () => {
  try {
    await send({ type: "score" });
    window.close();
  } catch (error) {
    setStatus("Click the picture to place the score.");
  }
});

refresh();
