import { test } from "node:test";
import assert from "node:assert/strict";
import { poll } from "../src/poll.js";

// Lets the promise chain settle without moving the clock.
const settle = () => new Promise((done) => setImmediate(done));

// The reason this file exists: during a Wi-Fi change netstat can hang,
// and without this each tick started another copy of it. A tick that
// lands mid-job has to be skipped, not queued.
test("a tick that lands while the job is still running is skipped", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let finish;
  let runs = 0;
  const job = () =>
    new Promise((done) => {
      runs++;
      finish = done;
    });
  const timer = poll(job, 2000, () => {});
  assert.equal(runs, 1, "the first reading is taken right away");

  // Two ticks go by with the first job still hanging.
  t.mock.timers.tick(2000);
  t.mock.timers.tick(2000);
  assert.equal(runs, 1);

  // The job comes back, and the next tick takes a fresh reading.
  finish();
  await settle();
  t.mock.timers.tick(2000);
  assert.equal(runs, 2);
  clearInterval(timer);
});

// A reading that throws (say, a key that vanished mid-redraw) used to
// be an unhandled rejection, which ends the whole plugin. Now it's one
// line in the log and the timer keeps going.
test("a failing job is logged once and the timer survives", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const lines = [];
  let broken = true;
  let runs = 0;
  const job = async () => {
    runs++;
    if (broken) throw new Error("setImage failed");
  };
  const timer = poll(job, 2000, (line) => lines.push(line));
  await settle();
  t.mock.timers.tick(2000);
  await settle();
  t.mock.timers.tick(2000);
  await settle();
  assert.equal(runs, 3, "the timer kept ticking through the failures");
  assert.deepEqual(lines, ["setImage failed"]);

  // Once it works again, the next failure is news and gets logged again.
  broken = false;
  t.mock.timers.tick(2000);
  await settle();
  broken = true;
  t.mock.timers.tick(2000);
  await settle();
  assert.deepEqual(lines, ["setImage failed", "setImage failed"]);
  clearInterval(timer);
});
