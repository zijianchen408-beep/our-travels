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
  var momentState = { tripId: null, momentId: null, pendingImage: null }; // 瞬间弹窗状态

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
  function closeModal(el) {
    el.classList.add('hidden');
    if (!$$('.modal:not(.hidden)').length) document.body.style.overflow = '';
  }

  /* ---------- 图片放大查看 ---------- */

  function openLightbox(src, caption) {
    $('#lightbox-img').src = src;
    $('#lightbox-caption').textContent = caption || '';
    $('#lightbox').classList.remove('hidden');
  }

  function closeLightbox() { $('#lightbox').classList.add('hidden'); }

  /* ---------- 渲染 ---------- */

  function renderAll() {
    renderHero();
    renderStats();
    renderYearOptions();
    renderTimeline();
    renderCities();
    if (window.TravelMap) TravelMap.render(trips, openDetail);
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
    if (window.Sync) Sync.upsertTrip(editingTripId ? t : data); /* 同步到云端 */
    saveTrips(trips);
    closeModal($('#trip-modal'));
    renderAll();
    if (currentDetailId === editingTripId && currentDetailId) openDetail(currentDetailId);
  }

  function deleteTrip(id) {
    if (!confirm('确定删除这次旅行吗？里面的瞬间也会一起删掉，删了就找不回来了。')) return;
    trips = trips.filter(function (t) { return t.id !== id; });
    if (window.Sync) Sync.removeTrip(id); /* 云端同步删除 */
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

    var sorted = (t.moments || []).slice().sort(momentCompare);
    var moments = sorted.map(function (m) {
      return '<div class="moment-card' + (m.pinned ? ' pinned' : '') + '">' +
        '<button class="moment-pin' + (m.pinned ? ' pinned' : '') + '" data-mid="' + m.id + '" title="' + (m.pinned ? '取消置顶' : '置顶') + '">📌</button>' +
        '<button class="moment-edit" data-mid="' + m.id + '" title="编辑">✎</button>' +
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
      '<div class="moments-header">' +
        '<h4 class="moments-title">心动瞬间（' + (t.moments || []).length + '）</h4>' +
        '<button class="btn btn-primary btn-small" id="moment-open-add" type="button">+ 添加瞬间</button>' +
      '</div>' +
      '<div class="moments-grid">' + (moments || '<p style="color:var(--ink-light);font-size:14px">还没有瞬间，点右上角「+ 添加瞬间」记录第一条吧。</p>') + '</div>' +
      '<div class="detail-close-row"><button class="btn btn-ghost" data-close>关闭</button></div>';

    $('#detail-edit').addEventListener('click', function () {
      closeModal($('#detail-modal'));
      openTripModal(t);
    });
    $('#detail-delete').addEventListener('click', function () { deleteTrip(id); });
    $('#moment-open-add').addEventListener('click', function () { openMomentModal(id, null); });
    $$('.moment-edit', $('#detail-content')).forEach(function (btn) {
      btn.addEventListener('click', function () { openMomentModal(id, btn.dataset.mid); });
    });
    $$('.moment-del', $('#detail-content')).forEach(function (btn) {
      btn.addEventListener('click', function () { deleteMoment(id, btn.dataset.mid); });
    });
    $$('.moment-pin', $('#detail-content')).forEach(function (btn) {
      btn.addEventListener('click', function () { togglePinMoment(id, btn.dataset.mid); });
    });
    /* 点击图片放大查看 */
    var coverImg = $('#detail-content .detail-cover img');
    if (coverImg) coverImg.addEventListener('click', function () { openLightbox(t.cover, t.title); });
    $$('.moment-card', $('#detail-content')).forEach(function (card, i) {
      var m = sorted[i];
      var img = card.querySelector('.moment-img img');
      if (m && img) img.addEventListener('click', function () { openLightbox(m.image, m.caption); });
    });
    bindCloseButtons($('#detail-content'));

    openModal('#detail-modal');
  }

  /* ---------- 瞬间 ---------- */

  /* momentId 为 null 时是添加，否则是编辑 */
  function openMomentModal(tripId, momentId) {
    var t = trips.find(function (x) { return x.id === tripId; });
    if (!t) return;
    var m = momentId ? (t.moments || []).find(function (x) { return x.id === momentId; }) : null;
    momentState.tripId = tripId;
    momentState.momentId = m ? m.id : null;
    momentState.pendingImage = null;
    $('#moment-modal-title').textContent = m ? '编辑瞬间' : '添加瞬间';
    $('#m-caption').value = m ? (m.caption || '') : '';
    $('#m-date').value = m ? (m.date || '') : '';
    $('#m-file').value = '';
    updateMomentPreview(m);
    openModal('#moment-modal');
  }

  function updateMomentPreview(m) {
    var box = $('#m-preview');
    if (momentState.pendingImage) {
      box.innerHTML = '<img src="' + momentState.pendingImage + '" alt="">';
      box.classList.remove('hidden');
    } else if (m && (m.image || m.emoji)) {
      box.innerHTML = visualHTML(m, '📷');
      box.classList.remove('hidden');
    } else {
      box.innerHTML = '';
      box.classList.add('hidden');
    }
  }

  function saveMoment(e) {
    e.preventDefault();
    var t = trips.find(function (x) { return x.id === momentState.tripId; });
    if (!t) return;
    var caption = $('#m-caption').value.trim();
    var date = $('#m-date').value;
    var m = momentState.momentId
      ? (t.moments || []).find(function (x) { return x.id === momentState.momentId; })
      : null;

    if (m) {
      m.caption = caption;
      m.date = date;
      if (momentState.pendingImage) m.image = momentState.pendingImage; // 不换图则保留原图
    } else {
      if (!momentState.pendingImage && !caption) { alert('至少加一张照片或写一句话吧'); return; }
      var emojis = ['📷', '🍜', '🌄', '🎡', '🏖️', '🚂', '🌃', '🍦'];
      t.moments = t.moments || [];
      t.moments.push({
        id: uuid(),
        image: momentState.pendingImage || '',
        emoji: emojis[Math.floor(Math.random() * emojis.length)],
        caption: caption,
        date: date
      });
    }

    if (window.Sync) Sync.upsertTrip(t); /* 同步到云端 */
    saveTrips(trips);
    closeModal($('#moment-modal'));
    openDetail(t.id); // 重绘详情
    renderAll();
  }

  function deleteMoment(tripId, momentId) {
    var t = trips.find(function (x) { return x.id === tripId; });
    if (!t) return;
    t.moments = (t.moments || []).filter(function (m) { return m.id !== momentId; });
    if (window.Sync) Sync.upsertTrip(t); /* 同步到云端 */
    saveTrips(trips);
    openDetail(tripId);
    renderAll();
  }

  /* 置顶的排最前，其余按日期从先到后；没填日期的排在最后 */
  function momentCompare(a, b) {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return (a.date || '9999').localeCompare(b.date || '9999');
  }

  function togglePinMoment(tripId, momentId) {
    var t = trips.find(function (x) { return x.id === tripId; });
    if (!t) return;
    var m = (t.moments || []).find(function (x) { return x.id === momentId; });
    if (!m) return;
    m.pinned = !m.pinned;
    if (window.Sync) Sync.upsertTrip(t); /* 同步到云端 */
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
    if (window.Sync) Sync.pushSettings(settings); /* 同步到云端 */
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
        if (window.Sync) Sync.replaceAll(trips, settings); /* 整体覆盖云端 */
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
    $('#moment-form').addEventListener('submit', saveMoment);
    $('#m-file').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      readImage(file, function (dataURL) { momentState.pendingImage = dataURL; updateMomentPreview(null); });
    });

    bindCloseButtons(document);
    $('#lightbox').addEventListener('click', closeLightbox);
    $$('.modal').forEach(function (modal) {
      modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(modal); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!$('#lightbox').classList.contains('hidden')) { closeLightbox(); return; }
        var open = $$('.modal:not(.hidden)');
        if (open.length) closeModal(open[open.length - 1]); // 只关最上层弹窗
      }
    });

    renderAll();
    bootSync();
  }

  /* ---------- 云端同步 ---------- */

  function applyRemote(remote) {
    trips = remote.trips || [];
    if (remote.settings) settings = remote.settings;
    saveTrips(trips);
    saveSettings(settings);
    renderAll();
  }

  function sameData(remote) {
    var sortById = function (arr) {
      return arr.slice().sort(function (a, b) { return String(a.id).localeCompare(String(b.id)); });
    };
    return JSON.stringify(sortById(remote.trips || [])) === JSON.stringify(sortById(trips)) &&
      JSON.stringify(remote.settings || null) === JSON.stringify(settings);
  }

  function anyModalOpen() {
    return !!document.querySelector('.modal:not(.hidden)') || !$('#lightbox').classList.contains('hidden');
  }

  /* 拉取云端最新数据；本地与云端一致或正在编辑时不打扰 */
  function refreshFromCloud() {
    if (!window.Sync || !Sync.enabled) return;
    Sync.loadAll().then(function (remote) {
      if (!remote || anyModalOpen()) return;
      if (!sameData(remote)) applyRemote(remote);
    }).catch(function () { /* 网络失败就保持本地数据 */ });
  }

  function bootSync() {
    var el = $('#sync-status');
    if (!window.Sync || !Sync.enabled) {
      if (el) { el.textContent = '本地模式'; el.title = '未配置云端同步，数据只保存在这个浏览器里'; }
      return;
    }
    if (el) el.textContent = '云端同步中…';
    Sync.loadAll().then(function (remote) {
      if (remote.trips.length) {
        applyRemote(remote); /* 云端有数据：以云端为准 */
      } else if (localStorage.getItem(STORAGE_KEY) && trips.length) {
        Sync.pushAll(trips, settings); /* 首次连接：把本机已有记录上传到云端 */
      }
      if (el) el.textContent = '云端同步已开启';
    }).catch(function () {
      if (el) el.textContent = '云端连接失败，暂用本地数据';
    });
    setInterval(refreshFromCloud, 60000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) refreshFromCloud();
    });
  }

  init();
})();
