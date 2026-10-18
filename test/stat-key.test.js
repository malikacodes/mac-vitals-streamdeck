import { test, mock } from "node:test";
import assert from "node:assert/strict";
import * as realVitals from "../src/vitals.js";

// Same idea as switch-key.test.js: index.js gets a stand-in for the
// Stream Deck SDK, and readVitals is swapped for one that counts how
// often the Mac is asked. Everything else is the real code.
const deck = { keys: [], instances: [], reads: 0 };

class SingletonAction {
  // Like the real SDK: the keys on screen that belong to this action.
  get actions() {
    return deck.keys.filter((k) => k.manifestId === this.manifestId);
  }
}
mock.module("@elgato/streamdeck", {
  namedExports: {
    action: ({ UUID }) => (cls) =>
      class extends cls {
        manifestId = UUID;
      },
    SingletonAction,
  },
  defaultExport: {
    logger: { setLevel() {}, error() {}, warn() {}, info() {} },
    actions: { registerAction: (it) => deck.instances.push(it) },
    devices: [],
    ui: { sendToPropertyInspector: async () => {} },
    connect() {},
  },
});
mock.module(new URL("../src/vitals.js", import.meta.url).href, {
  namedExports: {
    ...realVitals,
    readVitals: async () => {
      deck.reads++;
      return { cpu: 10, memory: 1e9, down: 1, up: 1, ping: 20 };
    },
  },
});
await import("../src/index.js");

const stat = (name) => deck.instances.find((it) => it.stat === name);
let next = 0;
async function appear(name) {
  const key = { id: `key${next++}`, manifestId: `com.malikacodes.mac-vitals.${name}`, pictures: [] };
  key.setImage = async (picture) => key.pictures.push(picture);
  deck.keys.push(key);
  await stat(name).onWillAppear({ action: key, payload: { settings: {} } });
  return key;
}
// The SDK takes the key out of its list before it tells the plugin.
function disappear(key, name) {
  deck.keys.splice(deck.keys.indexOf(key), 1);
  stat(name).onWillDisappear({ action: key });
}
const settle = () => new Promise((done) => setImmediate(done));

function start(t) {
  t.mock.timers.enable({ apis: ["setInterval"] });
  deck.reads = 0;
  deck.keys = [];
}

// Five stats, one timer: the Mac is asked once per tick however many
// keys are showing.
test("one reading per tick, however many stat keys are showing", async (t) => {
  start(t);
  const keys = [await appear("cpu"), await appear("cpu"), await appear("memory")];
  await settle();
  assert.equal(deck.reads, 1);
  t.mock.timers.tick(2000);
  await settle();
  assert.equal(deck.reads, 2);
  for (const key of keys) assert.ok(key.pictures.length > 0, "every key got a picture");
  disappear(keys[0], "cpu");
  disappear(keys[1], "cpu");
  disappear(keys[2], "memory");
});

// With one key left the readings go on. With none left they stop,
// because nothing is there to show them.
test("the readings stop only when the last stat key is gone", async (t) => {
  start(t);
  const cpu = await appear("cpu");
  const memory = await appear("memory");
  await settle();
  disappear(cpu, "cpu");
  t.mock.timers.tick(2000);
  await settle();
  assert.equal(deck.reads, 2, "the memory key still needs readings");
  disappear(memory, "memory");
  t.mock.timers.tick(2000);
  await settle();
  assert.equal(deck.reads, 2, "no keys, no readings");
});

// Coming back to the page starts the readings again.
test("a key that comes back after all were gone starts the readings again", async (t) => {
  start(t);
  disappear(await appear("ping"), "ping");
  await settle();
  const before = deck.reads;
  const key = await appear("ping");
  await settle();
  assert.equal(deck.reads, before + 1);
  disappear(key, "ping");
});
