# reroute-chat worker

Proxies the 3am chat to Claude. Exists so the API key lives on Cloudflare rather
than in a public static page — anything in `chat.js` is readable by anyone.

The app works without this. Empty worker URL = the scripted tree in `chat.js`:
offline, instant, free. This only swaps who writes the replies.

## Deploy

```bash
cd ~/reroute/worker
npm install
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY    # paste the key when prompted
npx wrangler deploy
```

`wrangler deploy` prints a URL like `https://reroute-chat.<you>.workers.dev`.
Paste it into Reroute → **Log** tab → **Chat**.

## Configuration

`wrangler.toml`:

- `ALLOWED_ORIGINS` — origins permitted to call this. Anything else gets a 403,
  so a script that finds the URL can't spend your key. Add your Pages origin.
- `MODEL` — `claude-opus-5` by default. `claude-sonnet-5` is cheaper and a touch
  faster if you'd rather trade.

`ANTHROPIC_API_KEY` is a **secret**, never a var — `wrangler secret put`, never
`wrangler.toml`, which is committed.

## Cost

Replies are two sentences and the system prompt is ~500 tokens, so a full
conversation is roughly 2-4k tokens. At Opus 5 rates that's well under a cent
per conversation. Cloudflare's free tier covers 100k requests/day.

## Request / response

```
POST /
{ "messages": [{ "role": "user", "content": "..." }], "lever": "ache", "hour": 3 }

200
{ "say": "Then it isn't really the feed you want.",
  "options": ["Someone specific", "Just people generally"],
  "end": null }
```

`end` is one of `contact | human | flinch | write | rest | reroute`, matching
`RB.CHAT_ENDS` in the client. Any non-200 makes the client fall back to the
scripted tree mid-conversation, without the user seeing a break.

## Design notes

The system prompt fights one failure mode: being pleasant company. That's the
same trade as the feed with better manners, so nearly every instruction pushes
it to narrow and hand off — two sentences, one question, no advice, end within
3-5 exchanges. Anything heavy short-circuits to `END:human` with the bot saying
plainly what it is.

`effort: "low"` because chat is latency-sensitive and the replies are short —
this is the route where low effort holds quality and cuts the wait. Refusal
fallbacks are on: emotionally-adjacent input can trip a policy decline, and
without them the request would just stop, which at 3am means a dead screen.
