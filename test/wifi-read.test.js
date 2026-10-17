import { test } from "node:test";
import assert from "node:assert/strict";
import { readWifi, whichNetwork, parseNetworks } from "../src/wifi.js";

// A stand-in for the Mac's commands, the way readings.test.js does it.
// Each one prints the text it's given, or fails like a dead command.
// scutil is typed into, so its answer carries a pretend stdin.
const asked = [];
function fakeRun(outputs) {
  return (file, args, opts) => {
    asked.push({ file, args, opts });
    const out = outputs[file.split("/").at(-1)];
    const done = out instanceof Error ? Promise.reject(out) : Promise.resolve({ stdout: out ?? "", stderr: "" });
    return Object.assign(done, { child: { stdin: { end() {} } } });
  };
}

const ports = "Hardware Port: Wi-Fi\nDevice: en0\nEthernet Address: aa:bb\n\nHardware Port: Thunderbolt\nDevice: en5\n";
const record = (name) => Buffer.concat([Buffer.from("bplist00"), Buffer.from([0x50 + name.length]), Buffer.from(name, "latin1")]);
const scutil = (name) => `<dictionary> {\n  CachedScanRecord : <data> 0x${record(name).toString("hex")}\n  Power Status : TRUE\n}`;
const ifconfig = (status) => `en0: flags=8863<UP>\n\tstatus: ${status}\n`;

// A Mac with no Wi-Fi card is the one case that has to be said out
// loud. It goes first because the card's name is remembered once found.
test("a Mac with no Wi-Fi card says so", async () => {
  await assert.rejects(readWifi({ run: fakeRun({ networksetup: "Hardware Port: Ethernet\nDevice: en5\n" }) }), /no Wi-Fi card/);
});

test("on a network: power, connected, and the scan record come back", async () => {
  const wifi = await readWifi({ run: fakeRun({ networksetup: ports, scutil: scutil("Upstairs"), ifconfig: ifconfig("active") }) });
  assert.equal(wifi.power, true);
  assert.equal(wifi.connected, true);
  assert.equal(whichNetwork(wifi.record, parseNetworks("Upstairs")), "Upstairs");
});

// The scan record can outlive the connection, so a card that says
// "inactive" means no network even with a record still sitting there.
test("an inactive card is not connected, and its old record is dropped", async () => {
  const wifi = await readWifi({ run: fakeRun({ networksetup: ports, scutil: scutil("Upstairs"), ifconfig: ifconfig("inactive") }) });
  assert.equal(wifi.connected, false);
  assert.equal(wifi.record, null);
});

test("Wi-Fi switched off reads as off", async () => {
  const wifi = await readWifi({ run: fakeRun({ networksetup: ports, scutil: "<dictionary> {\n  Power Status : FALSE\n}", ifconfig: ifconfig("inactive") }) });
  assert.equal(wifi.power, false);
  assert.equal(wifi.connected, false);
});

// A command that hangs is given up on by its time limit and rejects.
// The read passes that on and doesn't make up a reading.
test("a command that hung rejects the read", async () => {
  await assert.rejects(readWifi({ run: fakeRun({ networksetup: ports, scutil: scutil("Upstairs"), ifconfig: new Error("Command failed: ifconfig (timed out)") }) }), /timed out/);
});

// Same shape as the vitals test: every command here is asked with a
// limit, so one that hangs can't leave a read waiting forever.
test("every command is run with a time limit", async () => {
  asked.length = 0;
  await readWifi({ run: fakeRun({ networksetup: ports, scutil: scutil("Upstairs"), ifconfig: ifconfig("active") }) });
  assert.ok(asked.length >= 2);
  for (const { opts } of asked) assert.ok(opts?.timeout > 0 && opts.timeout <= 3000);
});
