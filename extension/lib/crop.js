// Classic script so it can be injected before overlay.js.
globalThis.ScreenSelectCrop = {
  toImageRect(rect, viewW, viewH, imgW, imgH) {
    const scaleX = imgW / viewW;
    const scaleY = imgH / viewH;
    const left = Math.max(0, Math.round(rect.x * scaleX));
    const top = Math.max(0, Math.round(rect.y * scaleY));
    const right = Math.min(imgW, Math.round((rect.x + rect.width) * scaleX));
    const bottom = Math.min(imgH, Math.round((rect.y + rect.height) * scaleY));
    return { x: left, y: top, width: right - left, height: bottom - top };
  },

  isUsableDrag(rect) {
    return rect.width >= 8 && rect.height >= 8;
  },

  upscaleFactor(height) {
    return height < 300 ? 2 : 1;
  },
};
