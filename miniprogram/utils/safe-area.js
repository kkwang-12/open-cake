function measure(platform = wx) {
  const fallback = { topInset: 24, navHeight: 44, capsuleWidth: 104 };
  try {
    const info = platform.getWindowInfo ? platform.getWindowInfo() : platform.getSystemInfoSync();
    const capsule = platform.getMenuButtonBoundingClientRect();
    const topInset = Number.isFinite(info.statusBarHeight) ? info.statusBarHeight : 24;
    if (!capsule || !capsule.height || capsule.top < topInset) return { ...fallback, topInset };
    return {
      topInset,
      navHeight: Math.max(44, (capsule.top - topInset) * 2 + capsule.height),
      capsuleWidth: Math.max(104, info.windowWidth - capsule.left + 12)
    };
  } catch (_) { return fallback; }
}
module.exports = { measure };
