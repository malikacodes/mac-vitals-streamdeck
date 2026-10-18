# 06 · One rule for every command

2026-10-17

Entry 04 gave the stat readings a three second limit per command. The
Wi-Fi key runs four commands of its own and had no limit on any of them.
Same hang, same trap, one file over.

## Why a file for it

The limit lived in `vitals.js`, as a constant and as an option on each
call. Copying that into `wifi.js` would have given me two copies of a
rule that's only useful if it's the same everywhere. So there's a
`run.js` now. It's small: it runs a command, and if nobody says
otherwise, gives up on it after three seconds. A caller that needs
longer says so. Joining a network keeps its thirty seconds, because
the Mac can really take that long.

I almost made it a bare re-export of `promisify(execFile)`, then
noticed that would have been a file that does nothing. The default
limit is the thing it's for.

One catch: scutil has to be typed to, so the Wi-Fi read needs the
running command itself, not only its output. The promise `run` gives
back still carries it, and a test with a real `cat` proves a line
typed in comes back out.

## Making the Wi-Fi read testable

`readVitals` could already be handed a fake `run`. `readWifi` and
`join` couldn't, so none of it had a test. Now they take the same
option, and the new tests feed them saved output: on a network, off,
card inactive with an old record still lying around, a command that
hung, and a Mac with no Wi-Fi card. The card's name is remembered
after the first look, so the "no card" test has to go first. It says
so in a comment, which is the kind of promise future me will break.

## Did it work?

- `npm test`: 70 pass, up from 60.
- Validate, pretend deck and restart were fine.
- Left for the next entry: the password side of `join`.

## What I learned

- A rule that matters should live in one place, or it quietly isn't
  a rule.
- The test for "gives up after three seconds" has to wait three real
  seconds once. I let it.
