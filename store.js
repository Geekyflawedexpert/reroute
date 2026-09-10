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
    config:  function () {
      var c = read(K.cfg, null) || {};
      if (!('start'     in c)) c.start = null;
      if (!('contacts'  in c)) c.contacts = [];
      if (!('curiosity' in c)) c.curiosity = [];
      if (!c.goal)             c.goal = { mode: 'unsure', dailyMinutes: 30 };
      if (!c.flex)             c.flex = { weekStart: null, used: 0 };
      if (!c.dm)               c.dm = { done: false, people: [], sent: [] };
      return c;
    },

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

    /* ---- the daily budget, derived from the goal the user actually stated ---- */
    budgetToday: function () {
      var cfg = api.config(), g = cfg.goal, d = api.day() || 1;
      var base = Math.max(0, g.dailyMinutes || 0);
      if (g.mode === 'eliminate') {
        // taper across the three phases rather than a cliff on day 15
        base = d <= 7 ? base : d <= 14 ? Math.round(base * 0.5) : d <= 21 ? Math.round(base * 0.15) : 0;
      } else if (g.mode === 'dms') {
        base = Math.min(base, 15);
      }
      if (api.flexActive()) base = Math.round(base * 2);   // today's pass, no questions asked
      return Math.max(0, base - api.overrunDebt());
    },

    /* Two passes a week. No justification required — a budget with no give is a
       budget you fail daily, and failing daily teaches you the system is wrong. */
    FLEX_PER_WEEK: 2,
    flexWeekReset: function () {
      var cfg = api.config(), now = Date.now();
      if (!cfg.flex.weekStart || now - cfg.flex.weekStart > 7 * 864e5) {
        cfg.flex = { weekStart: now, used: 0, activeOn: null };
        api.saveConfig(cfg);
      }
      return cfg;
    },
    flexLeft: function () {
      var cfg = api.flexWeekReset();
      return Math.max(0, api.FLEX_PER_WEEK - (cfg.flex.used || 0));
    },
    flexActive: function () {
      var cfg = api.flexWeekReset();
      return cfg.flex.activeOn === new Date().toDateString();
    },
    useFlex: function () {
      var cfg = api.flexWeekReset();
      if (api.flexLeft() <= 0) return false;
      cfg.flex.used = (cfg.flex.used || 0) + 1;
      cfg.flex.activeOn = new Date().toDateString();
      api.saveConfig(cfg);
      return true;
    },

    todays: function () {
      var t = new Date().toDateString();
      return api.events().filter(function (e) { return new Date(e.ts).toDateString() === t; });
    },
    payoutsToday: function () {
      return api.todays().filter(function (e) { return e.lever === 'payout'; }).length;
    },
    minutesToday: function () {
      return api.todays().reduce(function (a, e) { return a + (e.spentMins || 0); }, 0);
    },
    reroutesToday: function () {
      return api.todays().filter(function (e) { return e.outcome === 'rerouted'; }).length;
    },

    /* ---- an open session survives the page dying, so overrun is measurable
            even though the web can't fire a notification to interrupt it ---- */
    openSession: function () { return api.config().openSession || null; },
    startSession: function (eventId, mins) {
      var cfg = api.config();
      cfg.openSession = { eventId: eventId, startedAt: Date.now(), endAt: Date.now() + mins * 60000, mins: mins };
      api.saveConfig(cfg);
    },
    reconcileSession: function () {
      var cfg = api.config(), s = cfg.openSession;
      if (!s) return null;
      var spent = Math.round((Date.now() - s.startedAt) / 60000);
      var over  = Math.max(0, Math.round((Date.now() - s.endAt) / 60000));
      api.update(s.eventId, { spentMins: spent, overrunMins: over });
      delete cfg.openSession;
      api.saveConfig(cfg);
      return { spent: spent, over: over, planned: s.mins };
    },

    /* ---- overrun escalation: judged first, hard timer if it keeps happening ---- */
    overruns7d: function () {
      var since = Date.now() - 7 * 864e5;
      return api.events().filter(function (e) { return e.ts >= since && (e.overrunMins || 0) > 2; }).length;
    },
    hardMode: function () { return api.overruns7d() >= 2; },

    /* Yesterday's overrun is charged against today. A consequence the app can
       actually enforce, unlike a stop it has no power to impose. */
    overrunDebt: function () {
      var y = new Date(Date.now() - 864e5).toDateString();
      return api.events()
        .filter(function (e) { return new Date(e.ts).toDateString() === y; })
        .reduce(function (a, e) { return a + (e.overrunMins || 0); }, 0);
    },

    /* ---- grace window after a conscious "yes" ---- */
    GRACE_MIN: 3,
    startGrace: function () {
      var c = api.config();
      c.graceUntil = Date.now() + api.GRACE_MIN * 60000;
      api.saveConfig(c);
    },
    graceLeft: function () {
      var c = api.config();
      return c.graceUntil ? Math.max(0, c.graceUntil - Date.now()) : 0;
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
