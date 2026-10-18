# 08 · Waiting for a join to land

2026-10-17

After I press the Switch key, the Mac takes a moment to admit it's on
the new network, so the key looks a few times before it lights up. That
waiting loop lived inside `index.js`, wrapped in the same `try` as the
join. This one's about pulling it out and making each failure say what
actually failed.

## What the old shape got wrong

Everything from the first look to the last sat in one `try`. So a read
that failed after the join had worked, because the card was between
networks and scutil was slow, landed in the same `catch` as a join that
really failed. The key said "Can't join" about a join that had joined.
And when the Mac simply never agreed after twelve looks, the loop gave
up without a sound. A key that doesn't change and a log with nothing
in it is a hard thing to debug later.

## Three changes

**The loop is `settle()` in `wifi.js`.** It's handed the reader, the
list, and the name to wait for. It gives back whether it landed, the
last reading it got, and the last error if the final look failed. The
twelve tries and half a second are the same as before. Being a plain
function with a reader handed in means a test can play a Mac that
makes up its mind on the third look, one that never does, and one
whose reads fail halfway.

**A failed look is one more try.** That's the whole fix for the false
"Can't join".

**The give-up is logged,** with the reason if every look failed, and
the key is drawn from the last thing the Mac did say.

I also split the first look out of the join's `try`. If it fails, no
join was tried, so the key flashes its alert instead of blaming the
network.

## Did it work?

- `npm test`: 83 pass, up from 76. The settle tests run with no wait at
  all by handing it zero milliseconds.
- Validate, pretend deck and restart were fine.
- I haven't forced a real join to fail on the real deck. Only my hands
  can, by walking out of range with the key pressed.

## What I learned

- One `try` around a whole routine can't tell its failures apart.
  The `catch` ends up answering for all of them, and gets some wrong.
- A loop that gives up should say so.
