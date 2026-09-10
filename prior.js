/* prior.js — cold-start prediction.
   There is no "no data" case. Three priors stack before event #1, then a
   Dirichlet posterior lets the user's own behaviour outvote them gradually.
   Vector order is always RB.LEVERS order. */
var RB = window.RB || {};

/* ---- Layer 1: context prior. With nothing else, the clock is the best
   predictor you have. Rows are unnormalised weights. ---- */
RB.BUCKETS = [
  { id:'late',  label:'23:00–02:00', test:function(h){ return h>=23||h<2; } },
  { id:'small', label:'02:00–06:00', test:function(h){ return h>=2 &&h<6;  } },
  { id:'morn',  label:'06:00–10:00', test:function(h){ return h>=6 &&h<10; } },
  { id:'mid',   label:'10:00–14:00', test:function(h){ return h>=10&&h<14; } },
  { id:'aft',   label:'14:00–18:00', test:function(h){ return h>=14&&h<18; } },
  { id:'eve',   label:'18:00–21:00', test:function(h){ return h>=18&&h<21; } },
  { id:'night', label:'21:00–23:00', test:function(h){ return h>=21&&h<23; } }
];

/*            void flinch buzz crash  gap  ache payout */
RB.CONTEXT = {
  late:  [ 1.4,  0.5,  1.2,  3.0,  0.8,  1.6,  1.0 ],
  small: [ 1.0,  0.3,  1.8,  2.6,  0.6,  1.2,  0.4 ],
  morn:  [ 1.2,  1.4,  0.9,  0.7,  2.6,  0.7,  0.5 ],
  mid:   [ 0.9,  2.8,  1.0,  0.5,  2.2,  0.6,  0.7 ],
  aft:   [ 1.3,  2.4,  1.0,  0.9,  2.4,  0.7,  1.1 ],
  eve:   [ 1.6,  1.0,  0.9,  1.2,  1.2,  1.4,  2.2 ],
  night: [ 1.5,  0.6,  1.0,  1.8,  0.9,  1.5,  2.4 ]
};

RB.bucketFor = function (h) {
  for (var i = 0; i < RB.BUCKETS.length; i++) if (RB.BUCKETS[i].test(h)) return RB.BUCKETS[i].id;
  return 'aft';
};

/* ---- Layer 2: session signals. All free, none learned. ---- */
RB.sessionAdjust = function (v, ctx) {
  var out = v.slice();
  function bump(id, f) { out[RB.IDX[id]] *= f; }
  if (ctx.weekend)                      { bump('flinch',0.55); bump('void',1.4); bump('ache',1.3); }
  if (ctx.firstUnlockOfDay)             { bump('gap',1.9);     bump('crash',0.6); }
  if (ctx.minsSinceLast != null) {
    if (ctx.minsSinceLast < 3)          { bump('gap',2.2);     bump('void',0.7); }
    else if (ctx.minsSinceLast > 90)    { bump('void',1.5); }
  }
  if (ctx.workBlockRunning)             { bump('flinch',2.6);  bump('crash',0.5); }
  if (ctx.fromNotification)             { bump('ache',2.0);    bump('gap',0.6); }
  return out;
};

/* ---- Layer 3: intake weights (from the 8-question questionnaire) ---- */
RB.applyIntake = function (v, intake) {
  if (!intake || !intake.weights) return v.slice();
  return v.map(function (x, i) {
    var w = intake.weights[RB.LEVERS[i].id] || 0;
    return x * (1 + w / 3);          // score 0–3 → multiplier 1.0–2.0
  });
};

/* ---- Dirichlet–multinomial posterior. Pseudo-counts come from the stacked
   prior, so this IS the cold-start path — no branch, no switchover. ---- */
RB.ALPHA = 5;                        // prior worth ~5 observations per bucket

RB.predict = function (ctx, intake, counts) {
  var base   = RB.CONTEXT[RB.bucketFor(ctx.hour)] || RB.CONTEXT.aft;
  var withI  = RB.applyIntake(base, intake);
  var withS  = RB.sessionAdjust(withI, ctx);
  var sum    = withS.reduce(function (a, b) { return a + b; }, 0);
  var prior  = withS.map(function (x) { return x / sum; });

  var bucket = RB.bucketFor(ctx.hour);
  var obs    = (counts && counts[bucket]) || [];
  var post   = prior.map(function (p, i) { return RB.ALPHA * p + (obs[i] || 0); });
  var ptot   = post.reduce(function (a, b) { return a + b; }, 0);

  var ranked = RB.LEVERS.map(function (l, i) {
    return { id: l.id, p: post[i] / ptot };
  }).sort(function (a, b) {
    if (Math.abs(b.p - a.p) > 1e-9) return b.p - a.p;
    return a.id === 'flinch' ? -1 : b.id === 'flinch' ? 1 : 0;  // ties break to Flinch
  });

  var n = obs.reduce(function (a, b) { return a + b; }, 0);
  return { ranked: ranked, bucket: bucket, observations: n,
           leaning: n < RB.ALPHA * 2 ? 'prior' : n < RB.ALPHA * 6 ? 'mixed' : 'personal' };
};

window.RB = RB;
