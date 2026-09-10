/* levers.js — the taxonomy. Internal ids stay internal; `label` is what a
   person sees at 11pm. Order is fixed: it defines every vector's index. */
var RB = window.RB || {};

RB.LEVERS = [
  { id:'void',   name:'The Void',   label:'Bored',                  sub:'empty time, nothing on' },
  { id:'flinch', name:'The Flinch', label:'Avoiding something',     sub:'there’s a thing I don’t want to start' },
  { id:'buzz',   name:'The Buzz',   label:'Wired, can’t settle',    sub:'tight chest, racing' },
  { id:'crash',  name:'The Crash',  label:'Wiped out',              sub:'nothing left today' },
  { id:'gap',    name:'The Gap',    label:'Just picked it up',      sub:'didn’t decide to' },
  { id:'ache',   name:'The Ache',   label:'Want to talk to someone',sub:'a bit alone' },
  { id:'payout', name:'The Payout', label:'Earned a break',         sub:'I’ve put the work in' }
];

RB.IDX = RB.LEVERS.reduce(function (m, l, i) { m[l.id] = i; return m; }, {});
RB.lever = function (id) { return RB.LEVERS[RB.IDX[id]]; };

/* Unit banks. Every unit is single-serving: it hands over one thing and ends.
   Nothing here needs a licence or a network call we can't make offline. */
RB.UNITS = {
  void: [
    { id:'wiki',      type:'wiki',   title:'One random article',   note:'Read it or don’t. Then it’s over.' },
    { id:'drill-v',   type:'drill',  title:'One drill',            note:'Right or wrong in five seconds.' },
    { id:'song-v',    type:'timebox',title:'One song, standing up',mins:4, note:'Loud. On your feet.' },
    { id:'curio',     type:'list',   title:'Something off your list', listKey:'curiosity' }
  ],
  flinch: [
    { id:'decompose', type:'step',   title:'Name it, then shrink it' }
  ],
  buzz: [
    { id:'sigh',      type:'breath', title:'Physiological sigh',   cycles:6 },
    { id:'cold',      type:'move',   title:'Cold water on your face', mins:1, note:'Thirty seconds. Then come back.' },
    { id:'dump',      type:'text',   title:'Put the worry on paper', prompt:'What’s actually circling?' }
  ],
  crash: [
    { id:'album',     type:'timebox',title:'One album side',       mins:20, note:'Lie down. This is allowed.' },
    { id:'pod',       type:'timebox',title:'Podcast, sleep timer', mins:15, note:'Timer set before you start.' }
  ],
  gap: [
    { id:'stand',     type:'move',   title:'Stand up, refill water', mins:2, note:'Phone stays here.' },
    { id:'window',    type:'move',   title:'Look out a window',      mins:1, note:'Middle distance. That’s it.' }
  ],
  ache: [
    { id:'voice',     type:'voice',  title:'Send one voice note' }
  ],
  /* Payout dispenses a bounded OBJECT, not a duration. "One episode" ends by
     itself; twenty minutes of a feed never does. Structure beats a notification
     arriving at the exact moment attention is lowest. */
  payout: [
    { id:'episode', type:'artifact', title:'One episode',        mins:26, tier:'full', note:'Pick it before you press play. It ends when it ends.' },
    { id:'side',    type:'artifact', title:'One album side',     mins:20, tier:'full', note:'Side A. Then it’s over on its own.' },
    { id:'outside', type:'artifact', title:'Twenty minutes outside', mins:20, tier:'full', note:'Take the break, just not through a screen.' },
    { id:'rush',    type:'artifact', title:'One Puzzle Rush run',mins:5,  tier:'short',note:'Three minutes, and it stops itself.' },
    { id:'onesong', type:'artifact', title:'One song',           mins:4,  tier:'short',note:'Loud. Then back.' }
  ]
};

/* Payout is the only lever whose unit depends on whether the claim holds up.
   Never refused — refusing an earned break is how you produce a binge — but
   never free either, or it becomes the cheap item on the menu. */
RB.payoutUnits = function (corroborated) {
  var tier = corroborated ? 'full' : 'short';
  return RB.UNITS.payout.filter(function (u) { return u.tier === tier; });
};

/* Drill bank for the Void. Mental math is generated; the rest are state-definition
   prompts, which are answered in your head — the point is the retrieval, not a score. */
RB.drill = function () {
  var kind = Math.random();
  if (kind < 0.6) {
    var a = 12 + Math.floor(Math.random() * 88);
    var b = 12 + Math.floor(Math.random() * 88);
    return { q: a + ' × ' + b, a: String(a * b) };
  }
  var prompts = [
    ['Longest increasing subsequence', 'f(i) = length of the LIS ending exactly at index i'],
    ['Coin change, min coins', 'f(a) = fewest coins summing to exactly a'],
    ['House robber', 'f(i) = max loot from houses 0..i with i optionally taken'],
    ['Edit distance', 'f(i,j) = edits to turn a[0..i) into b[0..j)'],
    ['Kadane', 'f(i) = max subarray sum ending exactly at i']
  ];
  var p = prompts[Math.floor(Math.random() * prompts.length)];
  return { q: 'Define the state: ' + p[0], a: p[1] };
};

window.RB = RB;
