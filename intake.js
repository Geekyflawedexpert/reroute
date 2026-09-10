/* intake.js — v0. Eight questions, ~90 seconds, zero data required.
   Output is a named read plus the per-lever weights that seed the predictor. */
var RB = window.RB || {};

RB.QUESTIONS = [
  { q:'It’s fifteen minutes before something you’ve been putting off. Where’s your phone?',
    a:[['In my hand already',{flinch:3}],
       ['I check it "one last time" first',{flinch:2,gap:1}],
       ['Face down — that’s when I focus',{flinch:0}]] },

  { q:'You’ve just closed the laptop after a long stretch of work. First instinct?',
    a:[['Scroll. I’ve earned it',{payout:3}],
       ['Get up, move around',{payout:0,gap:1}],
       ['Straight into the next thing',{payout:0}]] },

  { q:'Lights off, in bed, genuinely tired. What actually happens?',
    a:[['Half an hour goes missing',{crash:3}],
       ['A quick check, then sleep',{crash:1}],
       ['Phone isn’t in the room',{crash:0}]] },

  { q:'An empty hour. Nothing scheduled, nobody around.',
    a:[['That’s my worst hour',{void:3}],
       ['I’ll find something eventually',{void:1}],
       ['I like empty hours',{void:0}]] },

  { q:'How often do you find the phone already in your hand, without deciding to pick it up?',
    a:[['Constantly — I don’t catch it happening',{gap:3}],
       ['A few times a day',{gap:2}],
       ['Rarely',{gap:0}]] },

  { q:'When you open Instagram, what do you check first?',
    a:[['Messages, always',{ache:3}],
       ['Depends who’s posted',{ache:2,void:1}],
       ['Straight to the feed',{ache:0,void:1}]] },

  { q:'Chest tight, mind going too fast, can’t settle. Phone?',
    a:[['Immediately — it’s the only thing that quiets it',{buzz:3}],
       ['Sometimes',{buzz:1}],
       ['No, that makes it worse',{buzz:0}]] },

  { q:'Afterwards, the strongest feeling is:',
    a:[['Relief',{flinch:2,buzz:1}],
       ['Emptiness',{void:2,ache:1}],
       ['Guilt about the time',{payout:1,gap:1}],
       ['Nothing at all',{gap:2,crash:1}]] }
];

RB.HEADLINES = {
  flinch:'You scroll to postpone.',
  void:  'You scroll to fill.',
  buzz:  'You scroll to come down.',
  crash: 'You scroll to switch off.',
  gap:   'You scroll on autopilot.',
  ache:  'You scroll to be near people.',
  payout:'You scroll as payment.'
};

RB.READS = {
  flinch:'Your opens cluster around things you don’t want to start. That means a pleasant substitute is the wrong answer for you — it rewards the dodge and the task is still there afterwards. What works is shrinking the task until starting it costs less than avoiding it.',
  void:  'Your opens cluster in unstructured time. The feed is winning on novelty, so the replacement has to be novel too — and it has to end on its own, which the feed never does.',
  buzz:  'Your opens follow a spike in activation. You’re not seeking entertainment, you’re seeking an off switch. That means anything stimulating will make it worse; the body has to come down first.',
  crash: 'Your opens land when you’re already spent. This isn’t a discipline problem and treating it like one backfires. You need rest that isn’t a feed, and permission to take it.',
  gap:   'Your opens happen in the seconds between tasks, before any feeling arrives. There’s nothing to reflect on — it’s motor habit — so the fix is physical distance, not willpower.',
  ache:  'Your opens are about contact. Nothing solitary will substitute for that, which is why generic screen-time apps have failed you. The replacement has to involve an actual person.',
  payout:'Your opens are a reward you’ve decided you’re owed — and you’re usually right. Denying an earned break produces a binge. The design isn’t refusal, it’s a hard stop.'
};

/* Asked after the eight scoring questions. This is the destination, not a lever —
   it sets the daily budget and it is where the eliminate/limit fork lives. */
RB.GOALS = [
  { mode:'eliminate', label:'Off it completely',
    sub:'The budget tapers to nothing by day 21.', mins:20 },
  { mode:'limit', label:'A set amount each day',
    sub:'You pick the number. It stays put.', mins:30, asksMinutes:true },
  { mode:'dms', label:'Messages only, no feed',
    sub:'Browser, one short window a day.', mins:15 },
  { mode:'unsure', label:'Not sure yet',
    sub:'Start at 30 minutes. Decide by day 14, on real data.', mins:30 }
];

RB.score = function (answers) {
  var w = {}; RB.LEVERS.forEach(function (l) { w[l.id] = 0; });
  answers.forEach(function (ai, qi) {
    var delta = RB.QUESTIONS[qi].a[ai][1];
    for (var k in delta) w[k] += delta[k];
  });
  var ranked = Object.keys(w).sort(function (a, b) {
    if (w[b] !== w[a]) return w[b] - w[a];
    return a === 'flinch' ? -1 : b === 'flinch' ? 1 : 0;
  });
  return { weights: w, primary: ranked[0], secondary: ranked[1], ranked: ranked, ts: Date.now() };
};

window.RB = RB;
