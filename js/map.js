/* 3D 中国足迹地图（echarts-gl map3D）
 * 暴露 window.TravelMap.render(trips, onOpenTrip)
 * - trips 里按目的地聚合，在地图上打标记
 * - 点击标记回调 onOpenTrip(tripId)，打开该城市最近一次旅行的详情
 */
window.TravelMap = (function () {
  'use strict';

  var chart = null;
  var inited = false;
  var labelData = [];  /* 城市标签数据 */
  var labelEls = [];   /* 城市标签 DOM */
  var onOpen = null;   /* 点击标签/标记的回调 */

  /* 目的地名称 → 坐标：先精确匹配，再去掉「市/县/区」等后缀，最后做包含匹配 */
  function findCoord(dest) {
    if (!dest) return null;
    var d = String(dest).trim();
    if (CITY_COORDS[d]) return CITY_COORDS[d];
    var short = d.replace(/(省|市|地区|盟|自治州|州|县|区)$/g, '');
    if (CITY_COORDS[short]) return CITY_COORDS[short];
    if (short.length >= 2) {
      for (var k in CITY_COORDS) {
        if (d.indexOf(k) !== -1 || k.indexOf(short) !== -1) return CITY_COORDS[k];
      }
    }
    return null;
  }

  function tooltipFormatter(p) {
    if (!p.data || !p.data.tripList) return p.name;
    var lines = p.data.tripList.map(function (t) {
      return '· ' + (t.title || '未命名') + '（' + (t.startDate || '日期待定') + '）';
    });
    return '<b>📍 ' + p.name + '</b><br>' + lines.join('<br>');
  }

  /* ---------- HTML 城市标签层 ----------
   * GL 内置的文字贴图对中文渲染很差（笔画会被裁切），
   * 改用 HTML 覆盖层：每帧把城市坐标投影到屏幕，再移动对应的 DOM 标签。 */

  function renderLabels(data) {
    labelData = data;
    var mapEl = document.getElementById('china-map');
    var overlay = document.getElementById('map-labels');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'map-labels';
      mapEl.appendChild(overlay);
    }
    overlay.innerHTML = '';
    labelEls = data.map(function (d) {
      var el = document.createElement('div');
      el.className = 'map-city-label';
      el.textContent = d.name + (d.visitCount > 1 ? ' ×' + d.visitCount : '');
      el.addEventListener('click', function () { if (onOpen) onOpen(d.tripId); });
      overlay.appendChild(el);
      return el;
    });
  }

  /* echarts-gl 不支持 convertToPixel，手动做投影：
   * dataToPoint 拿到世界坐标，再乘相机的视图/投影矩阵得到屏幕像素 */
  var coordSys = null;

  function getCoordSys() {
    if (!coordSys) {
      try {
        coordSys = chart.getModel().getComponent('geo3D').coordinateSystem;
      } catch (e) { coordSys = null; }
    }
    return coordSys;
  }

  function projectPoint(cam, w, h, pt) {
    var V = cam.viewMatrix.array, P = cam.projectionMatrix.array;
    var x = pt[0], y = pt[1], z = pt[2];
    var ex = V[0] * x + V[4] * y + V[8] * z + V[12];
    var ey = V[1] * x + V[5] * y + V[9] * z + V[13];
    var ez = V[2] * x + V[6] * y + V[10] * z + V[14];
    var cx = P[0] * ex + P[4] * ey + P[8] * ez + P[12];
    var cy = P[1] * ex + P[5] * ey + P[9] * ez + P[13];
    var cw = P[3] * ex + P[7] * ey + P[11] * ez + P[15];
    if (cw <= 0) return null; /* 在相机背后 */
    var nx = cx / cw, ny = cy / cw;
    return [(nx + 1) / 2 * w, (1 - (ny + 1) / 2) * h];
  }

  function updateLabelPositions() {
    if (!chart || !labelEls.length) return;
    var cs = getCoordSys();
    if (!cs || !cs.viewGL || !cs.viewGL.camera) return;
    var cam = cs.viewGL.camera;
    if (!cam.viewMatrix || !cam.projectionMatrix) return;
    var mapEl = document.getElementById('china-map');
    var w = mapEl.clientWidth, h = mapEl.clientHeight;
    for (var i = 0; i < labelEls.length; i++) {
      var d = labelData[i];
      var el = labelEls[i];
      /* 标签锚在光束顶端 */
      var world = cs.dataToPoint([d.value[0], d.value[1], 7 + d.visitCount * 1.5]);
      var px = world && projectPoint(cam, w, h, world);
      if (px && px[0] > -60 && px[0] < w + 60 && px[1] > -30 && px[1] < h + 30) {
        el.style.display = '';
        el.style.transform = 'translate(' + px[0].toFixed(1) + 'px, ' + px[1].toFixed(1) + 'px) translate(-50%, -100%)';
      } else {
        el.style.display = 'none';
      }
    }
  }

  function startLabelLoop() {
    (function tick() {
      updateLabelPositions();
      requestAnimationFrame(tick);
    })();
  }

  function render(trips, onOpenTrip) {
    var section = document.getElementById('map-section');
    if (!section) return;
    onOpen = onOpenTrip;
    /* 库没加载成功（比如文件被移动）就隐藏整个地图区块，不影响其他功能 */
    if (typeof echarts === 'undefined' || !window.CHINA_GEO_JSON || typeof CITY_COORDS === 'undefined') {
      section.classList.add('hidden');
      return;
    }

    if (!inited) {
      echarts.registerMap('china', window.CHINA_GEO_JSON);
      chart = echarts.init(document.getElementById('china-map'));
      chart.on('click', function (params) {
        if (params.data && params.data.tripId) onOpenTrip(params.data.tripId);
      });
      window.addEventListener('resize', function () { if (chart) chart.resize(); });
      startLabelLoop();
      inited = true;
    }

    /* 按目的地聚合 */
    var byCity = {};
    var unmatched = [];
    trips.forEach(function (t) {
      if (!t.destination) return;
      var coord = findCoord(t.destination);
      if (!coord) {
        if (unmatched.indexOf(t.destination) === -1) unmatched.push(t.destination);
        return;
      }
      if (!byCity[t.destination]) byCity[t.destination] = { coord: coord, trips: [] };
      byCity[t.destination].trips.push(t);
    });

    var data = Object.keys(byCity).map(function (name) {
      var item = byCity[name];
      item.trips.sort(function (a, b) { return (b.startDate || '').localeCompare(a.startDate || ''); });
      return {
        name: name,
        value: item.coord.concat([0]),
        visitCount: item.trips.length,
        tripId: item.trips[0].id,
        tripList: item.trips
      };
    });

    /* 光束数据：高度随到访次数增加 */
    var barData = data.map(function (d) {
      return {
        name: d.name,
        value: [d.value[0], d.value[1], 7 + d.visitCount * 1.5],
        tripId: d.tripId,
        tripList: d.tripList
      };
    });

    chart.setOption({
      tooltip: {
        show: true,
        backgroundColor: 'rgba(10, 25, 45, 0.92)',
        borderColor: '#2f6cae',
        textStyle: { color: '#d5e7ff', fontSize: 13 },
        formatter: tooltipFormatter
      },
      geo3D: {
        map: 'china',
        regionHeight: 5,
        boxWidth: 130,
        itemStyle: { color: '#10325c', borderWidth: 0.8, borderColor: '#2f6cae' },
        emphasis: { itemStyle: { color: '#1a4d85' }, label: { show: false } },
        shading: 'realistic',
        realisticMaterial: { roughness: 0.55, metalness: 0.2 },
        light: {
          main: { intensity: 1.1, shadow: false, alpha: 50, beta: -30 },
          ambient: { intensity: 0.25 }
        },
        groundPlane: { show: true, color: '#081426' },
        /* 泛光让城市光柱发光；SSAO 增加立体感 */
        postEffect: {
          enable: true,
          bloom: { enable: true, intensity: 0.25 },
          SSAO: { enable: true, radius: 2, intensity: 1.0 }
        },
        temporalSuperSampling: { enable: true },
        viewControl: {
          autoRotate: true,
          autoRotateSpeed: 6,
          distance: 112,
          alpha: 45,
          beta: 10,
          minDistance: 50,
          maxDistance: 200,
          damping: 0.8
        }
      },
      series: [
        {
          /* 细光束：从城市位置升起的一道光 */
          name: '光束',
          type: 'bar3D',
          coordinateSystem: 'geo3D',
          data: barData,
          barSize: 0.35,
          minHeight: 4,
          shading: 'lambert',
          itemStyle: { color: '#ffd166', opacity: 0.28 },
          emphasis: { itemStyle: { color: '#ffe3a1', opacity: 0.5 } },
          label: { show: false },
          silent: true
        },
        {
          /* 底部光晕 */
          name: '光晕',
          type: 'scatter3D',
          coordinateSystem: 'geo3D',
          data: data,
          symbolSize: function (val, params) {
            return 22 + (params.data.visitCount - 1) * 4;
          },
          itemStyle: { color: '#ffcf5c', opacity: 0.22 },
          label: { show: false },
          silent: true
        },
        {
          /* 亮光点（城市名用 HTML 标签层渲染，见 renderLabels） */
          name: '城市',
          type: 'scatter3D',
          coordinateSystem: 'geo3D',
          data: data,
          symbolSize: function (val, params) {
            return 7 + (params.data.visitCount - 1) * 1.5;
          },
          itemStyle: { color: '#fff3d6', opacity: 1 },
          label: { show: false },
          emphasis: {
            itemStyle: { color: '#ffffff' },
            label: { show: false }
          }
        }
      ]
    });

    renderLabels(data);

    var note = document.getElementById('map-unmatched');
    if (unmatched.length) {
      note.textContent = '暂时定位不到：' + unmatched.join('、') +
        '（境外目的地不会显示在中国地图上；国内地点可在 js/city-coords.js 里补充坐标）';
      note.classList.remove('hidden');
    } else {
      note.classList.add('hidden');
    }
  }

  return { render: render };
})();
