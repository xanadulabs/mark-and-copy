(function () {
  const HIGHLIGHT = [204, 255, 51];
  // A highlight box is not a click target, so it does not use the 44 pixel rule.
  // One line of text is about 20 pixels tall. This only stops a double click on one spot.
  const MIN_BOX = 4;
  const math = globalThis.MarkAndCopyMath;
  const statusNode = document.querySelector("#status");
  const view = document.querySelector("#view");
  const band = document.querySelector("#band");
  const corner = document.querySelector("#corner");
  const viewCtx = view.getContext("2d");

  let toolName = "highlighter";
  let status = "Click the picture.";
  let baseData = null;
  let highlight = null;
  let bingo = null;
  let marks = [];
  let scoreMark = null;
  let hlPoint = null;
  let firstClient = null;
  let imageWidth = 0;
  let imageHeight = 0;
  let ready = false;

  function pngCursor(width, height, hotX, hotY, draw) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext("2d"));
    return "url(\"" + canvas.toDataURL("image/png") + "\") " + hotX + " " + hotY + ", crosshair";
  }

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

  function badgeText() {
    if (toolName === "bingo" || toolName === "score") {
      return String(marks.length);
    }
    return "";
  }

  function setStatus(text) {
    status = text;
    statusNode.textContent = text;
    document.title = "Mark and Copy. " + text;
    view.setAttribute("aria-label", text);
    browser.runtime.sendMessage({
      type: "status",
      text: text,
      badge: badgeText()
    }).catch(() => {});
  }

  function state() {
    return {
      tool: toolName,
      count: marks.length,
      status: status
    };
  }

  function applyCursor() {
    let cursor = bingoCursor(marks.length);
    if (toolName === "highlighter") {
      cursor = highlighterCursor;
    } else if (toolName === "score") {
      cursor = scoreCursor(marks.length);
    }
    view.style.cursor = cursor;
    document.body.style.cursor = cursor;
  }

  function recompose() {
    const imageData = viewCtx.createImageData(imageWidth, imageHeight);
    const pixels = imageData.data;
    const source = baseData.data;
    const hr = HIGHLIGHT[0] / 255;
    const hg = HIGHLIGHT[1] / 255;
    const hb = HIGHLIGHT[2] / 255;
    for (let i = 0, p = 0; i < pixels.length; i += 4, p += 1) {
      let red = source[i];
      let green = source[i + 1];
      let blue = source[i + 2];
      if (highlight[p] || bingo[p]) {
        red *= hr;
        green *= hg;
        blue *= hb;
      }
      pixels[i] = red;
      pixels[i + 1] = green;
      pixels[i + 2] = blue;
      pixels[i + 3] = source[i + 3];
    }
    viewCtx.putImageData(imageData, 0, 0);
    if (scoreMark) {
      const label = "Score " + marks.length;
      const fontPx = 18;
      viewCtx.font = "600 " + fontPx + "px system-ui, sans-serif";
      const pad = 8;
      const textWidth = viewCtx.measureText(label).width;
      const boxW = textWidth + pad * 2;
      const boxH = fontPx + pad * 2;
      const x = Math.round(scoreMark.x - boxW / 2);
      const y = Math.round(scoreMark.y - boxH / 2);
      viewCtx.fillStyle = "#ffffff";
      viewCtx.strokeStyle = "#1a1a1a";
      viewCtx.lineWidth = 2;
      viewCtx.fillRect(x, y, boxW, boxH);
      viewCtx.strokeRect(x, y, boxW, boxH);
      viewCtx.fillStyle = "#1a1a1a";
      viewCtx.textAlign = "left";
      viewCtx.textBaseline = "middle";
      viewCtx.fillText(label, x + pad, y + boxH / 2);
    }
    stagePicture();
  }

  function stagePicture() {
    if (!ready) {
      return Promise.resolve();
    }
    return browser.runtime.sendMessage({
      type: "stage",
      dataUrl: view.toDataURL("image/png")
    }).catch(() => {});
  }

  function finishCopy() {
    if (!ready) {
      return Promise.resolve(true);
    }
    return copyPicture().then(() => {
      return browser.runtime.sendMessage({ type: "copied" }).catch(() => {});
    }).then(() => true, () => {
      setStatus("Copy did not work. Press Esc.");
      return false;
    });
  }

  function paintBingo(x, y) {
    const radius = 22;
    const x0 = Math.max(0, Math.floor(x - radius));
    const y0 = Math.max(0, Math.floor(y - radius));
    const x1 = Math.min(imageWidth, Math.ceil(x + radius));
    const y1 = Math.min(imageHeight, Math.ceil(y + radius));
    const r2 = radius * radius;
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

  function placeBand(x1, y1, x2, y2) {
    const body = document.body.getBoundingClientRect();
    const left = Math.min(x1, x2) - body.left;
    const top = Math.min(y1, y2) - body.top;
    band.hidden = false;
    band.style.left = left + "px";
    band.style.top = top + "px";
    band.style.width = Math.abs(x2 - x1) + "px";
    band.style.height = Math.abs(y2 - y1) + "px";
  }

  function clearBand() {
    firstClient = null;
    hlPoint = null;
    band.hidden = true;
    corner.hidden = true;
  }

  function useTool(tool) {
    toolName = tool === "bingo" || tool === "score" ? tool : "highlighter";
    clearBand();
    applyCursor();
    if (toolName === "highlighter") {
      setStatus("Click one corner of the box. Cover a highlight to take it off.");
    } else if (toolName === "score") {
      setStatus("Click the picture to place the score.");
    } else {
      setStatus("Click the picture.");
    }
  }

  view.addEventListener("pointermove", (event) => {
    if (toolName !== "highlighter" || !firstClient) {
      return;
    }
    placeBand(firstClient.x, firstClient.y, event.clientX, event.clientY);
  });

  view.addEventListener("click", (event) => {
    if (!ready || event.button !== 0) {
      return;
    }
    event.preventDefault();
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
      useTool("bingo");
      return;
    }
    if (!firstClient) {
      firstClient = { x: event.clientX, y: event.clientY };
      hlPoint = point;
      const body = document.body.getBoundingClientRect();
      corner.hidden = false;
      corner.style.left = (event.clientX - body.left) + "px";
      corner.style.top = (event.clientY - body.top) + "px";
      setStatus("Click the other corner of the box. Cover a highlight to take it off.");
      return;
    }
    const cssW = Math.abs(event.clientX - firstClient.x);
    const cssH = Math.abs(event.clientY - firstClient.y);
    if (cssW < MIN_BOX || cssH < MIN_BOX) {
      setStatus("Click a corner farther away.");
      return;
    }
    const rect = math.pixelRect(hlPoint.x, hlPoint.y, point.x, point.y);
    clearBand();
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
    setStatus("Click one corner of the box. Cover a highlight to take it off.");
  });

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
            browser.runtime.sendMessage({ type: "writeClipboard", dataUrl: reader.result }).then((response) => {
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
      if (ready) {
        useTool(message.tool === "bingo" ? "bingo" : "highlighter");
      }
      sendResponse(state());
      return false;
    }
    if (message.type === "score") {
      if (ready && marks.length > 0) {
        useTool("score");
      }
      sendResponse(state());
      return false;
    }
    return false;
  });

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    event.preventDefault();
    finishCopy().then((copied) => {
      if (copied) {
        window.close();
      }
    });
  });

  window.addEventListener("beforeunload", () => {
    if (!ready) {
      return;
    }
    browser.runtime.sendMessage({
      type: "stage",
      dataUrl: view.toDataURL("image/png")
    });
  });

  window.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  function layout() {
    if (!(imageWidth > 0) || !(imageHeight > 0)) {
      return;
    }
    const roomW = Math.max(1, window.innerWidth);
    const roomH = Math.max(1, window.innerHeight);
    const scale = Math.min(roomW / imageWidth, roomH / imageHeight);
    const width = Math.max(1, Math.floor(imageWidth * scale));
    const height = Math.max(1, Math.floor(imageHeight * scale));
    view.style.width = width + "px";
    view.style.height = height + "px";
    view.style.left = Math.floor((roomW - width) / 2) + "px";
    view.style.top = Math.floor((roomH - height) / 2) + "px";
    if (firstClient) {
      // The first corner moved with the picture. Start the box again.
      useTool(toolName);
    }
  }

  function fitWindow() {
    // windows.update sets the outer size. Add the title bar and borders so the
    // picture itself gets its own size.
    const frameW = Math.max(0, window.outerWidth - window.innerWidth);
    const frameH = Math.max(0, window.outerHeight - window.innerHeight);
    const roomW = Math.max(44, screen.availWidth - frameW);
    const roomH = Math.max(44, screen.availHeight - frameH);
    const scale = Math.min(1, roomW / imageWidth, roomH / imageHeight);
    const outerW = Math.round(imageWidth * scale) + frameW;
    const outerH = Math.round(imageHeight * scale) + frameH;
    browser.windows.getCurrent().then((win) => {
      return browser.windows.update(win.id, { width: outerW, height: outerH, focused: true });
    }).catch(() => {});
  }

  window.addEventListener("resize", layout);

  function openPicture(dataUrl, tool) {
    const image = new Image();
    image.onload = () => {
      imageWidth = image.width;
      imageHeight = image.height;
      if (!(imageWidth > 0) || !(imageHeight > 0)) {
        setStatus("The picture did not copy.");
        return;
      }
      view.width = imageWidth;
      view.height = imageHeight;
      viewCtx.drawImage(image, 0, 0);
      baseData = viewCtx.getImageData(0, 0, imageWidth, imageHeight);
      highlight = new Uint8Array(imageWidth * imageHeight);
      bingo = new Uint8Array(imageWidth * imageHeight);
      ready = true;
      layout();
      stagePicture();
      fitWindow();
      useTool(tool === "bingo" ? "bingo" : "highlighter");
      browser.runtime.sendMessage({ type: "ready" }).catch(() => {});
    };
    image.onerror = () => {
      setStatus("The picture did not copy.");
      browser.runtime.sendMessage({ type: "ready" }).catch(() => {});
    };
    image.src = dataUrl;
  }

  browser.storage.session.get([
    "mark-and-copy-picture",
    "mark-and-copy-tool"
  ]).then((stored) => {
    const picture = stored["mark-and-copy-picture"];
    if (typeof picture !== "string" || picture.indexOf("data:image/png") !== 0) {
      setStatus("The picture did not copy.");
      browser.runtime.sendMessage({ type: "ready" }).catch(() => {});
      return;
    }
    openPicture(picture, stored["mark-and-copy-tool"]);
  }).catch(() => {
    setStatus("The picture did not copy.");
    browser.runtime.sendMessage({ type: "ready" }).catch(() => {});
  });
})();
