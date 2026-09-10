/* store.js — everything stays on this device. */
var RB = window.RB || {};

RB.store = (function () {
  var K = { ev:'rb.events.v1', intake:'rb.intake.v1', cfg:'rb.config.v1' };

  function read(k, dflt) {
    try { var s = localStorage.getItem(k); return s ? JSON.parse(s) : dflt; }
    catch (e) { return dflt; }
  }
  function write(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { return false; }
  }

  var api = {
    events:  function () { return read(K.ev, []); },
    intake:  function () { return read(K.intake, null); },
    config:  function () { return read(K.cfg, { start: null, contacts: [], curiosity: [] }); },

    saveIntake: function (v) { write(K.intake, v); },
    saveConfig: function (v) { write(K.cfg, v); },

    add: function (ev) {
      var all = api.events();
      ev.id = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
      all.push(ev);
      write(K.ev, all);
      return ev;
    },
    update: function (id, patch) {
      var all = api.events();
      for (var i = all.length - 1; i >= 0; i--) {
        if (all[i].id === id) { Object.assign(all[i], patch); break; }
      }
      write(K.ev, all);
    },

    /* counts[bucket] = 7-vector of confirmed levers — feeds the Dirichlet posterior */
    counts: function () {
      var c = {};
      api.events().forEach(function (e) {
        if (!e.lever) return;
        var b = RB.bucketFor(e.hour);
        if (!c[b]) c[b] = RB.LEVERS.map(function () { return 0; });
        c[b][RB.IDX[e.lever]] += 1;
      });
      return c;
    },

    /* day 1..21 of the programme, or null before it starts */
    day: function () {
      var s = api.config().start;
      if (!s) return null;
      return Math.floor((Date.now() - s) / 864e5) + 1;
    },
    phase: function () {
      var d = api.day();
      if (d == null) return 0;
      return d <= 7 ? 1 : d <= 14 ? 2 : d <= 21 ? 3 : 4;
    },

    lastEventTs: function () {
      var all = api.events();
      return all.length ? all[all.length - 1].ts : null;
    },
    exportJSON: function () {
      return JSON.stringify({ v: 1, exported: new Date().toISOString(),
        intake: api.intake(), config: api.config(), events: api.events() }, null, 2);
    },
    importJSON: function (text) {
      var d = JSON.parse(text);
      if (!d || !Array.isArray(d.events)) throw new Error('Not a Reroute backup file.');
      if (d.intake) write(K.intake, d.intake);
      if (d.config) write(K.cfg, d.config);
      var byId = {}, merged = api.events().concat(d.events);
      merged.forEach(function (e) { if (e && e.id) byId[e.id] = e; });
      var all = Object.keys(byId).map(function (k) { return byId[k]; })
                      .sort(function (a, b) { return a.ts - b.ts; });
      write(K.ev, all);
      return all.length;
    },
    clear: function () { [K.ev, K.intake, K.cfg].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} }); }
  };
  return api;
})();

/* Storage durability. Safari evicts a plain site's storage after ~7 days unused,
   which would wipe the only data this product exists to collect. persist() exempts
   the origin; an installed (home-screen) PWA is exempt anyway. Neither is a
   guarantee, so export/import above is the real safety net — not a nicety. */
RB.storageState = { persisted: null, asked: false };
RB.requestPersistence = function () {
  try {
    if (!navigator.storage || !navigator.storage.persist) { RB.storageState.persisted = false; return; }
    navigator.storage.persisted().then(function (already) {
      if (already) { RB.storageState.persisted = true; return; }
      return navigator.storage.persist().then(function (ok) { RB.storageState.persisted = ok; });
    }).catch(function () { RB.storageState.persisted = false; });
  } catch (e) { RB.storageState.persisted = false; }
  RB.storageState.asked = true;
};

/* Build the context object the predictor needs, from what we can see for free. */
RB.contextNow = function () {
  var now = new Date(), last = RB.store.lastEventTs();
  var events = RB.store.events();
  var todayStr = now.toDateString();
  var firstToday = !events.some(function (e) { return new Date(e.ts).toDateString() === todayStr; });
  return {
    hour: now.getHours(),
    dow: now.getDay(),
    weekend: now.getDay() === 0 || now.getDay() === 6,
    firstUnlockOfDay: firstToday,
    minsSinceLast: last ? Math.round((Date.now() - last) / 60000) : null,
    workBlockRunning: false,          // v2: read from calendar
    fromNotification: /[?&]src=notif/.test(location.search)
  };
};

window.RB = RB;
