# 09 · One list of keys

2026-10-17

A tidy-up with one real bug inside it. The stat keys were keeping their
own list of which keys were on screen, next to the list Stream Deck
already keeps. Two lists of the same thing is how they end up
disagreeing.

## Asking the SDK instead

Each stat key had a `Set` of key ids, added to when a key appeared and
taken from when it left. When the set went empty, the stat stopped
asking for readings. I wanted to know if I could drop mine and trust the
SDK's `this.actions`. The catch is timing: if the SDK only removes a
key after my handler runs, the list still holds it and "empty" never
comes.

I read the SDK's source instead of guessing. It adds a key to its own
store just before it tells me the key appeared, and removes it just
before it tells me the key left. So inside `onWillDisappear` the key is
already gone, and an empty list really means empty. The `Set` went away.

Before touching it I wrote tests for how it behaved: one reading per
tick however many keys show, readings stop only when the last key goes,
and they start again when a key returns. They passed on the old code,
and still pass on the new.

## The stale look

When every stat key left and later came back, the plugin still held the
last reading from before, maybe minutes old. The next reading
compared against it, so all the network traffic from the gap landed in
one tick as a giant speed, and the CPU number averaged over minutes.
One wrong number and then back to normal, which is the kind of bug you
never catch by watching.

A look older than ten seconds isn't compared against now, and neither
is one from the future (a clock that stepped back). A normal tick is
two seconds apart and a slow one still lands well under ten.

## Small names

- `sendWords` had a local called `words` that hid the imported `words`.
  It's `text` now, and the message sent to the settings page is the
  same.
- `this.joining = null` was written twice in `switchFrom`. It's in a
  `finally` once.

## Did it work?

- `npm test`: 87 pass, up from 83.
- Validate, pretend deck and restart were fine.

## What I learned

- When I want to remove a second copy of something, the question is
  "who updates the first one, and when". The answer was in the SDK's
  source and took five minutes.
- A value kept in memory between ticks needs an answer to "what if
  nobody asks for a while".
