/* 主逻辑：渲染 + 交互 */

(function () {
  'use strict';

  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };

  var trips = loadTrips();
  var settings = loadSettings();
  var editingTripId = null;   // 正在编辑的旅行 id（null 表示新增）
  var currentDetailId = null; // 详情弹窗当前展示的旅行 id
  var pendingCover = null;    // 表单里新选择、尚未保存的封面图 dataURL

  /* ---------- 工具 ---------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtDate(d) {
    if (!d) return '';
    var p = d.split('-');
    return p.length === 3 ? p[0] + ' 年 ' + Number(p[1]) + ' 月 ' + Number(p[2]) + ' 日' : d;
  }

  function tripDays(t) {
    var a = new Date(t.startDate), b = new Date(t.endDate || t.startDate);
    var n = Math.round((b - a) / 86400000) + 1;
    return n > 0 ? n : 1;
  }

  function stars(n) {
    n = Math.max(1, Math.min(5, Number(n) || 5));
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  }

  /* 封面/瞬间的视觉：有照片用照片，否则用渐变 + emoji */
  function visualHTML(item, fallbackEmoji) {
    if (item.cover || item.image) {
      return '<img src="' + (item.cover || item.image) + '" alt="">';
    }
    var g = item.gradient || 'linear-gradient(135deg, #e07856, #d9a441)';
    return '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:' + g + '">' +
      esc(item.emoji || fallbackEmoji || '🧳') + '</div>';
  }

  /* 压缩图片（localStorage 空间有限） */
  function readImage(file, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var MAX = 1000;
        var w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          var k = MAX / Math.max(w, h);
          w = Math.round(w * k); h = Math.round(h * k);
        }
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        cb(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = function () { alert('这张图片读不出来，换一张试试'); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function openModal(id) { $(id).classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
  function closeModal(el) { el.classList.add('hidden'); document.body.style.overflow = ''; }

  /* ---------- 渲染 ---------- */

  function renderAll() {
    renderHero();
    renderStats();
    renderYearOptions();
    renderTimeline();
    renderCities();
  }

  function renderHero() {
    var a = settings.nameA, b = settings.nameB;
    $('#hero-names').textContent = (a && b) ? (a + ' 和 ' + b + ' 的旅行手账') : '我们 的 旅行手账';
    var el = $('#together-days');
    if (settings.togetherDate) {
      var n = Math.floor((Date.now() - new Date(settings.togetherDate).getTime()) / 86400000) + 1;
      el.textContent = n > 0 ? '♥ 在一起的第 ' + n + ' 天' : '';
    } else {
      el.textContent = '';
    }
  }

  function renderStats() {
    var cities = {};
    var days = 0, moments = 0;
    trips.forEach(function (t) {
      if (t.destination) cities[t.destination] = true;
      days += tripDays(t);
      moments += (t.moments || []).length;
    });
    var data = [
      [trips.length, '次旅行'],
      [Object.keys(cities).length, '个目的地'],
      [days, '天在路上'],
      [moments, '个心动瞬间']
    ];
    $('#stats').innerHTML = data.map(function (d) {
      return '<div class="stat-card"><span class="stat-num">' + d[0] + '</span><span class="stat-label">' + d[1] + '</span></div>';
    }).join('');
  }

  function renderYearOptions() {
    var sel = $('#year-filter');
    var cur = sel.value;
    var years = {};
    trips.forEach(function (t) { if (t.startDate) years[t.startDate.slice(0, 4)] = true; });
    sel.innerHTML = '<option value="">全部年份</option>' +
      Object.keys(years).sort().reverse().map(function (y) {
        return '<option value="' + y + '">' + y + ' 年</option>';
      }).join('');
    sel.value = cur;
  }

  function filteredTrips() {
    var kw = $('#search').value.trim().toLowerCase();
    var year = $('#year-filter').value;
    return trips.filter(function (t) {
      if (year && !(t.startDate || '').startsWith(year)) return false;
      if (kw) {
        var hay = ((t.title || '') + ' ' + (t.destination || '') + ' ' + (t.description || '')).toLowerCase();
        if (hay.indexOf(kw) === -1) return false;
      }
      return true;
    }).sort(function (a, b) { return (b.startDate || '').localeCompare(a.startDate || ''); });
  }

  function renderTimeline() {
    var list = filteredTrips();
    $('#empty-tip').classList.toggle('hidden', list.length > 0);
    $('#timeline-list').innerHTML = list.map(function (t) {
      var tags = '';
      if (t.weather) tags += '<span class="tag-plain">' + esc(t.weather) + '</span>';
      if (t.mood) tags += '<span class="tag">' + esc(t.mood) + '</span>';
      tags += '<span class="hearts">' + stars(t.rating) + '</span>';
      return '' +
        '<article class="trip-card" data-id="' + t.id + '">' +
          '<div class="trip-cover">' + visualHTML(t, '✈️') + '</div>' +
          '<div class="trip-body">' +
            '<p class="trip-date">' + fmtDate(t.startDate) + ' — ' + fmtDate(t.endDate) + ' · ' + tripDays(t) + ' 天</p>' +
            '<h3 class="trip-title">' + esc(t.title) + '</h3>' +
            '<p class="trip-dest">📍 ' + esc(t.destination) + '</p>' +
            '<p class="trip-desc">' + esc(t.description) + '</p>' +
            '<div class="trip-tags">' + tags + '</div>' +
          '</div>' +
        '</article>';
    }).join('');

    $$('.trip-card').forEach(function (card) {
      card.addEventListener('click', function () { openDetail(card.dataset.id); });
    });
  }

  function renderCities() {
    var counts = {};
    trips.forEach(function (t) {
      if (t.destination) counts[t.destination] = (counts[t.destination] || 0) + 1;
    });
    var names = Object.keys(counts);
    $('#city-cloud').innerHTML = names.length
      ? names.sort().map(function (name) {
          var size = Math.min(26, 14 + counts[name] * 3);
          return '<span class="city-tag" style="font-size:' + size + 'px">' + esc(name) +
            (counts[name] > 1 ? '<small>×' + counts[name] + '</small>' : '') + '</span>';
        }).join('')
      : '<p style="color:var(--ink-light)">还没有足迹，去旅行吧。</p>';
  }

  /* ---------- 旅行新增 / 编辑 ---------- */

  function openTripModal(trip) {
    editingTripId = trip ? trip.id : null;
    pendingCover = null;
    $('#trip-modal-title').textContent = trip ? '编辑这次旅行' : '记录一次旅行';
    $('#f-title').value = trip ? trip.title : '';
    $('#f-destination').value = trip ? trip.destination : '';
    $('#f-mood').value = trip ? (trip.mood || '') : '';
    $('#f-start').value = trip ? trip.startDate : '';
    $('#f-end').value = trip ? (trip.endDate || '') : '';
    $('#f-weather').value = trip ? (trip.weather || '') : '';
    $('#f-rating').value = trip ? String(trip.rating || 5) : '5';
    $('#f-description').value = trip ? (trip.description || '') : '';
    $('#f-cover').value = '';
    updateCoverPreview(trip);
    openModal('#trip-modal');
  }

  function updateCoverPreview(trip) {
    var box = $('#cover-preview');
    if (pendingCover) {
      box.innerHTML = '<img src="' + pendingCover + '" alt="">';
      box.classList.remove('hidden');
    } else if (trip && (trip.cover || trip.gradient)) {
      box.innerHTML = visualHTML(trip, '✈️');
      box.classList.remove('hidden');
    } else {
      box.innerHTML = '';
      box.classList.add('hidden');
    }
  }

  function saveTrip(e) {
    e.preventDefault();
    var start = $('#f-start').value, end = $('#f-end').value;
    if (end < start) { alert('返回日期不能早于出发日期'); return; }

    var data = {
      title: $('#f-title').value.trim(),
      destination: $('#f-destination').value.trim(),
      mood: $('#f-mood').value,
      startDate: start,
      endDate: end,
      weather: $('#f-weather').value.trim(),
      rating: Number($('#f-rating').value),
      description: $('#f-description').value.trim()
    };

    if (editingTripId) {
      var t = trips.find(function (x) { return x.id === editingTripId; });
      if (t) {
        Object.keys(data).forEach(function (k) { t[k] = data[k]; });
        if (pendingCover) { t.cover = pendingCover; }
      }
    } else {
      data.id = uuid();
      data.cover = pendingCover || '';
      var palettes = [
        ['#e07856, #d9a441', '🧳'], ['#5b8dd9, #7ec8a9', '🌊'],
        ['#b07ec8, #e08ab0', '🌸'], ['#6aa66a, #c8b45b', '⛰️']
      ];
      var p = palettes[Math.floor(Math.random() * palettes.length)];
      data.gradient = 'linear-gradient(135deg, ' + p[0] + ')';
      data.emoji = p[1];
      data.moments = [];
      trips.push(data);
    }
    saveTrips(trips);
    closeModal($('#trip-modal'));
    renderAll();
    if (currentDetailId === editingTripId && currentDetailId) openDetail(currentDetailId);
  }

  function deleteTrip(id) {
    if (!confirm('确定删除这次旅行吗？里面的瞬间也会一起删掉，删了就找不回来了。')) return;
    trips = trips.filter(function (t) { return t.id !== id; });
    saveTrips(trips);
    closeModal($('#detail-modal'));
    currentDetailId = null;
    renderAll();
  }

  /* ---------- 详情 ---------- */

  function openDetail(id) {
    var t = trips.find(function (x) { return x.id === id; });
    if (!t) return;
    currentDetailId = id;

    var moments = (t.moments || []).map(function (m) {
      return '<div class="moment-card">' +
        '<button class="moment-del" data-mid="' + m.id + '" title="删除">×</button>' +
        '<div class="moment-img">' + visualHTML(m, '📷') + '</div>' +
        '<p class="moment-caption">' + esc(m.caption) + '</p>' +
        (m.date ? '<p class="moment-date">' + fmtDate(m.date) + '</p>' : '') +
      '</div>';
    }).join('');

    $('#detail-content').innerHTML = '' +
      '<div class="detail-cover">' + visualHTML(t, '✈️') + '</div>' +
      '<h3>' + esc(t.title) + '</h3>' +
      '<div class="detail-meta">' +
        '<span>📍 ' + esc(t.destination) + '</span>' +
        '<span>' + fmtDate(t.startDate) + ' — ' + fmtDate(t.endDate) + '（' + tripDays(t) + ' 天）</span>' +
        (t.weather ? '<span class="tag-plain">' + esc(t.weather) + '</span>' : '') +
        (t.mood ? '<span class="tag">' + esc(t.mood) + '</span>' : '') +
        '<span class="hearts">' + stars(t.rating) + '</span>' +
      '</div>' +
      (t.description ? '<p class="detail-desc">' + esc(t.description) + '</p>' : '') +
      '<div class="detail-actions">' +
        '<button class="btn btn-ghost btn-small" id="detail-edit">编辑</button>' +
        '<button class="btn btn-danger btn-small" id="detail-delete">删除这次旅行</button>' +
      '</div>' +
      '<h4 class="moments-title">心动瞬间（' + (t.moments || []).length + '）</h4>' +
      '<div class="moments-grid">' + (moments || '<p style="color:var(--ink-light);font-size:14px">还没有瞬间，在下面添加第一条吧。</p>') + '</div>' +
      '<div class="moment-add">' +
        '<input type="file" id="moment-file" accept="image/*">' +
        '<input type="text" id="moment-caption" maxlength="60" placeholder="这一刻发生了什么？">' +
        '<input type="date" id="moment-date">' +
        '<button class="btn btn-primary btn-small" id="moment-add-btn" type="button">添加瞬间</button>' +
      '</div>' +
      '<div class="detail-close-row"><button class="btn btn-ghost" data-close>关闭</button></div>';

    $('#detail-edit').addEventListener('click', function () {
      closeModal($('#detail-modal'));
      openTripModal(t);
    });
    $('#detail-delete').addEventListener('click', function () { deleteTrip(id); });
    $('#moment-add-btn').addEventListener('click', function () { addMoment(id); });
    $$('.moment-del', $('#detail-content')).forEach(function (btn) {
      btn.addEventListener('click', function () { deleteMoment(id, btn.dataset.mid); });
    });
    bindCloseButtons($('#detail-content'));

    openModal('#detail-modal');
  }

  /* ---------- 瞬间 ---------- */

  function addMoment(tripId) {
    var t = trips.find(function (x) { return x.id === tripId; });
    if (!t) return;
    var file = $('#moment-file').files[0];
    var caption = $('#moment-caption').value.trim();
    var date = $('#moment-date').value;
    if (!file && !caption) { alert('至少加一张照片或写一句话吧'); return; }

    var emojis = ['📷', '🍜', '🌄', '🎡', '🏖️', '🚂', '🌃', '🍦'];
    var moment = {
      id: uuid(),
      image: '',
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
      caption: caption,
      date: date
    };

    function finish() {
      t.moments = t.moments || [];
      t.moments.push(moment);
      saveTrips(trips);
      openDetail(tripId); // 重绘详情
      renderAll();
    }

    if (file) {
      readImage(file, function (dataURL) { moment.image = dataURL; finish(); });
    } else {
      finish();
    }
  }

  function deleteMoment(tripId, momentId) {
    var t = trips.find(function (x) { return x.id === tripId; });
    if (!t) return;
    t.moments = (t.moments || []).filter(function (m) { return m.id !== momentId; });
    saveTrips(trips);
    openDetail(tripId);
    renderAll();
  }

  /* ---------- 设置 ---------- */

  function openSettings() {
    $('#s-name-a').value = settings.nameA || '';
    $('#s-name-b').value = settings.nameB || '';
    $('#s-together-date').value = settings.togetherDate || '';
    openModal('#settings-modal');
  }

  function saveSettingsForm(e) {
    e.preventDefault();
    settings = {
      nameA: $('#s-name-a').value.trim(),
      nameB: $('#s-name-b').value.trim(),
      togetherDate: $('#s-together-date').value
    };
    saveSettings(settings);
    closeModal($('#settings-modal'));
    renderHero();
  }

  /* ---------- 备份 ---------- */

  function exportData() {
    var payload = { version: 1, exportedAt: new Date().toISOString(), settings: settings, trips: trips };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '我们的旅行-备份-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.trips)) throw new Error('bad format');
        if (!confirm('导入会覆盖当前所有记录（共 ' + data.trips.length + ' 条旅行），确定继续吗？')) return;
        trips = data.trips;
        if (data.settings) settings = data.settings;
        saveTrips(trips);
        saveSettings(settings);
        renderAll();
        alert('导入成功');
      } catch (e) {
        alert('导入失败：这不是一个有效的备份文件');
      }
    };
    reader.readAsText(file);
  }

  /* ---------- 事件绑定 ---------- */

  function bindCloseButtons(scope) {
    $$('[data-close]', scope || document).forEach(function (btn) {
      btn.onclick = function () { closeModal(btn.closest('.modal')); };
    });
  }

  function init() {
    $('#btn-add-trip').addEventListener('click', function () { openTripModal(null); });
    $('#btn-settings').addEventListener('click', openSettings);
    $('#trip-form').addEventListener('submit', saveTrip);
    $('#settings-form').addEventListener('submit', saveSettingsForm);
    $('#search').addEventListener('input', renderTimeline);
    $('#year-filter').addEventListener('change', renderTimeline);
    $('#btn-export').addEventListener('click', exportData);
    $('#import-file').addEventListener('change', function (e) {
      if (e.target.files[0]) importData(e.target.files[0]);
      e.target.value = '';
    });
    $('#f-cover').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      readImage(file, function (dataURL) { pendingCover = dataURL; updateCoverPreview(null); });
    });

    bindCloseButtons(document);
    $$('.modal').forEach(function (modal) {
      modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(modal); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') $$('.modal:not(.hidden)').forEach(closeModal);
    });

    renderAll();
  }

  init();
})();
