# Memory Pressure key: requirements

Status: built on the `memory-pressure-key` branch. D1 to D6 decided as
picked in section 10, plus the failed-reading color in section 5. D1b
(the Memory key's verdict) is a later pull request.
Date: 2026-10-22, revised the same day after a review

## 1. Problem

The Memory key reports memory in use (app memory + wired + compressed,
the sum Activity Monitor calls "Memory Used") and judges it against
fixed shares of total memory: under 75% "Plenty of room", 75 to 90%
"Getting full", over 90% "Full".

macOS fills spare memory on purpose and frees it on demand, so "used"
is a weak signal for whether the Mac is short of memory. Activity
Monitor's own signal is memory pressure, shown as a green, yellow or
red graph.

Measured on the 16 GB Mac on 2026-10-22:

| Source | Reading |
|---|---|
| Memory key | about 12.7 GB used, 79%, verdict "Getting full" |
| `kern.memorystatus_vm_pressure_level` | `1` (normal) |
| `kern.memorystatus_level` | `67` (% of memory available) |
| `vm.swapusage` | 1.25 GB of 2 GB swap in use |

The Memory key's verdict and the kernel disagree. The kernel is the
authority on whether the Mac is under memory pressure.

## 2. Goal

A stat key that shows the Mac's memory pressure live, in the same form
as the other five stat keys, with a settings page that says what the
reading means and what to do.

## 3. Non-goals

- Reproducing Activity Monitor's pressure graph exactly. Its formula is
  not published.
- A list of which apps are using memory. The settings page points to
  Activity Monitor for that.
- Creating pressure on purpose (see 9.2).
- A dial version. The plugin has no dial actions yet.

## 4. Data source

One command, run through `run.js` with `COMMAND_MS`, added to the
`Promise.allSettled` in `readVitals`:

```
/usr/sbin/sysctl -n kern.memorystatus_vm_pressure_level kern.memorystatus_level
```

Output is two lines, in the order asked:

| Line | Meaning | Values |
|---|---|---|
| 1 | Pressure level, the kernel's own judgment | `1` normal, `2` warning, `4` critical |
| 2 | Memory available, as a percent of total | 0 to 100 |

- Answered in under 10 ms on this Mac, with no permissions.
- `1` and `67` were observed on this Mac. `2` and `4` come from the
  kernel's published source, not from a reading here (see 9.2).
- `pressure(text)` in `vitals.js` parses that output and returns
  `{ pressure: 100 - available, level }`, or `null` when either line is
  missing or not a whole number, the level isn't `1`, `2` or `4`, or
  available is outside 0 to 100. Both or nothing: half a reading is a
  failed reading.
- A failed reading, or a `sysctl` that doesn't answer, gives `null` for
  both fields and is logged once through the existing `failing` set,
  like `vm_stat` and `netstat`.
- `readVitals` returns two new fields:
  - `pressure`: `100 - available`, a number from 0 to 100, or `null`.
    This is the one number per reading that goes into `history`, like
    every other stat. Higher means more pressure (see D3).
  - `pressureLevel`: `1`, `2`, `4` or `null`. Not kept in `history`.
    Only the latest level is used, for the line color and the verdict.
- `index.js` keeps the last level it read, and only replaces it when a
  new reading has one. So a failed reading leaves the last known level
  in place (see 5).
- `StatKey.render` passes that level to `drawStat` only when
  `this.stat === "pressure"`. `drawStat` uses a `level` when it's given
  one and draws pink when it isn't, so it never needs to know which
  stat it's drawing. `explain` already gets `stat` first, so it gets
  the level as a fourth argument and only the pressure verdict reads
  it. Both keep taking one number per reading in `history`.
- Never `memory_pressure`. With no arguments it prints the same
  percent, but its flags allocate memory for real (`-l`, `-p`) or hold
  the whole system at a fake level (`-S`). Not worth having in the
  code to save one command.

## 5. The key

Action UUID `com.malikacodes.mac-vitals.pressure`, name "Memory
Pressure", added to `STATS` so it gets the shared reading loop,
history, press behavior and settings page like the other five.

- Label: `PRESSURE`.
- Big value and unit: `33` and `%`, the `pressure` number (see D3). The
  widest value is `100 %`, which fits beside the unit at the stat
  keys' current sizes.
- Graph: the last minute (30 readings, every 2 seconds), top fixed at
  100.
- Color of the graph line: the whole line takes the color of the latest
  level, one `stroke` on the existing single `<path>`. The line doesn't
  keep each reading's own color: that would need the level in
  `history` and the path split into segments, for a minute of history.
  The colors are D2.
- After a failed reading the line keeps the color of the last level
  that was read, and the value shows `–`. Pink only when no level has
  been read yet. Falling back to pink after a warning would show
  "normal" for a reading that failed, and the `–` already says the
  latest look didn't work.
- A failed reading draws `–` and leaves a gap in the line, the same as
  a missed ping.
- Press: opens the Mac Vitals page, on the deck picked in the key's
  "Open on" setting. Inherited from `StatKey`, nothing new.

## 6. Settings page

Uses `ui/stat.html` and `explain.js` like the other stat keys. The
verdict comes straight from the kernel's level, not from cut-offs of my
own:

| Level | Word | Tone | Means |
|---|---|---|---|
| 1 | Normal | good | The Mac has the memory it needs |
| 2 | Warning | watch | The Mac is compressing and swapping to keep up |
| 4 | Critical | bad | The Mac is short of memory, and apps will slow down or be asked to quit |
| none yet | Checking | plain | Waiting for the first reading |

Draft text for the fixed rows:

- **This is:** whether the Mac has enough memory for what's open. It's
  the Mac's own judgment, the same one behind the colored graph at the
  bottom of Activity Monitor's Memory tab. The number is 100 minus the
  percent of memory the Mac says is available, so higher is worse. A
  full Memory key with a calm Pressure key is fine.
- **Normal** (three bullets, matching `ABOUT[stat].normal`):
  - Normal: nothing to do, however full the Memory key looks
  - Warning: the Mac is compressing and swapping to make room
  - Critical: it's out of room, and apps slow down or get asked to quit
- **If it's off:** quit the apps at the top of Activity Monitor's
  Memory tab, starting with ones I'm not using. If it stays yellow or
  red with little open, restart the Mac.

The current level decides the verdict, not the minute's average. The
kernel already smooths it, and a warning should show as soon as it
starts.

## 7. Layouts

The free spot on each deck sits next to Memory:

| Deck | Position | Today |
|---|---|---|
| XL | `3,0` | empty, between Memory and Download |
| Stream Deck + | `3,1` | empty, bottom right |

Changing a bundled layout reaches the deck only through a fresh
install of the plugin's profile (wiki: `bundled-profiles-install-once`,
`the-first-switch-installs-a-plugins-own-profile`). The installed Mac
Vitals profiles would need deleting so the next press installs the new
ones, or the key gets dragged on by hand. See D6.

