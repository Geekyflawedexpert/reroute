# Reroute

A reroute engine, not a blocker. It never prevents you opening Instagram — it
intercepts the urge, asks one question, hands over exactly one thing, and logs
what preceded it. Everything stays in `localStorage` on the device.

Spec: the Reroute Protocol artifact (levers, phases, metrics, build order).

## Run it

Any static server. From this directory:

```bash
python3 -m http.server 8000
```

Then `http://localhost:8000/intake.html`. On a phone, use your Mac's LAN IP and
add it to the home screen — the manifest and service worker make it standalone
and offline-capable. (A service worker needs `localhost` or HTTPS; opening the
files directly via `file://` works for everything except offline caching.)

## Wire it to the urge

The app is fed by the OS, so there is no shield, no entitlement and no
accessibility service.

**iPhone** — Shortcuts → Automation → New → App → Instagram → *Is Opened* →
turn **off** "Ask Before Running" → action *Open URLs* → your Reroute URL.
Every Instagram launch now lands here first.

**Android** — the same via a Tasker profile (Application → Instagram → Browse URL),
or a launcher shortcut in place of the Instagram icon.

`?src=notif` on the URL marks an open that came from a notification; the
predictor treats that as a signal for The Ache.

## Files

| | |
|---|---|
| `intake.html` / `intake.js` | **v0** — eight questions, ~90s, standalone. Testable on strangers before any logging exists. |
| `index.html` / `app.js` | **v1** — capture, dispense, outcome, insights. |
| `levers.js` | The seven levers, their button copy, and the unit banks. |
| `prior.js` | Cold-start prediction. Context prior × intake prior × session signals, then a Dirichlet posterior. |
| `store.js` | Event log, config, programme day/phase. |

## How prediction works with no data

There is no zero-data case. `RB.predict()` stacks three priors that all exist
before event #1 — an hour × lever table (the clock is the best predictor you have
when you know nothing about the person), the intake weights, and free session
signals (first unlock of the day, minutes since the last one, weekend, calendar
block running, arrived-from-notification). Personal counts then enter as a
Dirichlet posterior seeded with `ALPHA = 5` pseudo-observations, so the prior is
outvoted gradually rather than switched off. Measured behaviour:

```
BRAND NEW USER — no intake, no events
  23:00 weekday                  crash 32%   ache 17%   void 15%   [prior]
  11:00 weekday                  flinch 32%  gap 25%    buzz 11%   [prior]
  15:00 + work block running     flinch 47%  gap 18%    void 10%   [prior]
  09:00 first unlock of day      gap 49%     flinch 14% void 12%   [prior]

AFTER 30 EVENTS in the 23:00 bucket saying Ache
  23:00 weekday                  ache 66%    crash 12%  void 6%    [personal]
```

The prediction only pre-selects; one tap corrects it. Every correction is free
labelled training data, and the hit rate is shown on the Log tab against the 14%
a random guess would get.

## Deliberately not built yet

- **v2** — risk map, `.ics` calendar occupation, phase engine, escalation on the worst window
- **v3** — contextual bandit for unit selection, off-phone bias in phase 3, graduation + relapse protocol

Both need v1 data to be worth anything. Building them early means guessing.

## Two rules that are load-bearing

1. **Single serving.** A unit hands over one thing and ends. Never launch into
   Spotify or Chess.com — that relocates the addiction instead of replacing it.
2. **The Flinch gets no reward.** L2 dispenses a two-minute task step, not a
   treat. Serving something pleasant to an avoidant user reinforces the avoidance.
