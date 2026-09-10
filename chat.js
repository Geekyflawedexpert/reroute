/* chat.js — the Ache unit.
   Scripted, not an LLM: it runs offline, answers instantly, costs nothing, and
   never ships someone's 3am loneliness to an API. Replies are taps, not typing,
   for the same reason every other capture in this app is — nobody composes
   sentences mid-craving.

   The bot's job is to narrow, not to advise, and to hand off. It is a bridge to
   a person, never the destination. */
var RB = window.RB || {};

RB.CHAT_OPENER = 'still up';

RB.CHAT = {
  start: {
    say: ['Still up.', 'What’s actually going on?'],
    opts: [
      ['Nothing. Just reaching for it', 'reflex'],
      ['Feel a bit alone', 'alone'],
      ['Something happened today', 'happened'],
      ['I’m avoiding something', 'avoid']
    ]
  },

  reflex: {
    say: ['Fair. Most of them are that.', 'Is there anything underneath it, or is it genuinely just the reach?'],
    opts: [
      ['Genuinely just the reach', 'justreach'],
      ['Something underneath', 'alone'],
      ['I’m tired, mostly', 'tired']
    ]
  },
  justreach: {
    say: ['Then it’s a hand looking for something to do, not a feeling.',
          'Those pass in about ninety seconds if you give them literally anything else.'],
    end: 'reroute'
  },
  tired: {
    say: ['That’s not a scrolling problem then.',
          'Scrolling tired is how you end up more tired and later. Nobody has ever finished and felt rested.'],
    end: 'rest'
  },

  alone: {
    say: ['Yeah. That’s the one the feed is best at faking.',
          'You get faces and voices and none of it reaches you. Is it people generally, or someone specific?'],
    opts: [
      ['Someone specific', 'specific'],
      ['Just generally', 'general'],
      ['It’s heavier than that', 'heavy']
    ]
  },
  specific: {
    say: ['Then the feed definitely won’t do it.',
          'You don’t have to say anything big. "Was thinking about you" at 3am is a complete message.'],
    end: 'contact'
  },
  general: {
    say: ['That kind doesn’t get solved at 3am, and scrolling makes it louder — everyone else looks connected.',
          'Smallest real thing beats the biggest fake one. One message you can send now?'],
    opts: [
      ['Alright, one message', 'contact'],
      ['Not tonight', 'notonight']
    ]
  },
  notonight: {
    say: ['Fine. Then don’t spend the next hour watching other people have friends.',
          'Put it down and let tomorrow be the day you message someone.'],
    end: 'rest'
  },
  heavy: {
    say: ['Then I’m the wrong thing to be talking to, and I’d rather say that than pretend.',
          'I’m a script. Genuinely — reach for a person tonight, even briefly.'],
    end: 'human'
  },

  happened: {
    say: ['Right. And scrolling is a decent anaesthetic — it does work, for about as long as it lasts.',
          'Do you want it gone for tonight, or do you want to actually deal with it?'],
    opts: [
      ['Gone for tonight', 'numb'],
      ['Deal with it', 'deal'],
      ['Tell someone about it', 'contact']
    ]
  },
  numb: {
    say: ['That’s allowed. Just pick something that ends on its own.',
          'The feed doesn’t end, so it takes the whole night and gives nothing back.'],
    end: 'reroute'
  },
  deal: {
    say: ['Not at 3am you won’t, and that’s not a failure — nothing looks solvable at this hour.',
          'Write one line about it so it’s out of your head, then sleep on it.'],
    end: 'write'
  },

  avoid: {
    say: ['Then this isn’t loneliness, it’s a flinch, and a chat won’t fix it.',
          'Anything I say here is just a nicer way of not starting.'],
    end: 'flinch'
  }
};

/* Where each ending hands off to. The chat always ends somewhere real. */
RB.CHAT_ENDS = {
  contact: { label: 'Message someone', kind: 'contact' },
  human:   { label: 'Message someone', kind: 'contact' },
  reroute: { label: 'Give me something else', kind: 'redraw' },
  rest:    { label: 'Put it down', kind: 'close' },
  write:   { label: 'Write the line', kind: 'write' },
  flinch:  { label: 'Name what I’m avoiding', kind: 'flinch' }
};

window.RB = RB;
