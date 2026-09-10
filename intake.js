/* intake.js — v0. Eight questions, ~90 seconds, zero data required.
   Output is a named read plus the per-lever weights that seed the predictor. */
var RB = window.RB || {};

/* Five forced-choice questions instead of eight rating ones.
   Rating a single lever per question wastes a question on one hypothesis;
   making the user CHOOSE between four levers discriminates four at a time,
   so four questions carry more signal than eight did, in half the taps.
   Ties break toward Flinch, per the asymmetric costs in the spec. */
RB.QUESTIONS = [
  { q:'Think about the last few times you opened it. What had just happened?',
    a:[['I’d finished something and hadn’t started the next thing', {gap:3}],
       ['Nothing — there was just empty time',                      {void:3}],
       ['I was about to start something I didn’t want to do',       {flinch:3}],
       ['I’d been going hard and felt owed a break',                {payout:3}]] },

  { q:'And when it isn’t that — what’s underneath it?',
    a:[['Restless, keyed up, can’t settle',   {buzz:3}],
       ['Flat and tired, nothing left',       {crash:3}],
       ['A bit alone, wanting people around', {ache:3}],
       ['Genuinely nothing. I just do it',    {gap:2, void:1}]] },

  { q:'Which would be hardest to give up?',
    a:[['Knowing what everyone’s up to',        {ache:3}],
       ['Something to do when there’s nothing', {void:3}],
       ['The way it switches my brain off',     {crash:2, buzz:1}],
       ['The break after I’ve worked',          {payout:3}]] },

  { q:'Worst time of day for it?',
    a:[['In bed, before sleep',        {crash:3}],
       ['Mid-task, all day long',      {gap:3}],
       ['Right before something hard', {flinch:3}],
       ['When I’m wound up',           {buzz:3}]] }
];

RB.HEADLINES = {
  flinch:'You scroll to <span class="hl">postpone</span>',
  void:  'You scroll to <span class="hl">fill</span>',
  buzz:  'You scroll to <span class="hl">come down</span>',
  crash: 'You scroll to <span class="hl">switch off</span>',
  gap:   'You scroll on <span class="hl">autopilot</span>',
  ache:  'You scroll to <span class="hl">be near people</span>',
  payout:'You scroll as <span class="hl">payment</span>'
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
