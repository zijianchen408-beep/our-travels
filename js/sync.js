/* 云端同步层（Supabase REST API，无 SDK 依赖）
 * 表结构见 README 指引：trips(id text pk, payload jsonb) / settings(id text pk, payload jsonb)
 * 所有写操作都是「尽力而为」：失败了不影响本地使用，下次启动会再拉取。
 */
window.Sync = (function () {
  'use strict';

  var cfg = window.SYNC_CONFIG || {};
  var enabled = !!(cfg.url && cfg.key);
  var base = enabled ? cfg.url.replace(/\/+$/, '') + '/rest/v1' : '';

  function headers(extra) {
    var h = {
      'apikey': cfg.key,
      'Authorization': 'Bearer ' + cfg.key,
      'Content-Type': 'application/json'
    };
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }

  function warn(e) { console.warn('云端同步失败：', e); }

  /* 拉取云端全部数据；未启用时返回 null */
  function loadAll() {
    if (!enabled) return Promise.resolve(null);
    var p1 = fetch(base + '/trips?select=id,payload&order=id', { headers: headers() })
      .then(function (r) { if (!r.ok) throw new Error('trips HTTP ' + r.status); return r.json(); });
    var p2 = fetch(base + '/settings?select=payload&id=eq.main', { headers: headers() })
      .then(function (r) { if (!r.ok) throw new Error('settings HTTP ' + r.status); return r.json(); });
    return Promise.all([p1, p2]).then(function (res) {
      return {
        trips: res[0].map(function (row) { return row.payload; }),
        settings: res[1][0] ? res[1][0].payload : null
      };
    });
  }

  function upsertTrip(t) {
    if (!enabled) return;
    fetch(base + '/trips', {
      method: 'POST',
      headers: headers({ 'Prefer': 'resolution=merge-duplicates' }),
      body: JSON.stringify({ id: String(t.id), payload: t, updated_at: new Date().toISOString() })
    }).catch(warn);
  }

  function removeTrip(id) {
    if (!enabled) return;
    fetch(base + '/trips?id=eq.' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: headers()
    }).catch(warn);
  }

  function pushSettings(s) {
    if (!enabled) return;
    fetch(base + '/settings', {
      method: 'POST',
      headers: headers({ 'Prefer': 'resolution=merge-duplicates' }),
      body: JSON.stringify({ id: 'main', payload: s })
    }).catch(warn);
  }

  function pushAll(trips, settings) {
    trips.forEach(upsertTrip);
    pushSettings(settings);
  }

  /* 整体替换云端数据（导入备份时用）：先清空再上传 */
  function replaceAll(trips, settings) {
    if (!enabled) return;
    fetch(base + '/trips?id=neq.__none__', { method: 'DELETE', headers: headers() })
      .then(function () { pushAll(trips, settings); })
      .catch(warn);
  }

  return {
    enabled: enabled,
    loadAll: loadAll,
    upsertTrip: upsertTrip,
    removeTrip: removeTrip,
    pushSettings: pushSettings,
    pushAll: pushAll,
    replaceAll: replaceAll
  };
})();
