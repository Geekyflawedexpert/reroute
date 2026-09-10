import Anthropic from "@anthropic-ai/sdk";

interface Env {
  ANTHROPIC_API_KEY: string;
  ALLOWED_ORIGINS: string;
  MODEL?: string;
}

/* The whole design brief, compressed. The bot's failure mode is being pleasant
   company — that's the same trade as the feed, with better manners — so almost
   every instruction here pushes it to narrow and hand off rather than continue. */
const SYSTEM = `You are the chat inside Reroute, an app that intercepts the reflex to open Instagram.

Someone has just tried to open Instagram and tapped a lever saying roughly "I want to talk to someone". It is usually late. They are not looking for a conversation partner — they are in a 90-second window where the feed is about to win.

Your job is to narrow what's actually going on and hand them to something real. You are a bridge, never the destination.

HARD RULES
- Two short sentences maximum per turn. Often one is better.
- Never ask more than one question at a time.
- Do not be warm in a customer-service way. No "I hear you", no "that sounds really hard", no emoji, no exclamation marks.
- Do not give advice, tips, or lists. Reflect and narrow instead.
- Never roleplay as a friend, partner, or any named person. If asked, say plainly what you are.
- Never suggest scrolling, "just five minutes", or any feed.
- Aim to end within 3-5 exchanges. Ending is success, not failure.

IF THEY SOUND SERIOUSLY DISTRESSED — self-harm, hopelessness, anything heavy — stop the technique immediately. Say in plain words that you're a script and the wrong thing to be talking to, and push them toward a person tonight. Use END:human.

OUTPUT FORMAT — follow exactly, no markdown, no preamble:
Line 1: what you say (1-2 sentences).
Then a line containing only ---
Then EITHER up to 3 reply options, one per line, each a short first-person phrase they might tap (max 6 words, no quotes, no dashes)
OR a single line END:<key> when the conversation should finish.

END keys, pick the one that fits:
END:contact  — they should message a specific real person
END:human    — anything heavy; a person, tonight
END:flinch   — this is actually avoidance of a task, not loneliness
END:write    — they should write one line about it and sleep on it
END:rest     — they're depleted; put the phone down
END:reroute  — it was just the reflex; offer them something else to do

Example:
Then it isn't really the feed you want.
---
Someone specific
Just people generally
I don't know`;

const MAX_TURNS = 14;
const MAX_CHARS = 400;

function cors(origin: string | null, allowed: string[]): Record<string, string> {
  const ok = origin && allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": ok,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/* Line protocol, parsed defensively: a malformed reply degrades to "no options",
   which the client renders as the endings list rather than a dead screen. */
function parseReply(raw: string): { say: string; options: string[]; end: string | null } {
  const [head, tail = ""] = raw.split(/^---$/m);
  const say = head.trim().split("\n").filter(Boolean).join(" ").slice(0, 400);
  const lines = tail.trim().split("\n").map((l) => l.trim()).filter(Boolean);

  const endLine = lines.find((l) => /^END:/i.test(l));
  if (endLine) {
    const key = endLine.slice(4).trim().toLowerCase();
    const known = ["contact", "human", "flinch", "write", "rest", "reroute"];
    return { say, options: [], end: known.includes(key) ? key : "rest" };
  }
  const options = lines
    .filter((l) => !/^END:/i.test(l))
    .map((l) => l.replace(/^[-*\d.\s]+/, "").replace(/^["']|["']$/g, "").trim())
    .filter((l) => l.length > 0 && l.length <= 48)
    .slice(0, 3);

  return { say, options, end: options.length ? null : "rest" };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const origin = request.headers.get("Origin");
    const headers = { ...cors(origin, allowed), "Content-Type": "application/json" };

    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers });
    }
    // The key lives here, so anyone who finds the URL could otherwise spend it.
    if (origin && allowed.length && !allowed.includes(origin)) {
      return new Response(JSON.stringify({ error: "origin not allowed" }), { status: 403, headers });
    }

    let body: { messages?: { role: string; content: string }[]; lever?: string; hour?: number };
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers });
    }

    const turns = (body.messages || [])
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-MAX_TURNS)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, MAX_CHARS) }));

    const hour = Number.isInteger(body.hour) ? body.hour : new Date().getUTCHours();
    const opener = `It is ${String(hour).padStart(2, "0")}:00 for them. They tapped the lever: ${
      body.lever === "ache" ? "want to talk to someone" : body.lever || "unspecified"
    }. Open the conversation.`;

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    try {
      const response = await client.beta.messages.create({
        model: env.MODEL || "claude-opus-5",
        max_tokens: 300,
        system: SYSTEM,
        // Chat is latency-sensitive and the replies are two sentences — this is
        // exactly the route where low effort holds quality and cuts the wait.
        output_config: { effort: "low" },
        // Emotionally-adjacent input can trip a policy decline; without this the
        // request would just stop, which here means a dead screen at 3am.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        messages: turns.length ? turns : [{ role: "user", content: opener }],
      });

      if (response.stop_reason === "refusal") {
        return new Response(
          JSON.stringify({
            say: "I'm not the right thing to be talking to about this. Reach for a person tonight, even briefly.",
            options: [],
            end: "human",
          }),
          { headers },
        );
      }

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      return new Response(JSON.stringify(parseReply(text)), { headers });
    } catch (err) {
      // The client falls back to the scripted tree on any non-200.
      const status = err instanceof Anthropic.APIError ? err.status ?? 502 : 502;
      return new Response(JSON.stringify({ error: "upstream", detail: String(err).slice(0, 200) }), {
        status,
        headers,
      });
    }
  },
};