`test/profiles.test.js` already fails if a manifest action is missing
from a layout, so adding the action without placing it can't ship.

## 8. Tests

- `pressure(text)` parses both lines; returns `null` for an unknown
  level, a missing line, or non-numbers.
- `words("pressure", …)`: `33` gives `33` and `%`, `100` gives `100`
  and `%`, `null` gives `–`.
- `pressure(text)` gives `{ pressure: 33, level: 1 }` for `1` and `67`,
  and `null` for: level `3`, available `130`, one line only, or text.
- `explain("pressure", …)` gives Normal, Warning and Critical from
  levels 1, 2 and 4, and Checking with no readings.
- `readVitals` with a fake `run`: a failing `sysctl` gives `null` and
  one log line, and the other readings are unaffected.
- Drawing: pure black background, `level` 1, 2 and 4 give the three D2
  colors, no `level` gives pink, `–` with no reading, and `100 %` fits.
- The kept level: a failed reading after a warning keeps the warning
  color, and a first reading that fails draws pink. This lives in
  `index.js`, so it's checked in `test/stat-key.test.js` with the
  existing pretend `run`.
- Profiles: the existing tests cover placement and the manifest.

## 9. Verification

### 9.1 Before it's called done

`npm run check`, `npm test`, `streamdeck validate`, the pretend deck
with and without settings, the pictures on black, then the Stream Deck
app's window. Normal is the only level that can be seen on the real
deck on an ordinary day.

