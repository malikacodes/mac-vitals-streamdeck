// Everything about the Mac's Wi-Fi: which network it's on, and joining
// another one. The top half is plain functions the tests can run. The
// bottom half runs the Mac's own command line tools.
import { COMMAND_MS, run as runCommand } from "./run.js";

// Turns the settings box into a list. One network per line. A line can
// also be "network name = what the key says", for a name too long to
// read on a key.
export function parseNetworks(text) {
  const networks = [];
  for (const line of String(text ?? "").split("\n")) {
    const [name, ...rest] = line.split(" = ");
    const label = rest.join(" = ").trim();
    if (!name.trim()) continue;
    // The same network twice would make the key get stuck going round
    // between the two copies.
    if (networks.some((n) => n.name === name.trim())) continue;
    networks.push({ name: name.trim(), label: label || name.trim() });
  }
  return networks;
}

// The network a press should join: the one after the current one,
// wrapping back to the top. If the Mac is on something that isn't in
// the list (or on nothing), it's the first one.
export function nextNetwork(networks, current) {
  if (networks.length === 0) return null;
  const at = networks.findIndex((n) => n.name === current);
  return networks[(at + 1) % networks.length];
}

// Pulls the two things I need out of what `scutil` prints about Wi-Fi:
// whether it's switched on, and the "cached scan record".
//
// The scan record is the Mac's own note about the network it's
// connected to, saved as a long run of hex. macOS hides the network
// name everywhere else unless an app has Location permission, but the
// name is still sitting inside this note.
export function parseAirport(text) {
  const power = /Power Status\s*:\s*TRUE/.test(text);
  const hex = text.match(/CachedScanRecord\s*:\s*<data>\s*0x([0-9a-f]+)/i);
  return { power, record: hex ? Buffer.from(hex[1], "hex") : null };
}

// Is this exact name in the scan record?
//
// The record is a binary property list. In that format every piece of
// text has a small tag in front of it saying "text, this many
// characters". Checking the tag as well as the letters is what stops
// "Office" from matching inside "Office 5G".
//   plain letters:  0x50 + length, or 0x5f 0x10 length when it's 15 or more
//   anything else:  0x60 + length, or 0x6f 0x10 length (an emoji, a curly ’)
export function hasName(record, name) {
  if (!record || !name || name.length > 255) return false;
  const plain = /^[\x00-\x7f]*$/.test(name);
  // Node only writes two-byte text "little end first" and the record
  // wants it the other way round, so swap16 flips each pair.
  const letters = plain ? Buffer.from(name, "latin1") : Buffer.from(name, "utf16le").swap16();
  const kind = plain ? 0x50 : 0x60;
  const tag = name.length < 15 ? Buffer.from([kind + name.length]) : Buffer.from([kind + 15, 0x10, name.length]);
  return record.includes(Buffer.concat([tag, letters]));
}

// Which of my networks the Mac is on, or null if it's none of them.
export function whichNetwork(record, networks) {
  return networks.find((n) => hasName(record, n.name))?.name ?? null;
}

// The Wi-Fi card's device name. It's en0 on my Mac, but that's not a
// promise, so I ask once and keep the answer.
let device;
async function wifiDevice(run) {
  if (device) return device;
  const { stdout } = await run("/usr/sbin/networksetup", ["-listallhardwareports"], { timeout: COMMAND_MS });
  const found = stdout.match(/Hardware Port: Wi-Fi\nDevice: (\S+)/);
  if (!found) throw new Error("This Mac has no Wi-Fi card");
  device = found[1];
  return device;
}

// What the Wi-Fi is doing right now.
//   power      is it switched on
//   connected  is it on a network at all
//   record     the scan record, for whichNetwork()
//
// `run` is how the commands get run. The tests hand in a fake one.
export async function readWifi({ run = runCommand } = {}) {
  const dev = await wifiDevice(run);
  // scutil doesn't take its question on the command line. It waits for
  // me to type it, so I start it and then send the line in.
  const asking = run("/usr/sbin/scutil", [], { timeout: COMMAND_MS });
  asking.child.stdin.end(`show State:/Network/Interface/${dev}/AirPort\n`);
  const [airport, link] = await Promise.all([asking, run("/sbin/ifconfig", [dev], { timeout: COMMAND_MS })]);
  const { power, record } = parseAirport(airport.stdout);
  // The scan record can outlive the connection, so "connected" comes
  // from the card itself and not from the record being there.
  const connected = power && /status: active/.test(link.stdout);
  return { power, connected, record: connected ? record : null };
}

// The name my passwords are filed under in the keychain. It's the
// plugin's first name, from when it was only this key. Changing it
// would mean typing every password in again.
const KEYCHAIN = "wifi-toggle";

// A network's password from my login keychain, or null if I never saved
// one. The Mac has its own copy of every Wi-Fi password, but that one
// is in the System keychain and asks for my Mac password each time, so
// the key gets a copy of its own. They're saved from Terminal with
// `security add-generic-password`, never typed into Stream Deck.
async function savedPassword(name, run) {
  try {
    const { stdout } = await run("/usr/bin/security", ["find-generic-password", "-s", KEYCHAIN, "-a", name, "-w"], { timeout: COMMAND_MS });
    return stdout.replace(/\n$/, "") || null;
  } catch {
    // `security` exits with an error when there's nothing under that name.
    return null;
  }
}

// Joins a network. On this macOS, networksetup won't join without being
// handed the password, even for a network the Mac is already on.
//
// networksetup says nothing when it works. When it doesn't, it prints
// the reason and still exits as if all was well, so any words at all
// count as a failure.
export async function join(name, { run = runCommand } = {}) {
  const dev = await wifiDevice(run);
  const password = await savedPassword(name, run);
  const args = ["-setairportnetwork", dev, name];
  if (password) args.push(password);

  let said;
  try {
    said = (await run("/usr/sbin/networksetup", args, { timeout: 30000 })).stdout.trim();
  } catch {
    // Node's own error message repeats the whole command, password
    // included, and this error ends up in the log file. So it's
    // replaced with one that says less.
    throw new Error(`networksetup gave up joining ${name}`);
  }
  if (said) {
    const failed = new Error(said);
    failed.noPassword = !password;
    throw failed;
  }
}
