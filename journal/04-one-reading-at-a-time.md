# 04 · One reading at a time

2026-10-17

My Mac started freezing for five to ten seconds at a time. The whole
Mac, not just the deck: the pointer stuck, music kept playing, and
nothing in any log. It only happened while my own plugins were running,
which is the kind of clue I'd rather not have had.

## Who's asking the Mac things

Three of my eleven plugins ask the Mac something on a timer. This one
asks three times every two seconds: `vm_stat` for memory, `netstat -ib`
for the network counts, and one `ping` to 1.1.1.1.

The loop was a plain `setInterval`. Every two seconds, start a reading.
Nothing checked whether the last reading had finished. Most of the day
that's fine, because the three commands come back in a few
milliseconds. The problem is the moment the Wi-Fi changes networks.
`netstat` can sit there waiting for a card that's halfway between
networks, and while it waits the timer keeps going. Tick, another
netstat. Tick, another one. Five seconds in, there are three of them
all waiting on the same thing, and the Mac is the one doing the
waiting.

The computer, asked the same question every two seconds, kept trying
to answer every one of them. Very helpful. Thanks.

## Three small fixes

**One at a time.** The loop lives in its own little file now, `poll.js`.
A tick that lands while a reading is still running is skipped. Nothing
is lost: the next tick takes a fresh one. It's the same busy flag the
Wi-Fi key already had for presses, so the pattern was already in the
repo, just not on the timer.

**A time limit.** Each of the three commands now gets three seconds
before it's given up on. ping already gives up after two on its own,
so three leaves room for that and still can't outlast a tick and a
half.

**A catch.** A reading that threw (a key vanishing mid-redraw does it)
was an unhandled rejection, which ends the plugin outright. Now it's
one line in the log and the timer keeps going. One line, not one every
two seconds: a command that keeps failing is logged when it starts
failing and again when it comes back, and left alone in between.

## Testing a timer without waiting for it

The tests for this came first, on the old code, so I'd know the
readings still read the same afterwards. `readVitals` takes a `run`
option now, and the tests hand it a fake that prints saved output or
fails like a dead command. The old parser tests never needed that
because they never ran a command.

For the loop itself, Node's test runner can take over `setInterval`,
so a test moves the clock by hand:

```
start the loop        one reading starts and hangs
tick 2000, tick 2000  still one reading
let it finish
tick 2000             a second reading
```

Four seconds of waiting in about a millisecond. Future me, who has the
memory of a goldfish, will be glad the test says the whole story.

## Did it work?

- `npm test`: 54 pass, up from 50. Six new ones: the four readings
  tests, and two for the loop.
- The pretend deck drew four rounds of real numbers.
- `streamdeck restart` picked up the change, and the log stayed empty,
  which here is good news.
- Whether the freezes are gone is a question for a day of normal use
  and a couple of Wi-Fi changes.

## What I learned

- A plugin is its own process, so it can't freeze the Stream Deck app.
  What it can do is run a system command that stalls the Mac, and a
  timer with no guard makes copies of it.
- "Skip the tick" beats "queue the tick". Queued readings would all
  come back at once with stale numbers.
- The Switch key's own five second loop has the same shape. It reads
  Wi-Fi state, which hasn't hung on me, so it's left alone for now.
