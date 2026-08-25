/* ===== 落叶飘动特效 =====
   独立于业务逻辑：生成一个固定定位的落叶层，
   定时飘落 🍂 / 🍁，动画结束后自动移除并循环补充。 */
(function () {
  // 尊重系统的“减少动态效果”设置
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var layer = document.createElement('div');
  layer.className = 'leaves-layer';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);

  var LEAVES = ['🍂', '🍁'];
  var MAX_LEAVES = 14;

  function spawnLeaf() {
    if (document.hidden) return;
    var leaf = document.createElement('span');
    leaf.className = 'leaf';
    leaf.textContent = LEAVES[Math.floor(Math.random() * LEAVES.length)];
    leaf.style.left = (Math.random() * 100).toFixed(2) + 'vw';
    leaf.style.fontSize = (14 + Math.random() * 16).toFixed(0) + 'px';
    leaf.style.opacity = (0.55 + Math.random() * 0.35).toFixed(2);
    leaf.style.setProperty('--drift', ((Math.random() * 2 - 1) * 120).toFixed(0) + 'px');
    leaf.style.setProperty('--spin', (Math.random() * 720 - 360).toFixed(0) + 'deg');
    leaf.style.animationDuration = (9 + Math.random() * 8).toFixed(2) + 's';
    leaf.addEventListener('animationend', function () { leaf.remove(); });
    layer.appendChild(leaf);
  }

  // 开场先错落飘几片，之后按固定节奏补充
  for (var i = 0; i < 6; i++) {
    setTimeout(spawnLeaf, i * 900);
  }
  setInterval(function () {
    if (layer.childElementCount < MAX_LEAVES) spawnLeaf();
  }, 1600);
})();