### 9.2 Warning and critical

The tests prove the parsing and the words for levels 2 and 4. Seeing
them on the real deck needs the Mac to be under pressure.
`memory_pressure -S -l warn -s 10` would hold the whole system at the
warning level for ten seconds, but it changes how every app on the Mac
behaves for that time. It is not run without asking first.

## 10. Open decisions

**D1. Decided: a new key.** The point is seeing the pressure number
itself. A Memory key that only stopped crying wolf was the narrower
option and was turned down for that reason.

Cost to know about: on the Stream Deck +, Memory and Pressure together
are 2 of its 8 keys.

**D1b. Fix the Memory key's verdict too.**
- A: leave the Memory key as it is.
- B: in a separate pull request, after the Pressure key, make the
  Memory key's verdict follow the pressure level instead of 75% and
  90%. Its GB number and graph stay.
- Pick: B. On 2026-10-22 it said "Getting full" at normal pressure.
  With a Pressure key beside it, the two would disagree on screen.
- Against: once the Pressure key is there, the Memory key's verdict
  matters less, and its settings page can just point to Pressure.

**D2. Colors.**
- A: green, yellow and red, the way Activity Monitor shows pressure.
  The settings page already uses these three for its verdict words:
  `#7fd6a0`, `#f2c66d`, `#f28b82`. Reusing them keeps the key and its
  page in step.
- B: my palette only: pink at normal like the other five, yellow
  `#f2c66d` at warning, red `#f28b82` at critical. Built with a deeper
  red, `#d92b2b`: the first one sat too close to pink on the deck. The
  settings page keeps `#f28b82` for its word, because dark reds read
  badly on its gray panel.
- Pick: B. At normal, which is nearly always, the key looks like its
  neighbors. Color only shows up when something is wrong, which is
  when it's information.
- Against: A matches Activity Monitor exactly, which is where I'd go
  to check it. And the rule "red only for a real failure" has to
  stretch to cover critical pressure. I think it does: critical is the
  Mac telling apps to quit.
- Whichever is picked, the three colors get drawn next to a pink line
  on pure black and checked in the Stream Deck app's window before
  they're final.

**D3. The big value.**
- A: memory available, from line 2: `67` with unit `% free`.
- B: `100 - available`: `33` with unit `%`.
- C: the level as a word. `Critical` at the value size is wider than
  the key.
- Pick: B (changed from A after review). With a label of `PRESSURE`,
  A's line falls as pressure rises, the opposite of the label, of
  Activity Monitor's graph, and of the five keys beside it. With B, up
  means worse on every key.
- Against: Apple doesn't show this number anywhere. The settings page
  has to say what it is, and it won't match any number in Activity
  Monitor.

**D4. Swap.**
- A: leave it out.
- B: show swap in use on the settings page as one line under "Right
  now".
- Pick: A. One reading per key. Swap is a cause of pressure, and the
  pressure level already accounts for it.

**D5. Type sizes.**
The stat keys draw the label at 19 and the value at 40, weight 700.
My layout rules now say keys use the Pomodoro scale: label 20, value
38, nothing heavier than 600.
- A: the new key matches the five beside it.
- B: the new key follows the rules, and the other five change in the
  same pull request.
- C: the new key matches the five, and bringing all six to the scale
  is its own pull request.
- Pick: C. A row where one key is drawn differently looks like a bug,
  and the type change touches every stat key's picture, which is a
  separate thing to check on the deck.

**D6. Layouts.**
- A: add the key to both layouts at the spots in section 7, and delete
  the installed Mac Vitals profiles so the next press installs the new
  ones.
- B: leave the layouts alone and drag the key on by hand.
- Pick: A, because the layouts are how the plugin ships. Its cost is
  rebuilding the two Mac Vitals pages by hand-deleting them once, and
  anything I've rearranged on them since is lost.
