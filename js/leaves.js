/* 落叶氛围特效：随机生成若干叶子，循环飘落 + 左右摇摆 */

(function () {
  'use strict';

  /* 系统开启「减少动态效果」时不生成 */
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var LEAF_CHARS = ['🍂', '🍁'];
  var COUNT = 12;

  for (var i = 0; i < COUNT; i++) {
    var leaf = document.createElement('div');
    leaf.className = 'leaf';
    leaf.setAttribute('aria-hidden', 'true');

    var inner = document.createElement('span');
    inner.textContent = LEAF_CHARS[Math.floor(Math.random() * LEAF_CHARS.length)];
    leaf.appendChild(inner);

    var fallDur = 10 + Math.random() * 9;    // 下落一圈 10–19s
    var swayDur = 2.2 + Math.random() * 2;   // 摇摆周期 2.2–4.2s

    leaf.style.left = (Math.random() * 100).toFixed(2) + 'vw';
    leaf.style.fontSize = (14 + Math.random() * 14).toFixed(0) + 'px';
    leaf.style.opacity = (0.45 + Math.random() * 0.35).toFixed(2);
    leaf.style.animationDuration = fallDur.toFixed(1) + 's';
    /* 负延迟让首屏叶子就散布在不同高度，而不是同时从顶部出现 */
    leaf.style.animationDelay = (-Math.random() * fallDur).toFixed(1) + 's';
    inner.style.animationDuration = swayDur.toFixed(1) + 's';
    inner.style.animationDelay = (-Math.random() * swayDur).toFixed(1) + 's';

    document.body.appendChild(leaf);
  }
})();
