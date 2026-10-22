import { test } from "node:test";
import assert from "node:assert/strict";
import { explain } from "../src/explain.js";

const GB = 2 ** 30;
const minute = (value) => Array(30).fill(value);

// Every stat has to come with all four parts, or its settings page has
// an empty row and I'm back to guessing what the key is.
test("every stat explains what it is, what's normal and what to do", () => {
  for (const stat of ["cpu", "memory", "pressure", "down", "up", "ping"]) {
    const told = explain(stat, [], 16 * GB);
    assert.ok(told.what.length > 20, stat);
    assert.ok(told.normal.length >= 3, stat);
    assert.ok(told.todo.length > 20, stat);
    assert.ok(told.word && told.means, stat);
  }
});

// A brand new key has no readings yet. It should say so, not call an
// empty list "calm" or "no answer".
test("with no readings yet it says it's checking", () => {
  for (const stat of ["cpu", "memory", "pressure", "down", "up", "ping"]) {
    assert.equal(explain(stat, [], 16 * GB).word, "Checking", stat);
    assert.equal(explain(stat, [], 16 * GB).now, "–", stat);
  }
});

// The processor is judged on the whole minute. Opening an app spikes it
// to 100 for a second, and that mustn't read as "maxed out".
test("one cpu spike in a calm minute is still calm", () => {
  const spike = [...minute(12).slice(1), 100];
  assert.equal(explain("cpu", spike).word, "Calm");
  assert.equal(explain("cpu", spike).now, "100 %");
  assert.equal(explain("cpu", minute(70)).tone, "watch");
  assert.equal(explain("cpu", minute(95)).tone, "bad");
});

// Memory is judged against how much this Mac has: 12 GB is roomy in a
// 32 GB Mac and tight in a 16 GB one.
test("memory is judged as a share of the Mac's total", () => {
  assert.equal(explain("memory", [11 * GB], 16 * GB).word, "Plenty of room");
  assert.equal(explain("memory", [13 * GB], 16 * GB).word, "Getting full");
  assert.equal(explain("memory", [15 * GB], 16 * GB).word, "Full");
  assert.equal(explain("memory", [15 * GB], 32 * GB).word, "Plenty of room");
  assert.ok(explain("memory", [12 * GB], 16 * GB).means.startsWith("75% of 16.0 GB"));
});

// A quiet connection is the normal state of a Mac nobody is downloading
// on. The speeds must never be marked good or bad, or an idle evening
// would look like broken internet.
test("speeds are described, never judged", () => {
  for (const speed of [0, 0.5, 12, 300]) {
    assert.equal(explain("down", [speed]).tone, "plain");
    assert.equal(explain("up", [speed]).tone, "plain");
  }
  assert.equal(explain("down", [0.01]).word, "Quiet");
  assert.equal(explain("down", [300]).word, "Heavy");
});

// One lost ping happens on any Wi-Fi. Three of the last five missing is
// the internet being down, and that's the one verdict I act on.
test("one missed ping is fine, most of the last five is no answer", () => {
  assert.equal(explain("ping", [20, 22, null, 21, 19]).word, "Fast");
  const down = explain("ping", [20, 22, null, null, null]);
  assert.equal(down.word, "No answer");
  assert.equal(down.tone, "bad");
  assert.equal(down.now, "–");
});

// The cut-offs where a connection starts to feel different: fine under
// 100 ms, laggy on calls up to 250, struggling past that.
test("ping is judged on the minute's average", () => {
  assert.equal(explain("ping", minute(70)).word, "Fine");
  assert.equal(explain("ping", minute(180)).tone, "watch");
  assert.equal(explain("ping", minute(400)).tone, "bad");
});

// Pressure's verdict is the Mac's own level, not a cut-off of mine, and
// the number beside it is the percent on the key.
test("pressure's verdict comes from the Mac's level", () => {
  assert.deepEqual(
    (({ word, tone, now }) => ({ word, tone, now }))(explain("pressure", [33], 100, 1)),
    { word: "Normal", tone: "good", now: "33 %" },
  );
  assert.equal(explain("pressure", [70], 100, 2).tone, "watch");
  assert.equal(explain("pressure", [95], 100, 4).word, "Critical");
});

// The level is judged as it is now, not averaged over the minute. A
// warning after a calm minute is a warning straight away.
test("one warning after a calm minute is a warning", () => {
  assert.equal(explain("pressure", [...Array(29).fill(30), 60], 100, 2).word, "Warning");
});
