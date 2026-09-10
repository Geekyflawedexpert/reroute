/* app.js — v1. Capture → dispense one unit → record the outcome.
   Never blocks. "Open it anyway" is always one tap away, on purpose. */
var RB = window.RB || {};

(function () {
  var stage, eyebrow, current = null, timerHandle = null, visHandler = null, pendingSession = null;

  function el(t, c, h) { var n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; }
  function clearTimer() {
    if (timerHandle) { clearInterval(timerHandle); clearTimeout(timerHandle); timerHandle = null; }
    if (visHandler) { document.removeEventListener('visibilitychange', visHandler); visHandler = null; }
  }
  function mmss(s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  function openTarget(committed) {
    if (current) {
      RB.store.update(current.id, { outcome: 'opened', endedAt: Date.now() });
      // Start a tracked session so the time actually spent in Instagram counts
      // against today's budget. The automation firing again is what closes it:
      // the next time Reroute loads, reconcileSession() measures the gap.
      var left = committed || Math.max(1, RB.store.budgetToday() - RB.store.minutesToday());
      RB.store.startSession(current.id, left);
    }
    RB.store.startGrace();          // so the automation doesn't bounce you straight back
    goToInstagram();
  }

  /* Web by default: mobile instagram.com is a markedly worse feed than the app,
     and it avoids the "Open in Instagram?" switch prompt entirely. The app path
     cancels its web fallback the moment we're backgrounded — otherwise
     instagram.com loads silently behind the app and greets you next visit. */
  function goToInstagram() {
    if (RB.store.config().target === 'web') {
      location.href = 'https://www.instagram.com/';
      return;
    }
    var fired = false;
    var fallback = setTimeout(function () {
      if (!fired) location.href = 'https://www.instagram.com/';
    }, 1500);
    function cancelFallback() { fired = true; clearTimeout(fallback); }
    document.addEventListener('visibilitychange', function () { if (document.hidden) cancelFallback(); });
    window.addEventListener('pagehide', cancelFallback);
    window.addEventListener('blur', cancelFallback);
    location.href = 'instagram://';
  }

  /* ---------------- capture ---------------- */
  function capture() {
    clearTimer();
    var ctx = RB.contextNow();
    var pred = RB.predict(ctx, RB.store.intake(), RB.store.counts());
    var day = RB.store.day();

    eyebrow.innerHTML = 'Reroute · <b>' + (day ? 'day ' + day + ' of 21' : 'not started') + '</b>';
    stage.innerHTML = '';
    if (pendingSession) {
      var ps = pendingSession; pendingSession = null;
      var n = RB.store.overruns7d(), body, tail;
      if (ps.over <= 0) {
        body = 'You planned ' + ps.planned + ' minutes and took ' + ps.spent + '. It held.';
        tail = 'That’s the stop working without anything enforcing it.';
      } else if (n <= 1) {
        // Stage one: judged. No cushion, no absolution — just the number, said plainly.
        body = 'You planned ' + ps.planned + ' minutes. You took ' + ps.spent + '.';
        tail = 'That’s ' + ps.over + ' minutes you didn’t decide to spend. ' +
               'If it happens again this week the timer stops being a suggestion.';
      } else {
        // Stage two: the timer becomes enforced, and yesterday's overrun is charged to today.
        body = ps.over + ' minutes over, and that’s ' + n + ' times this week.';
        tail = 'Hard timer is on. Breaks now run to the end before they can be closed, ' +
               'and today’s overrun comes off tomorrow’s budget.';
      }
      stage.appendChild(el('div', 'card',
        '<p class="q">Last break</p>' +
        '<p style="color:var(--ink);margin:0">' + body + '</p>' +
        '<p class="hint" style="margin:6px 0 0">' + tail + '</p>'));
    }
    var cfgDM = RB.store.config().dm, dayNow = RB.store.day();
    if (dayNow != null && dayNow >= 13 && !cfgDM.done) {
      var nudge = el('div', 'card');
      nudge.appendChild(el('p', 'q', 'Day 13 · before you delete it'));
      nudge.appendChild(el('p', null,
        'Instagram DMs can’t be exported or forwarded — so the messages don’t move, the people do. ' +
        'It’s usually three to eight who actually message you.'));
      var openDM = el('button', 'alt', '<span>Sort out my messages</span>');
      openDM.type = 'button';
      openDM.addEventListener('click', dmStep);
      nudge.appendChild(openDM);
      stage.appendChild(nudge);
    }
    var budg = RB.store.budgetToday(), spent = RB.store.minutesToday();
    if (budg > 0) {
      var pct = Math.min(100, Math.round(spent / budg * 100));
      var over = spent > budg;
      var meter = el('div');
      meter.style.cssText = 'margin:0 0 var(--s5)';
      meter.innerHTML =
        '<div class="bar" style="grid-template-columns:1fr auto;gap:var(--s2);margin-bottom:6px">' +
          '<span class="t" style="color:' + (over ? 'var(--warn)' : 'var(--muted)') + '">' +
            (over ? spent + ' min today — ' + (spent - budg) + ' over your ' + budg
                  : spent + ' of ' + budg + ' min today') +
            (RB.store.flexActive() ? ' · flexible day' : '') +
          '</span>' +
          '<span class="n">' + pct + '%</span>' +
        '</div>' +
        '<span class="track"><span class="fill" style="width:' + pct + '%;' +
          (over ? 'background:var(--warn)' : '') + '"></span></span>';
      stage.appendChild(meter);
    }
    stage.appendChild(el('h1', null, 'What’s going on?'));

    var top = pred.ranked[0], L = RB.lever(top.id);
    var big = el('button', 'primary',
      '<span>' + L.label + '</span><span class="why">' +
      Math.round(top.p * 100) + '% likely · ' + (pred.leaning === 'personal' ? 'from your history' : 'best guess so far') +
      '</span>');
    big.type = 'button';
    big.addEventListener('click', function () { choose(top.id, top.id, ctx, pred); });
    stage.appendChild(big);

    var alts = el('div', 'stack');
    alts.style.marginTop = '10px';
    pred.ranked.slice(1, 4).forEach(function (r) {
      var b = el('button', 'alt',
        '<span>' + RB.lever(r.id).label + '</span><span class="p">' + Math.round(r.p * 100) + '%</span>');
      b.type = 'button';
      b.addEventListener('click', function () { choose(r.id, top.id, ctx, pred); });
      alts.appendChild(b);
    });
    stage.appendChild(alts);

    var rest = el('div', 'stack hidden');
    pred.ranked.slice(4).forEach(function (r) {
      var b = el('button', 'alt', '<span>' + RB.lever(r.id).label + '</span>');
      b.type = 'button';
      b.addEventListener('click', function () { choose(r.id, top.id, ctx, pred); });
      rest.appendChild(b);
    });
    var more = el('button', 'ghost', 'Something else');
    more.type = 'button';
    more.addEventListener('click', function () { rest.classList.remove('hidden'); more.classList.add('hidden'); });
    stage.appendChild(more);
    stage.appendChild(rest);

    stage.appendChild(el('div', 'sp'));
    var outOfBudget = budg > 0 && spent >= budg;
    var lockCfg2 = RB.store.config().lock;
    if (outOfBudget && lockCfg2.auto && lockCfg2.shortcut && !RB.store.lockFiredToday()) {
      if (fireLock()) return;      // fires once a day, not on every load
    }
    var skip = el('button', 'ghost warnish',
      outOfBudget ? 'Open it anyway — you’re at ' + spent + ' of ' + budg : 'Just open it');
    skip.type = 'button';
    skip.addEventListener('click', function () { handoff(ctx, top.id); });
    stage.appendChild(skip);
    tabs('log');
  }

  function choose(leverId, predictedId, ctx, pred) {
    // Corroborate BEFORE logging, or this break counts itself and the first
    // Payout of the day can never qualify.
    var corr = leverId === 'payout' ? corroborate(ctx) : null;

    current = RB.store.add({
      ts: Date.now(), hour: ctx.hour, dow: ctx.dow, ctx: ctx,
      predicted: predictedId, lever: leverId, corrected: leverId !== predictedId,
      confidence: pred.ranked[0].p, leaning: pred.leaning, outcome: null,
      corroborated: corr ? corr.ok : undefined, corrScore: corr ? corr.score : undefined
    });
    var bank = corr ? RB.payoutUnits(corr.ok) : (RB.UNITS[leverId] || []);
    var unit = bank[Math.floor(Math.random() * bank.length)];   // the draw: not shown in advance
    RB.store.update(current.id, { unit: unit.id, unitType: unit.type });
    dispense(leverId, unit, corr);
  }

  /* Payout claims "I've earned this". The app can't refuse that — refusing an
     earned break produces a binge — but it can check it against what it already
     knows, and hand back a shorter object when the claim doesn't hold up.
     Evidence, not currency: there is nothing here to farm. */
  function corroborate(ctx) {
    var score = 0, why = [];
    if (RB.store.payoutsToday() === 0)          { score += 2; } else { why.push('this is break ' + (RB.store.payoutsToday() + 1) + ' today'); }
    if (ctx.minsSinceLast == null || ctx.minsSinceLast > 90) { score += 1; } else if (ctx.minsSinceLast < 20) { why.push('you were here ' + ctx.minsSinceLast + ' minutes ago'); }
    if (ctx.hour >= 17)                          { score += 1; }
    if (RB.store.reroutesToday() >= 2)           { score += 1; }
    return { ok: score >= 3, score: score, why: why };
  }

  /* Runs a Shortcut by name. This is the only lever a web page has on the OS:
     it can't set a Screen Time limit, but the Shortcut it starts can set a
     Focus whose Home Screen simply doesn't contain Instagram. */
  function fireLock() {
    var name = (RB.store.config().lock.shortcut || '').trim();
    if (!name) return false;
    RB.store.markLockFired();
    location.href = 'shortcuts://run-shortcut?name=' + encodeURIComponent(name);
    return true;
  }

  /* ---- the handoff ----
     Going through is a decision with a stated length, made before you leave,
     not a door you drift out of. Reroute can hold you to the next session;
     only Screen Time can end the one you're in. */
  function handoff(ctx, predictedId) {
    clearTimer();
    var budg = RB.store.budgetToday(), spent = RB.store.minutesToday();
    var left = budg - spent;
    eyebrow.innerHTML = 'Reroute · <b>going through</b>';
    stage.innerHTML = '';

    if (budg > 0 && left <= 0) {
      // Reroute's own hard lock: it will not hand you a session it can't fund.
      stage.appendChild(el('h1', null, 'You’re <span class="hl">out for today</span>'));
      stage.appendChild(el('p', 'lead',
        spent + ' of ' + budg + ' minutes used. The next one is tomorrow.'));

      if (RB.store.flexLeft() > 0) {
        var flex = el('button', 'alt',
          '<span class="row-item"><span class="t">Use a flexible day</span>' +
          '<span class="d">' + RB.store.flexLeft() + ' left this week. Doubles today’s budget, no reason needed.</span></span>');
        flex.type = 'button';
        flex.addEventListener('click', function () { RB.store.useFlex(); handoff(ctx, predictedId); });
        stage.appendChild(flex);
      } else {
        stage.appendChild(el('p', 'hint',
          'No flexible days left this week either. They come back on ' +
          new Date(RB.store.config().flex.weekStart + 7 * 864e5).toLocaleDateString(undefined, { weekday: 'long' }) + '.'));
      }

      stage.appendChild(el('p', 'hint',
        'Reroute can refuse the next session. It cannot end one you’re already in, and it ' +
        'cannot stop you typing the address yourself — that’s what the Screen Time website ' +
        'limit is for. This is a commitment, not a wall.'));

      stage.appendChild(el('div', 'sp'));

      var lockCfg = RB.store.config().lock;
      if (lockCfg.shortcut) {
        var lock = el('button', 'primary',
          '<span>Put it out of reach</span><span class="why">runs “' + lockCfg.shortcut + '” · hides the app</span>');
        lock.type = 'button';
        lock.addEventListener('click', fireLock);
        stage.appendChild(lock);

        var back2 = el('button', 'ghost', 'Not now');
        back2.type = 'button';
        back2.addEventListener('click', capture);
        stage.appendChild(back2);
      } else {
        var back = el('button', 'primary', '<span>Fine, back</span>');
        back.type = 'button';
        back.addEventListener('click', capture);
        stage.appendChild(back);
      }
      return;
    }

    var mins = budg > 0 ? left : 20;
    stage.appendChild(el('h1', null, '<span class="hl">' + mins + ' minutes</span> starting now'));
    stage.appendChild(el('p', 'lead',
      budg > 0
        ? 'That’s what’s left of your ' + budg + ' today. The clock starts when you tap.'
        : 'No limit set, so this is a 20-minute session by default.'));
    stage.appendChild(el('p', 'hint',
      'Opening in Safari, not the app — the mobile site is the worse feed, which is the point. ' +
      'Go over and it comes off tomorrow.'));

    var go = el('button', 'primary',
      '<span>Open Instagram</span><span class="why">' + mins + ' min · counted either way</span>');
    go.type = 'button';
    go.addEventListener('click', function () {
      current = RB.store.add({ ts: Date.now(), hour: ctx.hour, dow: ctx.dow, ctx: ctx,
        predicted: predictedId, lever: null, outcome: 'opened', endedAt: Date.now(),
        committedMins: mins });
      openTarget(mins);
    });
    stage.appendChild(el('div', 'sp'));
    stage.appendChild(go);

    var no = el('button', 'ghost', 'Actually, no');
    no.type = 'button';
    no.addEventListener('click', capture);
    stage.appendChild(no);
  }

  /* ---------------- units ---------------- */
  function shell(title, sub) {
    stage.innerHTML = '';
    var head = el('div');
    head.appendChild(el('p', 'q', title));
    if (sub) head.appendChild(el('p', null, sub));
    stage.appendChild(head);
    return stage;
  }

  function dispense(leverId, u, corr) {
    eyebrow.innerHTML = 'Reroute · <b>one ' + (u.type === 'step' ? 'step' : 'thing') + ', then it ends</b>';
    ({ wiki: uWiki, drill: uDrill, breath: uBreath, timebox: uTimebox, artifact: uArtifact,
       move: uMove, text: uText, step: uStep, voice: uVoice, list: uList
     }[u.type] || uText)(u, leverId, corr);
  }

  /* A bounded object, not a duration. The thing ends by itself; the timer is
     only there so the overrun is measurable afterwards. */
  function uArtifact(u, leverId, corr) {
    var used = RB.store.minutesToday(), budget = RB.store.budgetToday();
    var sub = u.note || '';
    if (corr && !corr.ok && corr.why.length) sub = corr.why[0].charAt(0).toUpperCase() + corr.why[0].slice(1) + '. ' + sub;
    shell(u.title, sub);

    var over = (used + u.mins) - budget;
    var debt = RB.store.overrunDebt();
    var line = el('p', 'hint',
      used + ' of ' + budget + ' min used today' +
      (debt > 0 ? ' (' + debt + ' charged from yesterday)' : '') +
      (over > 0 ? ' · this takes you ' + over + ' min past it' : '') +
      (RB.store.flexActive() ? ' · flexible day' : '') +
      (RB.store.hardMode() ? ' · hard timer on' : ''));
    stage.appendChild(line);

    askNotify();
    var go = el('button', 'primary',
      '<span>Start — ' + u.title.toLowerCase() + '</span><span class="why">ends on its own · ~' + u.mins + ' min</span>');
    go.type = 'button';
    var hard = RB.store.hardMode();
    go.addEventListener('click', function () {
      RB.store.startSession(current.id, u.mins);
      shell(u.title, hard
        ? 'Hard timer. This runs to the end — you can’t close it early.'
        : 'Running. Put the phone down — come back when it’s finished.');

      if (!hard) {
        countdown(u.mins * 60, null, 'That’s the ' + u.title.toLowerCase() + ' done.');
        return done('Finished');
      }
      var fin = el('button', 'primary', '<span>Finished</span>');
      fin.type = 'button';
      fin.disabled = true;
      fin.style.opacity = '.4';
      countdown(u.mins * 60, function () {
        fin.disabled = false; fin.style.opacity = '1';
      }, 'That’s the ' + u.title.toLowerCase() + ' done.');
      fin.addEventListener('click', function () { if (!fin.disabled) outcome(); });
      stage.appendChild(el('div', 'sp'));
      stage.appendChild(fin);
      var bail2 = el('button', 'ghost warnish', 'Open it anyway');
      bail2.type = 'button';
      bail2.addEventListener('click', openTarget);
      stage.appendChild(bail2);
    });
    stage.appendChild(go);

    if (over > 0 && RB.store.flexLeft() > 0 && !RB.store.flexActive()) {
      var flex = el('button', 'ghost',
        'Use a flexible day (' + RB.store.flexLeft() + ' left this week)');
      flex.type = 'button';
      flex.addEventListener('click', function () { RB.store.useFlex(); uArtifact(u, leverId, corr); });
      stage.appendChild(flex);
    }

    var bail = el('button', 'ghost warnish', 'Open it anyway');
    bail.type = 'button';
    bail.addEventListener('click', openTarget);
    stage.appendChild(bail);
  }

  function done(label) {
    var b = el('button', 'primary', '<span>' + (label || 'Done') + '</span>');
    b.type = 'button';
    b.addEventListener('click', outcome);
    stage.appendChild(el('div', 'sp'));
    stage.appendChild(b);
    var bail = el('button', 'ghost warnish', 'Open it anyway');
    bail.type = 'button';
    bail.addEventListener('click', openTarget);
    stage.appendChild(bail);
  }

  /* Counts against a wall-clock deadline, not ticks. setInterval is frozen while
     a mobile browser is backgrounded — and the copy tells people to put the phone
     down, so tick-counting would guarantee a wrong timer every single time. */
  function countdown(secs, onEnd, label) {
    var endAt = Date.now() + secs * 1000, fired = false;
    var t = el('div', 'timer', mmss(secs));
    stage.appendChild(t);
    clearTimer();

    function tick() {
      var left = Math.max(0, Math.round((endAt - Date.now()) / 1000));
      t.textContent = mmss(left);
      if (left <= 0 && !fired) {
        fired = true;
        clearTimer();
        t.style.color = 'var(--muted)';
        notify(label || 'That’s the stop.');
        if (onEnd) onEnd();
      }
    }
    timerHandle = setInterval(tick, 250);
    visHandler = tick;                       // resync the moment the screen comes back
    document.addEventListener('visibilitychange', visHandler);
    return t;
  }

  function notify(body) {
    try {
      if (window.Notification && Notification.permission === 'granted') {
        new Notification('Reroute', { body: body, icon: 'icon.svg' });
      }
    } catch (e) {}
  }
  function askNotify() {
    try {
      if (window.Notification && Notification.permission === 'default') Notification.requestPermission();
    } catch (e) {}
  }

  function uWiki(u) {
    shell(u.title, 'Read it or don’t. Either way it’s one article.');
    var box = el('div', 'card', '<p class="hint">finding one…</p>');
    stage.appendChild(box);
    // screened: re-draws past disasters, disease and violence before showing anything
    RB.fetchArticle().then(function (d) {
      box.innerHTML = '<h2>' + d.title + '</h2><p style="color:var(--ink)">' + d.extract + '</p>';
    });
    done('Finished');
  }

  function uDrill(u) {
    shell(u.title, 'One question. Answer in your head.');
    var d = RB.drill();
    var box = el('div', 'card');
    box.appendChild(el('h2', null, d.q));
    var ans = el('p', 'hint hidden', d.a);
    box.appendChild(ans);
    stage.appendChild(box);
    var rev = el('button', 'alt', '<span>Reveal</span>');
    rev.type = 'button';
    rev.addEventListener('click', function () { ans.classList.remove('hidden'); rev.classList.add('hidden'); });
    stage.appendChild(rev);
    done('Got it');
  }

  function uBreath(u) {
    shell(u.title, 'Two inhales through the nose, one long exhale through the mouth. ' + u.cycles + ' rounds.');
    var ball = el('div', 'breath', 'in');
    stage.appendChild(ball);
    var steps = [['in', 1.25, 2000], ['in again', 1.4, 1200], ['out, slowly', 0.75, 5000], ['', 0.75, 400]];
    var i = 0, round = 0;
    (function tick() {
      if (round >= u.cycles) { ball.textContent = 'done'; ball.style.transform = 'scale(1)'; return; }
      var s = steps[i];
      ball.textContent = s[0];
      ball.style.transform = 'scale(' + s[1] + ')';
      timerHandle = setTimeout(function () {
        i = (i + 1) % steps.length;
        if (i === 0) round++;
        tick();
      }, s[2]);
    })();
    done('Finished');
  }

  function uTimebox(u) {
    shell(u.title, u.note || 'The timer is the point.');
    askNotify();
    countdown(u.mins * 60, function () {
      var n = el('p', 'lead', 'That’s the stop. Put it down.');
      stage.insertBefore(n, stage.lastChild);
    });
    stage.appendChild(el('p', 'hint', 'Start it now, then put the phone down. Come back when it ends.'));
    done('Done');
  }

  function uMove(u) {
    shell(u.title, u.note || 'Leave the phone here.');
    countdown(u.mins * 60);
    done('Back');
  }

  function uText(u) {
    shell(u.title, u.prompt || '');
    var ta = el('textarea'); ta.rows = 5; ta.placeholder = 'Whatever’s there.';
    stage.appendChild(ta);
    ta.addEventListener('input', function () { RB.store.update(current.id, { unitText: ta.value }); });
    done('Done');
  }

  /* The Flinch: the text IS the intervention, so it comes first here and only here. */
  function uStep(u) {
    shell(u.title, 'You’re avoiding something specific. Name it — that’s most of the work.');
    var t1 = el('input'); t1.type = 'text'; t1.placeholder = 'What are you avoiding?';
    var t2 = el('input'); t2.type = 'text'; t2.placeholder = 'What’s the two-minute version?';
    stage.appendChild(t1); stage.appendChild(t2);
    var go = el('button', 'primary',
      '<span>Start five minutes on just that</span><span class="why">just the first step</span>');
    go.type = 'button';
    go.addEventListener('click', function () {
      RB.store.update(current.id, { avoiding: t1.value, firstStep: t2.value });
      shell('Five minutes', t2.value || t1.value || 'Just the first step.');
      countdown(5 * 60, function () {
        stage.insertBefore(el('p', 'lead', 'That’s five. Keep going or stop — both fine.'), stage.lastChild);
      });
      done('Done');
    });
    stage.appendChild(go);

    // The escape hatch stays quiet: on this lever the timer IS the intervention.
    var skip = el('button', 'ghost', 'Done without the timer');
    skip.type = 'button';
    skip.addEventListener('click', outcome);
    stage.appendChild(skip);
    var bail = el('button', 'ghost warnish', 'Open it anyway');
    bail.type = 'button';
    bail.addEventListener('click', openTarget);
    stage.appendChild(bail);
  }

  function uVoice(u) {
    var cfg = RB.store.config();
    shell(u.title, 'Not a text. Thirty seconds of your voice — it lands completely differently.');
    if (!cfg.contacts.length) {
      var inp = el('input'); inp.type = 'text'; inp.placeholder = 'Add three names (comma separated)';
      stage.appendChild(inp);
      var save = el('button', 'alt', '<span>Save</span>');
      save.type = 'button';
      save.addEventListener('click', function () {
        cfg.contacts = inp.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 3);
        RB.store.saveConfig(cfg);
        uVoice(u);
      });
      stage.appendChild(save);
    } else {
      var wrap = el('div', 'stack');
      cfg.contacts.forEach(function (n) {
        var b = el('button', 'alt', '<span>' + n + '</span>');
        b.type = 'button';
        b.addEventListener('click', function () { RB.store.update(current.id, { contact: n }); });
        wrap.appendChild(b);
      });
      stage.appendChild(wrap);
      stage.appendChild(el('p', 'hint', 'Open your messages, hold the mic, say what’s actually going on. Then come back.'));
    }
    done('Sent');
  }

  function uList(u) {
    var cfg = RB.store.config();
    shell(u.title, cfg.curiosity.length ? 'One of these. Written by you, when you weren’t craving.' :
      'Nothing on your list yet — add a few things you’ve been meaning to look into.');
    if (cfg.curiosity.length) {
      var pick = cfg.curiosity[Math.floor(Math.random() * cfg.curiosity.length)];
      stage.appendChild(el('div', 'card', '<h2>' + pick + '</h2>'));
    }
    var inp = el('input'); inp.type = 'text'; inp.placeholder = 'Add to the list';
    stage.appendChild(inp);
    inp.addEventListener('change', function () {
      if (!inp.value.trim()) return;
      cfg.curiosity.push(inp.value.trim()); RB.store.saveConfig(cfg); inp.value = '';
      inp.placeholder = 'Added. Another?';
    });
    done('Done');
  }

  /* ---------------- outcome + post-reward note ---------------- */
  function outcome() {
    clearTimer();
    eyebrow.innerHTML = 'Reroute · <b>one question</b>';
    stage.innerHTML = '';
    stage.appendChild(el('h1', null, 'Still want to <span class="hl">open it</span>?'));

    var no = el('button', 'primary', '<span>No — that did it</span>');
    no.type = 'button';
    no.addEventListener('click', function () {
      RB.store.update(current.id, { outcome: 'rerouted', endedAt: Date.now() });
      note();
    });
    stage.appendChild(no);

    var yes = el('button', 'alt', '<span>Yes, opening it</span>');
    yes.type = 'button';
    yes.style.marginTop = '10px';
    yes.addEventListener('click', openTarget);
    stage.appendChild(yes);
    stage.appendChild(el('p', 'hint', 'Either answer is useful. The log only works if it’s honest.'));
  }

  /* Text sits AFTER the reward, never before it — voluntary, and calmer. */
  function note() {
    var n = RB.store.events().length;
    if (n % 10 !== 0) return capture();
    stage.innerHTML = '';
    stage.appendChild(el('h1', null, 'One line, <span class="hl">if you want</span>'));
    stage.appendChild(el('p', null, 'What was actually going on just then? Skip it freely — this is optional.'));
    var ta = el('textarea'); ta.rows = 3;
    stage.appendChild(ta);
    var s = el('button', 'primary', '<span>Save</span>');
    s.type = 'button';
    s.addEventListener('click', function () { RB.store.update(current.id, { note: ta.value }); capture(); });
    stage.appendChild(s);
    var sk = el('button', 'ghost', 'Skip');
    sk.type = 'button';
    sk.addEventListener('click', capture);
    stage.appendChild(sk);
  }

  /* ---- day 13: move the people, not the messages ----
     The names collected here become the Ache lever's contact bank, so L6 stops
     asking anyone to invent a name at 11pm mid-craving. */
  function dmStep() {
    clearTimer();
    var cfg = RB.store.config();
    eyebrow.innerHTML = 'Reroute · <b>day 13 · messages</b>';
    stage.innerHTML = '';
    stage.appendChild(el('h1', null, 'Who <span class="hl">actually</span> messages you there?'));
    stage.appendChild(el('p', null,
      'Not followers — the people whose messages you’d genuinely miss. Three to eight names.'));

    var list = el('div', 'stack');
    function paint() {
      list.innerHTML = '';
      cfg.dm.people.forEach(function (name) {
        var sent = cfg.dm.sent.indexOf(name) > -1;
        var b = el('button', 'alt',
          '<span>' + (sent ? '✓ ' : '') + name + '</span>' +
          '<span class="p">' + (sent ? 'told' : 'tap when told') + '</span>');
        b.type = 'button';
        b.addEventListener('click', function () {
          if (sent) cfg.dm.sent.splice(cfg.dm.sent.indexOf(name), 1);
          else cfg.dm.sent.push(name);
          RB.store.saveConfig(cfg); paint();
        });
        list.appendChild(b);
      });
    }
    paint();
    stage.appendChild(list);

    if (cfg.dm.people.length < 8) {
      var inp = el('input'); inp.type = 'text'; inp.placeholder = 'Add a name';
      inp.addEventListener('change', function () {
        var v = inp.value.trim();
        if (v && cfg.dm.people.indexOf(v) === -1) {
          cfg.dm.people.push(v); RB.store.saveConfig(cfg);
          dmStep();   // full re-render: the message card and Done button are gated on people.length
        }
      });
      stage.appendChild(inp);
    }

    if (cfg.dm.people.length) {
      var msg = 'Coming off Instagram for a bit — I won’t see DMs there. ' +
                'WhatsApp is the best way to reach me.';
      var c = el('div', 'card');
      c.appendChild(el('p', 'q', 'Send them this'));
      c.appendChild(el('p', null, '“' + msg + '”'));
      c.appendChild(el('p', 'hint',
        'Send it directly, not as a Story — posting a Story is re-entry. ' +
        'Switching to a Creator account also lets you set an auto-reply, which covers everyone else.'));
      var copy = el('button', 'alt', '<span>Copy the message</span>');
      copy.type = 'button';
      copy.addEventListener('click', function () {
        if (navigator.clipboard) navigator.clipboard.writeText(msg).catch(function () {});
        copy.innerHTML = '<span>Copied</span>';
      });
      c.appendChild(copy);
      stage.appendChild(c);

      var fin = el('button', 'primary',
        '<span>Done — ' + cfg.dm.people.length + ' people moved</span>' +
        '<span class="why">these become your contacts for the lonely-at-11pm unit</span>');
      fin.type = 'button';
      fin.addEventListener('click', function () {
        cfg.dm.done = true;
        cfg.contacts = cfg.dm.people.slice(0, 3);
        RB.store.saveConfig(cfg);
        capture();
      });
      stage.appendChild(el('div', 'sp'));
      stage.appendChild(fin);
    }

    var back = el('button', 'ghost', 'Later');
    back.type = 'button';
    back.addEventListener('click', capture);
    stage.appendChild(back);
  }

  /* ---------------- insights ---------------- */
  function insights() {
    clearTimer();
    var ev = RB.store.events();
    eyebrow.innerHTML = 'Reroute · <b>' + ev.length + ' logged</b>';
    stage.innerHTML = '';
    stage.appendChild(el('h1', null, 'What the <span class="hl">log</span> says'));

    if (!ev.length) {
      stage.appendChild(el('p', null, 'Nothing yet. The first numbers appear after a day of use.'));
      stage.appendChild(el('div', 'sp'));
      return tabs('data');
    }

    var today = new Date().toDateString();
    var todays = ev.filter(function (e) { return new Date(e.ts).toDateString() === today; });
    var rerouted = ev.filter(function (e) { return e.outcome === 'rerouted'; }).length;
    var withPred = ev.filter(function (e) { return e.lever; });
    var hits = withPred.filter(function (e) { return e.lever === e.predicted; }).length;

    var s = el('div', 'stat');
    s.appendChild(el('div', null, '<span class="v">' + todays.length + '</span><span class="k">today</span>'));
    s.appendChild(el('div', null, '<span class="v">' + Math.round(rerouted / ev.length * 100) + '%</span><span class="k">rerouted</span>'));
    s.appendChild(el('div', null, '<span class="v">' +
      (withPred.length ? Math.round(hits / withPred.length * 100) : 0) + '%</span><span class="k">prediction hit</span>'));
    stage.appendChild(s);
    stage.appendChild(el('p', 'hint', 'Random guessing on seven levers would hit 14%.'));

    var counts = {}, max = 0;
    ev.forEach(function (e) { if (e.lever) { counts[e.lever] = (counts[e.lever] || 0) + 1; max = Math.max(max, counts[e.lever]); } });
    var c1 = el('div', 'card');
    c1.appendChild(el('p', 'q', 'Why you opened'));
    var bars = el('div', 'bars');
    RB.LEVERS.forEach(function (l) {
      var n = counts[l.id] || 0;
      bars.appendChild(el('div', 'bar',
        '<span class="t">' + l.label + '</span>' +
        '<span class="track"><span class="fill" style="width:' + (max ? n / max * 100 : 0) + '%"></span></span>' +
        '<span class="n">' + n + '</span>'));
    });
    c1.appendChild(bars);
    stage.appendChild(c1);

    var byHour = new Array(24).fill(0), hmax = 0;
    ev.forEach(function (e) { byHour[e.hour]++; hmax = Math.max(hmax, byHour[e.hour]); });
    var c2 = el('div', 'card');
    c2.appendChild(el('p', 'q', 'When'));
    var hb = el('div', 'bars');
    byHour.forEach(function (n, h) {
      if (!n) return;
      hb.appendChild(el('div', 'bar',
        '<span class="t">' + String(h).padStart(2, '0') + ':00</span>' +
        '<span class="track"><span class="fill" style="width:' + (n / hmax * 100) + '%"></span></span>' +
        '<span class="n">' + n + '</span>'));
    });
    c2.appendChild(hb);
    stage.appendChild(c2);

    stage.appendChild(backupCard(ev.length));
    var dmBtn = el('button', 'ghost',
      RB.store.config().dm.done ? 'Redo the messages step' : 'Messages step (day 13)');
    dmBtn.type = 'button';
    dmBtn.addEventListener('click', dmStep);
    stage.appendChild(dmBtn);
    var setupLink = el('a', 'ghost', 'Wire it to Instagram');
    setupLink.href = 'setup.html';
    stage.appendChild(setupLink);

    var tgt = RB.store.config().target;
    var toggle = el('button', 'alt',
      '<span class="row-item"><span class="t">Open Instagram in ' +
        (tgt === 'web' ? 'Safari' : 'the app') + '</span>' +
      '<span class="d">' + (tgt === 'web'
        ? 'The mobile site is a worse feed than the app. Tap to switch to the app.'
        : 'The app is the easier feed. Tap to switch to the browser.') + '</span></span>' +
      '<span class="p">' + (tgt === 'web' ? 'safari' : 'app') + '</span>');
    toggle.type = 'button';
    toggle.addEventListener('click', function () {
      var c = RB.store.config();
      c.target = c.target === 'web' ? 'app' : 'web';
      RB.store.saveConfig(c);
      insights();
    });
    stage.appendChild(toggle);

    var lc = RB.store.config().lock;
    var lockCard = el('div', 'card');
    lockCard.appendChild(el('p', 'q', 'Focus lock'));
    lockCard.appendChild(el('p', 'hint',
      'Reroute can’t set a Screen Time limit — no website can. It can run a Shortcut, ' +
      'and that Shortcut can switch on a Focus whose Home Screen has no Instagram on it.'));
    var nameIn = el('input'); nameIn.type = 'text';
    nameIn.placeholder = 'Shortcut name'; nameIn.value = lc.shortcut || '';
    nameIn.addEventListener('change', function () {
      var c = RB.store.config(); c.lock.shortcut = nameIn.value.trim(); RB.store.saveConfig(c);
    });
    lockCard.appendChild(nameIn);
    var autoBtn = el('button', 'alt',
      '<span class="row-item"><span class="t">' + (lc.auto ? 'Runs automatically' : 'Only when I tap it') + '</span>' +
      '<span class="d">' + (lc.auto
        ? 'Fires once, the first time you run out for the day.'
        : 'Offered on the out-of-budget screen, never forced.') + '</span></span>' +
      '<span class="p">' + (lc.auto ? 'auto' : 'manual') + '</span>');
    autoBtn.type = 'button';
    autoBtn.addEventListener('click', function () {
      var c = RB.store.config(); c.lock.auto = !c.lock.auto; RB.store.saveConfig(c); insights();
    });
    lockCard.appendChild(autoBtn);
    var testBtn = el('button', 'ghost', 'Test it now');
    testBtn.type = 'button';
    testBtn.addEventListener('click', fireLock);
    lockCard.appendChild(testBtn);
    stage.appendChild(lockCard);
    stage.appendChild(el('div', 'sp'));
    tabs('data');
  }

  /* The log lives in one browser's storage. Backup is the safety net, not a nicety. */
  function backupCard(n) {
    var c = el('div', 'card');
    c.appendChild(el('p', 'q', 'Your data'));

    var persisted = RB.storageState.persisted;
    c.appendChild(el('p', 'hint',
      persisted === true
        ? 'Storage is marked persistent on this device — ' + n + ' events held.'
        : 'This browser has <strong>not</strong> guaranteed your storage. Add Reroute to your home ' +
          'screen, and export a backup now and then — otherwise the log can be cleared without warning.'));

    var row = el('div', 'stack');

    var exp = el('button', 'alt', '<span>Export backup</span><span class="p">json</span>');
    exp.type = 'button';
    exp.addEventListener('click', function () {
      var text = RB.store.exportJSON();
      var name = 'reroute-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      try {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        a.download = name; a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      } catch (e) {}
      if (navigator.clipboard) navigator.clipboard.writeText(text).catch(function () {});
      exp.innerHTML = '<span>Saved — also copied to clipboard</span>';
    });
    row.appendChild(exp);

    var file = el('input'); file.type = 'file'; file.accept = 'application/json'; file.className = 'hidden';
    var imp = el('button', 'alt', '<span>Restore from backup</span>');
    imp.type = 'button';
    imp.addEventListener('click', function () { file.click(); });
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var total = RB.store.importJSON(String(r.result));
          imp.innerHTML = '<span>Restored — ' + total + ' events</span>';
          setTimeout(insights, 900);
        } catch (e) {
          imp.innerHTML = '<span style="color:var(--warn)">That file isn’t a Reroute backup</span>';
        }
      };
      r.readAsText(f);
    });
    row.appendChild(imp);
    row.appendChild(file);
    c.appendChild(row);
    return c;
  }

  function tabs(on) {
    var n = el('nav', 'tabs');
    [['log', 'Urge', capture], ['data', 'Log', insights]].forEach(function (t) {
      var a = el('a', t[0] === on ? 'on' : '', t[1]);
      a.href = '#'; a.addEventListener('click', function (e) { e.preventDefault(); t[2](); });
      n.appendChild(a);
    });
    stage.appendChild(n);
  }

  window.addEventListener('DOMContentLoaded', function () {
    stage = document.getElementById('stage');
    eyebrow = document.getElementById('eyebrow');
    RB.requestPersistence();
    if (!RB.store.intake()) { location.replace('intake.html'); return; }

    // Arrived from the Shortcut, moments after deciding to go through? Let it
    // pass. Being re-asked 30 seconds after a conscious decision is nagging,
    // and on iOS versions where the trigger also fires on foregrounding it
    // would otherwise ping-pong between the two apps forever.
    if (/[?&]src=auto/.test(location.search) && RB.store.graceLeft() > 0) {
      goToInstagram();
      return;
    }
    pendingSession = RB.store.reconcileSession();
    capture();
  });
})();
