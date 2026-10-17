# 05 · The Wi-Fi key stops crashing

2026-10-17

The last entry ended with a loose end: the Switch key has the same
shape of timer as the stat keys, and I left it alone. This is me going
back for it. Reading the code again, it was worse than "same shape".

## Three ways the key could kill the plugin

**setImage with nothing catching it.** Drawing a key means asking the
Stream Deck app to take a picture. If the key has just gone (I flipped
pages), that ask fails, and the failure came out of a timer with
nobody to catch it. An unhandled rejection ends the whole plugin, with
nothing in the log. So the plugin would just be gone.

**A read that failed was drawn as "Wi-Fi off".** The old `render` caught
the error and made up a reading that said the card was off. The key
lied, and it wrote the same log line every five seconds while it did.

**The key looked at the Wi-Fi too much.** One press read the Wi-Fi four
times: to see where I was, then once more inside each of the two
redraws, then to see the join land. The Mac was asked the same
question over and over by me.

## One render

`render(wifi)` now takes a reading. If it's handed one it draws from
it, and only looks by itself when it has none. A press hands its
readings straight through, so it reads twice now: where I am, and did
the join land.

If the look fails, `render` throws before it draws anything. That's the
whole trick for "keep the last picture": the key was never touched, so
it still shows what it showed. The throw lands in `poll()` (the same
one-at-a-time loop from entry 04), which writes it to the log once and
keeps going. I picked this over drawing "Wi-Fi off" (untrue) and over
drawing "No Wi-Fi" (the card might be fine).

Each key's `setImage` is caught on its own, so a key that vanished
loses its own picture and the others still get theirs.

## Testing a file that talks to Stream Deck

`index.js` is the only file that imports the SDK, so none of this had
a test. Node's test runner can swap a module for a stand-in
(`mock.module`), so the new test file hands `index.js` a fake deck and
a fake `readWifi`, and everything else is the real code. It needs
`--experimental-test-module-mocks`, which is now in `npm test`.

The tests came first and failed on the old code for the right reasons:
a "Wi-Fi off" picture where there should have been none, four reads
where there should be two, and a rejection coming out of a key that
wasn't there.

## Did it work?

- `npm test`: 60 pass, up from 54.
- `streamdeck validate`, the pretend deck, and a restart of the linked
  plugin were all fine.
- Another slip turned up in review: after all the keys left and one
  came back, it drew the old reading as if it were new. It waits for a
  fresh look now, and has its own test.

## What I learned

- A thing that fails shouldn't draw a made-up answer. Not drawing is
  an honest answer.
- Hand a reading down instead of looking again. It's fewer calls and
  one place to be wrong.
- Still on the list: the notice timer can stack if two joins fail
  inside two seconds.
