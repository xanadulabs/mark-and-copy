(function () {
  if (globalThis.__markAndCopyInstalled) {
    return;
  }
  globalThis.__markAndCopyInstalled = true;

  const math = globalThis.MarkAndCopyMath;
  // Yellow-green, orange, and light blue paper tint. Multiply leaves dark text dark.
  const HIGHLIGHT = [204, 255, 51];
  const MIN_SELECT = 44;

  const host = document.createElement("div");
  host.setAttribute("data-mark-and-copy", "");
  host.setAttribute("popover", "manual");
  host.style.cssText = [
    "position:fixed",
    "max-width:none",
    "max-height:none",
    "margin:0",
    "padding:0",
    "border:0",
    "background:transparent",
    "overflow:visible",
    "pointer-events:none"
  ].join(";");

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = [
    ".shield { position: absolute; inset: 0; background: transparent; pointer-events: none; }",
    ".shield.on { pointer-events: auto; }",
    ".band { position: fixed; pointer-events: none; overflow: visible; }",
    ".band rect { fill: none; }",
    ".ink { stroke: #1a1a1a; stroke-width: 5; }",
    ".paper { stroke: #ffffff; stroke-width: 3; }",
    ".core { stroke: #005fcc; stroke-width: 2; stroke-dasharray: 8 6; filter: drop-shadow(0 0 4px #005fcc); animation: march 0.6s linear infinite; }",
    "@keyframes march { to { stroke-dashoffset: -28; } }",
    ".corner { position: fixed; width: 16px; height: 16px; margin: -8px 0 0 -8px; pointer-events: none; border: 2px solid #005fcc; box-shadow: 0 0 0 1px #ffffff, 0 0 0 3px #1a1a1a, 0 0 6px #005fcc; background: transparent; }",
    ".frame { position: fixed; pointer-events: auto; outline: 2px solid #1a1a1a; box-shadow: 0 0 0 1px #ffffff; }",
    "canvas { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }",
    ".hl { position: absolute; pointer-events: none; border: 2px solid #5a7a10; box-shadow: 0 0 0 1px #ffffff; background: transparent; }",
    ".hl-corner { position: absolute; width: 16px; height: 16px; margin: -8px 0 0 -8px; pointer-events: none; border: 2px solid #5a7a10; box-shadow: 0 0 0 1px #ffffff; background: transparent; }",
    "@media (forced-colors: active) {",
    "  .core, .corner { stroke: Highlight; border-color: Highlight; box-shadow: none; filter: none; }",
    "}"
  ].join("\n");

  const shield = document.createElement("div");
  shield.className = "shield";
  const band = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  band.setAttribute("class", "band");
  band.setAttribute("aria-hidden", "true");
  band.hidden = true;
  ["ink", "paper", "core"].forEach((name) => {
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("class", name);
    rect.setAttribute("width", "100%");
    rect.setAttribute("height", "100%");
    band.appendChild(rect);
  });
  const corner = document.createElement("div");
  corner.className = "corner";
  corner.hidden = true;

  const frame = document.createElement("div");
  frame.className = "frame";
  frame.hidden = true;
  const view = document.createElement("canvas");
  const hl = document.createElement("div");
  hl.className = "hl";
  hl.hidden = true;
  const hlCorner = document.createElement("div");
  hlCorner.className = "hl-corner";
  hlCorner.hidden = true;
  frame.append(view, hl, hlCorner);
  shadow.append(style, shield, band, corner, frame);

  const viewCtx = view.getContext("2d");

  let phase = "idle";
  let toolName = "";

  let status = "Click a tool.";
  let first = null;
  let selection = null;
  let baseData = null;
  let highlight = null;
  let bingo = null;
  let marks = [];
  let scoreMark = null;
  let hlPoint = null;
  let imageWidth = 0;
  let imageHeight = 0;
  let markScale = 1;
  let minMark = 8;
  let bingoRadius = 22;
  let viewWidth = 0;
  let viewHeight = 0;
  let cursorTimer = 0;
  let cursorFrame = 0;

  const marqueeCursors = [0, 6].map((offset) => pngCursor(32, 32, 4, 4, (ctx) => {
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 5;
    ctx.strokeRect(4.5, 4.5, 22, 22);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.strokeRect(4.5, 4.5, 22, 22);
    ctx.shadowColor = "#005fcc";
    ctx.shadowBlur = 4;
    ctx.strokeStyle = "#005fcc";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.lineDashOffset = offset;
    ctx.strokeRect(4.5, 4.5, 22, 22);
  }));

  const highlighterCursor = pngCursor(32, 32, 6, 26, (ctx) => {
    ctx.translate(16, 16);
    ctx.rotate(-0.7);
    ctx.fillStyle = "#ccff33";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.fillRect(-5, -12, 10, 22);
    ctx.strokeRect(-5, -12, 10, 22);
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(-5, 8, 10, 4);
  });

  function pngCursor(width, height, hotX, hotY, draw) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext("2d"));
    return "url(\"" + canvas.toDataURL("image/png") + "\") " + hotX + " " + hotY + ", crosshair";
  }

  function bingoCss() {
    return "rgb(" + HIGHLIGHT[0] + "," + HIGHLIGHT[1] + "," + HIGHLIGHT[2] + ")";
  }

  function bingoCursor(count) {
    const label = String(count);
    const measure = document.createElement("canvas").getContext("2d");
    measure.font = "700 16px system-ui, sans-serif";
    const plateW = Math.max(32, Math.ceil(measure.measureText(label).width + 16));
    const cx = plateW + 22;
    return pngCursor(cx + 18, 40, cx, 20, (ctx) => {
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 2;
      ctx.fillRect(1, 8, plateW - 2, 24);
      ctx.strokeRect(1, 8, plateW - 2, 24);
      ctx.fillStyle = "#1a1a1a";
      ctx.font = "700 16px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, plateW / 2, 20);
      ctx.beginPath();
      ctx.arc(cx, 20, 12, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, 20, 12, 0, Math.PI * 2);
      ctx.strokeStyle = bingoCss();
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, 20, 14, 0, Math.PI * 2);
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }

  function scoreCursor(count) {
    const label = "Score " + count;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.font = "700 16px system-ui, sans-serif";
    const width = Math.ceil(ctx.measureText(label).width + 16);
    canvas.width = width;
    canvas.height = 32;
    ctx.font = "700 16px system-ui, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.fillRect(1, 1, width - 2, 30);
    ctx.strokeRect(1, 1, width - 2, 30);
    ctx.fillStyle = "#1a1a1a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, width / 2, 16);
    return "url(\"" + canvas.toDataURL("image/png") + "\") " + Math.round(width / 2) + " 16, crosshair";
  }

  function state() {
    return {
      phase: phase,
      tool: toolName,
      count: marks.length,
      hasSelection: phase === "mark",
      status: status
    };
  }

  function badgeText() {
    if (phase === "mark" && (toolName === "bingo" || toolName === "score")) {
      return String(marks.length);
    }
    return "";
  }

  function setStatus(text) {
    status = text;
    host.title = phase === "idle" ? "" : text;
    shield.title = phase === "marquee" ? text : "";
    frame.title = phase === "mark" ? text : "";
    browser.runtime.sendMessage({
      type: "status",
      text: text,
      badge: badgeText()
    }).catch(() => {});
  }

  function applyCursor() {
    window.clearInterval(cursorTimer);
    cursorTimer = 0;
    if (phase === "marquee") {
      shield.style.cursor = marqueeCursors[0];
      host.style.cursor = marqueeCursors[0];
      cursorTimer = window.setInterval(() => {
        cursorFrame = (cursorFrame + 1) % marqueeCursors.length;
        shield.style.cursor = marqueeCursors[cursorFrame];
        host.style.cursor = marqueeCursors[cursorFrame];
      }, 180);
      return;
    }
    if (phase !== "mark") {
      return;
    }
    let cursor = bingoCursor(marks.length);
    if (toolName === "highlighter") {
      cursor = highlighterCursor;
    } else if (toolName === "score") {
      cursor = scoreCursor(marks.length);
    }
    frame.style.cursor = cursor;
    host.style.cursor = cursor;
  }

  function layoutFull() {
    host.style.left = "0px";
    host.style.top = "0px";
    host.style.right = "0px";
    host.style.bottom = "0px";
    host.style.width = "auto";
    host.style.height = "auto";
    host.style.margin = "0px";
    host.style.pointerEvents = "auto";
  }

  function layoutPicture(sel) {
    host.style.left = sel.left + "px";
    host.style.top = sel.top + "px";
    host.style.right = "auto";
    host.style.bottom = "auto";
    host.style.width = sel.width + "px";
    host.style.height = sel.height + "px";
    host.style.margin = "0px";
    host.style.pointerEvents = "auto";
  }

  function showHost(captureClicks) {
    if (!host.isConnected) {
      (document.body || document.documentElement).appendChild(host);
    }
    if (captureClicks) {
      layoutFull();
      shield.hidden = false;
    }
    shield.classList.toggle("on", captureClicks);
    try {
      if (!host.matches(":popover-open")) {
        host.showPopover();
      }
    } catch (error) {
      // The fixed layer is already in the page.
    }
  }

  function conceal() {
    host.style.visibility = "hidden";
    try {
      host.hidePopover();
    } catch (error) {
      // The popover is already closed.
    }
  }

  function reveal() {
    host.style.visibility = "";
    try {
      if (!host.matches(":popover-open")) {
        host.showPopover();
      }
    } catch (error) {
      // Popover is unavailable.
    }
  }

  function shutdown() {
    window.clearInterval(cursorTimer);
    cursorTimer = 0;
    phase = "idle";
    toolName = "";
    first = null;
    selection = null;
    baseData = null;
    highlight = null;
    bingo = null;
    marks = [];
    scoreMark = null;
    hlPoint = null;
    band.hidden = true;
    corner.hidden = true;
    frame.hidden = true;
    hl.hidden = true;
    hlCorner.hidden = true;
    shield.classList.remove("on");
    try {
      host.hidePopover();
    } catch (error) {
      // Already closed.
    }
    host.remove();
    setStatus("Click a tool.");
  }

  function beginMarquee() {
    phase = "marquee";
    first = null;
    selection = null;
    baseData = null;
    highlight = null;
    bingo = null;
    marks = [];
    scoreMark = null;
    hlPoint = null;
    frame.hidden = true;
    band.hidden = true;
    corner.hidden = true;
    showHost(true);
    applyCursor();
    setStatus("Click one corner.");
  }

  function placeBand(x1, y1, x2, y2) {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    band.hidden = false;
    band.style.left = left + "px";
    band.style.top = top + "px";
    band.style.width = Math.abs(x2 - x1) + "px";
    band.style.height = Math.abs(y2 - y1) + "px";
  }

  shield.addEventListener("pointermove", (event) => {
    if (phase !== "marquee" || !first) {
      return;
    }
    placeBand(first.x, first.y, event.clientX, event.clientY);
  });

  shield.addEventListener("click", (event) => {
    if (phase !== "marquee" || event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (!first) {
      first = { x: event.clientX, y: event.clientY };
      corner.hidden = false;
      corner.style.left = first.x + "px";
      corner.style.top = first.y + "px";
      setStatus("Click the other corner.");
      return;
    }
    const width = Math.abs(event.clientX - first.x);
    const height = Math.abs(event.clientY - first.y);
    if (width < MIN_SELECT || height < MIN_SELECT) {
      setStatus("Click a corner farther away.");
      return;
    }
    selection = {
      left: Math.min(first.x, event.clientX),
      top: Math.min(first.y, event.clientY),
      width: width,
      height: height
    };
    viewWidth = window.innerWidth;
    viewHeight = window.innerHeight;
    phase = "capture";
    band.hidden = true;
    corner.hidden = true;
    window.clearInterval(cursorTimer);
    conceal();
    capture(selection);
  });

  function onScroll() {
    if (phase !== "marquee") {
      return;
    }
    first = null;
    band.hidden = true;
    corner.hidden = true;
    setStatus("The page moved. Click one corner.");
  }

  function onKey(event) {
    if (event.key !== "Escape" || phase === "idle") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    shutdown();
  }

  window.addEventListener("scroll", onScroll, true);
  window.addEventListener("keydown", onKey, true);

  async function capture(sel) {
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    let response;
    try {
      const scale = window.devicePixelRatio || 1;
      const originX = window.mozInnerScreenX;
      const originY = window.mozInnerScreenY;
      if (typeof originX !== "number" || typeof originY !== "number") {
        throw new Error("no screen origin");
      }
      response = await browser.runtime.sendMessage({
        type: "capture",
        x: Math.round((originX + sel.left) * scale),
        y: Math.round((originY + sel.top) * scale),
        width: Math.max(1, Math.round(sel.width * scale)),
        height: Math.max(1, Math.round(sel.height * scale))
      });
    } catch (error) {
      response = { ok: false, error: String(error) };
    }
    if (!response || !response.ok) {
      shutdown();
      setStatus("This page cannot be copied.");
      return;
    }
    try {
      await openPicture(response.dataUrl, sel);
    } catch (error) {
      console.error(error);
      shutdown();
      setStatus("This page cannot be copied.");
    }
  }

  async function openPicture(dataUrl, sel) {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    if (!(image.width > 0) || !(image.height > 0) || !(sel.width > 0) || !(sel.height > 0)) {
      shutdown();
      setStatus("This page cannot be copied.");
      return;
    }
    imageWidth = image.width;
    imageHeight = image.height;
    markScale = ((imageWidth / sel.width) + (imageHeight / sel.height)) / 2;
    bingoRadius = 22 * markScale;
    minMark = Math.max(2, Math.round(8 * markScale));
    const scratch = document.createElement("canvas");
    scratch.width = imageWidth;
    scratch.height = imageHeight;
    const scratchCtx = scratch.getContext("2d");
    scratchCtx.drawImage(image, 0, 0);
    baseData = scratchCtx.getImageData(0, 0, imageWidth, imageHeight);
    highlight = new Uint8Array(imageWidth * imageHeight);
    bingo = new Uint8Array(imageWidth * imageHeight);
    view.width = imageWidth;
    view.height = imageHeight;
    frame.hidden = false;
    frame.style.left = sel.left + "px";
    frame.style.top = sel.top + "px";
    frame.style.width = sel.width + "px";
    frame.style.height = sel.height + "px";
    shield.hidden = true;
    shield.classList.remove("on");
    layoutPicture(sel);
    phase = "mark";
    reveal();
    showHost(false);
    recompose();
    applyCursor();
    if (toolName === "highlighter") {
      setStatus("Click one corner of the box. Cover the mark to take it off.");
    } else {
      setStatus("Click the picture.");
    }
  }

  function recompose() {
    const pixels = new Uint8ClampedArray(baseData.data);
    const hr = HIGHLIGHT[0] / 255;
    const hg = HIGHLIGHT[1] / 255;
    const hb = HIGHLIGHT[2] / 255;
    for (let i = 0, p = 0; i < pixels.length; i += 4, p += 1) {
      if (highlight[p] || bingo[p]) {
        pixels[i] *= hr;
        pixels[i + 1] *= hg;
        pixels[i + 2] *= hb;
      }
    }
    viewCtx.putImageData(new ImageData(pixels, imageWidth, imageHeight), 0, 0);
    if (!scoreMark) {
      return;
    }
    const label = "Score " + marks.length;
    const fontPx = Math.max(18, Math.round(18 * markScale));
    viewCtx.font = "600 " + fontPx + "px system-ui, sans-serif";
    const pad = Math.round(8 * markScale);
    const textWidth = viewCtx.measureText(label).width;
    const boxW = textWidth + pad * 2;
    const boxH = fontPx + pad * 2;
    const x = Math.round(scoreMark.x - boxW / 2);
    const y = Math.round(scoreMark.y - boxH / 2);
    viewCtx.fillStyle = "#ffffff";
    viewCtx.strokeStyle = "#1a1a1a";
    viewCtx.lineWidth = Math.max(2, Math.round(2 * markScale));
    viewCtx.fillRect(x, y, boxW, boxH);
    viewCtx.strokeRect(x, y, boxW, boxH);
    viewCtx.fillStyle = "#1a1a1a";
    viewCtx.textAlign = "left";
    viewCtx.textBaseline = "middle";
    viewCtx.fillText(label, x + pad, y + boxH / 2);
  }

  function paintBingo(x, y) {
    const r = bingoRadius;
    const x0 = Math.max(0, Math.floor(x - r));
    const y0 = Math.max(0, Math.floor(y - r));
    const x1 = Math.min(imageWidth, Math.ceil(x + r));
    const y1 = Math.min(imageHeight, Math.ceil(y + r));
    const r2 = r * r;
    for (let py = y0; py < y1; py += 1) {
      for (let px = x0; px < x1; px += 1) {
        const dx = px + 0.5 - x;
        const dy = py + 0.5 - y;
        if (dx * dx + dy * dy <= r2) {
          bingo[py * imageWidth + px] = 1;
        }
      }
    }
  }

  frame.addEventListener("pointermove", (event) => {
    if (phase !== "mark" || toolName !== "highlighter" || !hlPoint) {
      return;
    }
    const origin = imageToFrame(hlPoint.x, hlPoint.y);
    const local = frameLocal(event.clientX, event.clientY);
    const left = Math.min(origin.x, local.x);
    const top = Math.min(origin.y, local.y);
    hl.hidden = false;
    hl.style.left = left + "px";
    hl.style.top = top + "px";
    hl.style.width = Math.abs(local.x - origin.x) + "px";
    hl.style.height = Math.abs(local.y - origin.y) + "px";
  });

  frame.addEventListener("click", (event) => {
    if (phase !== "mark" || event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const point = math.mapPoint(
      event.clientX,
      event.clientY,
      view.getBoundingClientRect(),
      imageWidth,
      imageHeight
    );
    if (!point) {
      return;
    }
    if (toolName === "bingo") {
      marks.push({ x: point.x, y: point.y });
      paintBingo(point.x, point.y);
      recompose();
      applyCursor();
      setStatus("Click the picture.");
      return;
    }
    if (toolName === "score") {
      scoreMark = { x: point.x, y: point.y };
      recompose();
      toolName = "bingo";
      applyCursor();
      setStatus("Click the picture.");
      return;
    }
    if (toolName !== "highlighter") {
      return;
    }
    if (!hlPoint) {
      hlPoint = point;
      const origin = imageToFrame(point.x, point.y);
      hlCorner.hidden = false;
      hlCorner.style.left = origin.x + "px";
      hlCorner.style.top = origin.y + "px";
      setStatus("Click the other corner of the box. Cover the mark to take it off.");
      return;
    }
    const rect = math.pixelRect(hlPoint.x, hlPoint.y, point.x, point.y);
    hlPoint = null;
    hl.hidden = true;
    hlCorner.hidden = true;
    if (rect.w < minMark || rect.h < minMark) {
      setStatus("Click a corner farther away.");
      return;
    }
    const x0 = Math.max(0, rect.x);
    const y0 = Math.max(0, rect.y);
    const x1 = Math.min(imageWidth, rect.x + rect.w);
    const y1 = Math.min(imageHeight, rect.y + rect.h);
    for (let py = y0; py < y1; py += 1) {
      for (let px = x0; px < x1; px += 1) {
        const index = py * imageWidth + px;
        highlight[index] = highlight[index] ? 0 : 1;
      }
    }
    recompose();
    setStatus("Click one corner of the box. Cover the mark to take it off.");
  });

  function frameLocal(clientX, clientY) {
    const rect = frame.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function imageToFrame(x, y) {
    const rect = view.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    return {
      x: (x / imageWidth) * rect.width + (rect.left - frameRect.left),
      y: (y / imageHeight) * rect.height + (rect.top - frameRect.top)
    };
  }

  function copyPicture() {
    return new Promise((resolve, reject) => {
      view.toBlob((blob) => {
        if (!blob) {
          reject(new Error("no picture"));
          return;
        }
        const item = new ClipboardItem({ "image/png": blob });
        navigator.clipboard.write([item]).then(() => {
          setStatus("Copied.");
          resolve();
        }, () => {
          const reader = new FileReader();
          reader.onload = () => {
            browser.runtime.sendMessage({ type: "copy", dataUrl: reader.result }).then((response) => {
              if (response && response.ok) {
                setStatus("Copied.");
                resolve();
              } else {
                reject(new Error("copy failed"));
              }
            }, reject);
          };
          reader.readAsDataURL(blob);
        });
      }, "image/png");
    });
  }

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== "string") {
      return false;
    }
    if (message.type === "getState") {
      sendResponse(state());
      return false;
    }
    if (message.type === "start") {
      if (phase === "capture") {
        sendResponse(state());
        return false;
      }
      toolName = message.tool === "bingo" ? "bingo" : "highlighter";
      if (phase === "mark") {
        hlPoint = null;
        hl.hidden = true;
        hlCorner.hidden = true;
        applyCursor();
        setStatus(toolName === "highlighter"
          ? "Click one corner of the box. Cover the mark to take it off."
          : "Click the picture.");
      } else {
        beginMarquee();
      }
      sendResponse(state());
      return false;
    }
    if (message.type === "score") {
      if (phase !== "mark") {
        sendResponse(state());
        return false;
      }
      toolName = "score";
      applyCursor();
      setStatus("Click the picture to place the score.");
      sendResponse(state());
      return false;
    }
    if (message.type === "copy") {
      if (phase !== "mark") {
        sendResponse({ ok: false, status: status });
        return false;
      }
      copyPicture().then(
        () => sendResponse({ ok: true, status: "Copied." }),
        () => sendResponse({ ok: false, status: "Copy did not work. Click Copy." })
      );
      return true;
    }
    if (message.type === "close") {
      shutdown();
      sendResponse(state());
      return false;
    }
    return false;
  });
})();
