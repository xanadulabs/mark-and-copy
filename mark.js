(function () {
  function pixelRect(x1, y1, x2, y2) {
    const left = Math.floor(Math.min(x1, x2));
    const top = Math.floor(Math.min(y1, y2));
    const right = Math.ceil(Math.max(x1, x2));
    const bottom = Math.ceil(Math.max(y1, y2));
    return { x: left, y: top, w: right - left, h: bottom - top };
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
    pixelRect: pixelRect,
    mapPoint: mapPoint
  };
})();
