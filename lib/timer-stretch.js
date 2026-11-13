(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FDVTimerStretch = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";
  var MAX_SCALE = 2;
  function percent(value) {
    if (value === null || typeof value === "undefined" || String(value).replace(/\s/g, "") === "") return MAX_SCALE * 100;
    var number = Number(value);
    return isFinite(number) ? Math.round(number) : MAX_SCALE * 100;
  }
  function property(style) {
    var names = ["transform", "webkitTransform", "msTransform", "MozTransform", "OTransform"];
    for (var i = 0; i < names.length; i += 1) if (style && names[i] in style) return names[i];
    return "";
  }
  function scale(height, availableHeight, maxPercent) {
    return height > 0 && isFinite(height) && isFinite(availableHeight)
      ? Math.max(1, Math.min(percent(maxPercent) / 100, availableHeight / height)) : 1;
  }
  return { maxScale: MAX_SCALE, percent: percent, property: property, scale: scale };
});
