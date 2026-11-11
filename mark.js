(function () {
  function cropSourceRect(imageWidth, imageHeight, viewWidth, viewHeight, sel) {
    if (!(imageWidth > 0) || !(imageHeight > 0) || !(viewWidth > 0) || !(viewHeight > 0)) {
      return null;
    }
    const scaleX = imageWidth / viewWidth;
    const scaleY = imageHeight / viewHeight;
    let sx = Math.round(sel.left * scaleX);
    let sy = Math.round(sel.top * scaleY);
    let sw = Math.round(sel.width * scaleX);
    let sh = Math.round(sel.height * scaleY);
    if (sx < 0) {
      sw += sx;
      sx = 0;
    }
    if (sy < 0) {
      sh += sy;
      sy = 0;
    }
    if (sx + sw > imageWidth) {
      sw = imageWidth - sx;
    }
    if (sy + sh > imageHeight) {
      sh = imageHeight - sy;
    }
    if (sw < 1 || sh < 1) {
      return null;
    }
    return { sx: sx, sy: sy, sw: sw, sh: sh, scaleX: scaleX, scaleY: scaleY };
  }

  function pixelRect(x1, y1, x2, y2) {
    const left = Math.floor(Math.min(x1, x2));
    const top = Math.floor(Math.min(y1, y2));
    const right = Math.ceil(Math.max(x1, x2));
    const bottom = Math.ceil(Math.max(y1, y2));
    return { x: left, y: top, w: right - left, h: bottom - top };
  }

  function toggleHighlightRect(data, width, height, x, y, w, h, rgba) {
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(width, x + w);
    const y1 = Math.min(height, y + h);
    for (let py = y0; py < y1; py += 1) {
      for (let px = x0; px < x1; px += 1) {
        const i = (py * width + px) * 4;
        if (data[i + 3] > 0) {
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
          data[i + 3] = 0;
        } else {
          data[i] = rgba[0];
          data[i + 1] = rgba[1];
          data[i + 2] = rgba[2];
          data[i + 3] = rgba[3];
        }
      }
    }
  }

  function mapPoint(clientX, clientY, rect, imageWidth, imageHeight) {
    if (!(rect.width > 0) || !(rect.height > 0)) {
      return null;
    }
    const x = ((clientX - rect.left) / rect.width) * imageWidth;
    const y = ((clientY - rect.top) / rect.height) * imageHeight;
    if (x < 0 || y < 0 || x >= imageWidth || y >= imageHeight) {
      return null;
    }
    return { x: x, y: y };
  }

  globalThis.MarkAndCopyMath = {
    cropSourceRect: cropSourceRect,
    pixelRect: pixelRect,
    toggleHighlightRect: toggleHighlightRect,
    mapPoint: mapPoint
  };
})();
