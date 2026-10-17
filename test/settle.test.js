import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNetworks, settle } from "../src/wifi.js";

const networks = parseNetworks("Upstairs\nDownstairs");
const on = (name) => ({ power: true, connected: true, record: Buffer.concat([Buffer.from("bplist00"), Buffer.from([0x50 + name.length]), Buffer.from(name, "latin1")]) });

// A reader that gives its answers one after another, like the Mac
// slowly making up its mind. A Error in the list is a read that failed.
function reader(answers) {
  let i = 0;
  const read = async () => {
    const answer = answers[Math.min(i++, answers.length - 1)];
    if (answer instanceof Error) throw answer;
    return answer;
  };
  read.count = () => i;
  return read;
}
const quick = { tries: 5, ms: 0 };

// The normal join: the Mac needs a couple of looks before it admits
// it's on the new network, and the loop stops the moment it does.
test("stops looking as soon as the Mac is on the network", async () => {
  const read = reader([on("Upstairs"), on("Upstairs"), on("Downstairs"), on("Upstairs")]);
  const result = await settle(read, networks, "Downstairs", quick);
  assert.equal(result.landed, true);
  assert.equal(read.count(), 3);
});

// The join said yes but the Mac never agrees. The loop gives up after
// its tries, and says so instead of leaving the key to guess.
test("gives up after its tries and says it never landed", async () => {
  const read = reader([on("Upstairs")]);
  const result = await settle(read, networks, "Downstairs", quick);
  assert.equal(result.landed, false);
  assert.equal(read.count(), 5);
  assert.ok(result.wifi, "the last reading is handed back so the key can be drawn from it");
});

// A read can fail in the middle of a switch, while the card is between
// networks. That's one bad look, not a failed join, so it keeps looking.
test("a read that fails mid-loop is one more try, not the end", async () => {
  const read = reader([on("Upstairs"), new Error("scutil hung"), on("Downstairs")]);
  const result = await settle(read, networks, "Downstairs", quick);
  assert.equal(result.landed, true);
  assert.equal(read.count(), 3);
});

// If every look fails there's no reading to hand back, and no claim
// that it landed.
test("reads that always fail give no reading and no landing", async () => {
  const result = await settle(reader([new Error("scutil hung")]), networks, "Downstairs", quick);
  assert.equal(result.landed, false);
  assert.equal(result.wifi, null);
  assert.equal(result.error.message, "scutil hung", "the last failure is handed back for the log");
});
