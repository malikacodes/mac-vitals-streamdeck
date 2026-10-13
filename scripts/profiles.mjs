// Makes the two bundled profiles, one for my XL and one for my Stream
// Deck +, in the same format Stream Deck itself exports: a
// .streamDeckProfile is a zip of a <uuid>.sdProfile folder. The shape is
// copied from the same script in another plugin of mine, which got it from a
// real export.
//
// Profiles are made here and never edited by hand. Stream Deck installs
// a bundled profile once, the first time the plugin is installed, so a
// changed layout only arrives after the plugin is removed and put back.
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN = "com.malikacodes.mac-vitals";
// The date every file inside a profile is stamped with.
const BUILT = new Date("2026-10-13T12:00:00Z");

// The two decks: Stream Deck's number for the kind of deck (it goes in
// the plugin manifest), the model name it writes into its own profiles
// (both read from profiles on my Mac), and the key grid.
export const DEVICES = {
  xl: { type: 2, model: "20GAT9901", columns: 8, rows: 4 },
  plus: { type: 7, model: "20GBD9901", columns: 4, rows: 2 },
};

// Stream Deck's own Switch Profile action, pointed at my Home profile on
// each deck, so there's always a way back. It gets a picture of its own
// (home.svg, next to this file) because Stream Deck's stock icon for it
// isn't on a black background and has no room for a word. A profile id only means
// something on the Mac it was made on, so these two are mine. Each sits
// where the Home key is on my other profiles for that deck: top left on
// the XL, top right on the +.
const SWITCH_PROFILE = "com.elgato.streamdeck.profile.rotate";
const home = (profile) => ["home", { DeviceUUID: "", PageIndex: 1, ProfileUUID: profile }];
const HOME_IMAGE = "home.png";
const HOME_XL = home("cf9d2244-9062-42a9-973a-cfcd741e8769");
const HOME_PLUS = home("500d58a2-853c-4e0b-90e0-620d4a2e7ae2");

// Each key: [column, row, action, settings]. Columns and rows count from
// 0 at the top left, the way Stream Deck names positions.
//
// The computer's readings go on the left and the network's on the
// right. The Wi-Fi key's list of networks is left empty on purpose: my
// network names don't belong in a file that gets committed, so the key
// arrives saying "Add networks".
export const PROFILES = {
  "mac-vitals-xl": {
    name: "Mac Vitals XL",
    device: "xl",
    keys: [
      [0, 0, ...HOME_XL],
      [1, 0, "cpu", {}],
      [2, 0, "memory", {}],
      [4, 0, "down", {}],
      [5, 0, "up", {}],
      [6, 0, "ping", {}],
      [7, 0, "switch", {}],
    ],
  },
  "mac-vitals-plus": {
    name: "Mac Vitals +",
    device: "plus",
    keys: [
      [0, 0, "cpu", {}],
      [1, 0, "memory", {}],
      [2, 0, "switch", {}],
      [3, 0, ...HOME_PLUS],
      [0, 1, "down", {}],
      [1, 1, "up", {}],
      [2, 1, "ping", {}],
    ],
  },
};

// Ids made from a name, not from chance, so building twice gives the
// same ids.
function uuidFrom(name) {
  const hex = createHash("sha1").update(`mac-vitals:${name}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`.toUpperCase();
}

// One key, the way Stream Deck writes it into a profile.
function keyEntry(manifest, actionName, settings, id) {
  const base = { ActionID: uuidFrom(id).toLowerCase(), LinkedTitle: false, Resources: null, Settings: settings, State: 0 };
  if (actionName === "home") {
    return {
      ...base,
      Name: "Switch Profile",
      Plugin: { Name: "Switch Profile", UUID: SWITCH_PROFILE, Version: "1.0" },
      States: [{ FontFamily: "", FontSize: 12, FontStyle: "", FontUnderline: false, Image: `Images/${HOME_IMAGE}`, OutlineThickness: 2, ShowTitle: false, TitleAlignment: "bottom", TitleColor: "#ffffff" }],
      UUID: SWITCH_PROFILE,
    };
  }
  const action = manifest.Actions.find((a) => a.UUID === `${PLUGIN}.${actionName}`);
  if (!action) throw new Error(`No action ${actionName} in the manifest`);
  return {
    ...base,
    Name: action.Name,
    Plugin: { Name: manifest.Name, UUID: manifest.UUID, Version: manifest.Version },
    States: [{ FontFamily: "", FontSize: 12, FontStyle: "", FontUnderline: false, OutlineThickness: 2, ShowTitle: false, TitleAlignment: "bottom", TitleColor: "#ffffff" }],
    UUID: action.UUID,
  };
}

// The files inside one profile, as { path: object }.
export function profileFiles(key, manifest) {
  const profile = PROFILES[key];
  const root = `${uuidFrom(`${key}:profile`)}.sdProfile`;
  const page = uuidFrom(`${key}:page`);
  // Stream Deck's own exports carry an empty default page that isn't in
  // the page list. I do the same.
  const defaultPage = uuidFrom(`${key}:default`);
  const empty = { Controllers: [{ Actions: null, Type: "Keypad" }, { Actions: null, Type: "Encoder" }], Icon: "", Name: "" };

  const actions = {};
  for (const [column, row, actionName, settings] of profile.keys) {
    actions[`${column},${row}`] = keyEntry(manifest, actionName, settings, `${key}:${column},${row}`);
  }
  return {
    [`${root}/manifest.json`]: {
      Device: { Model: DEVICES[profile.device].model, UUID: "" },
      Name: profile.name,
      Pages: { Current: page.toLowerCase(), Default: defaultPage.toLowerCase(), Pages: [page.toLowerCase()] },
      Version: "3.0",
    },
    [`${root}/Profiles/${defaultPage}/manifest.json`]: empty,
    [`${root}/Profiles/${page}/manifest.json`]: { ...empty, Controllers: [{ Actions: actions, Type: "Keypad" }, { Actions: null, Type: "Encoder" }] },
  };
}

// Writes <dir>/<key>.streamDeckProfile for both profiles.
export async function writeProfiles(dir, manifest) {
  await mkdir(dir, { recursive: true });
  for (const key of Object.keys(PROFILES)) {
    const work = await mkdtemp(join(tmpdir(), "mac-vitals-profile-"));
    const files = profileFiles(key, manifest);
    for (const [path, content] of Object.entries(files)) {
      await mkdir(join(work, path, ".."), { recursive: true });
      await writeFile(join(work, path), JSON.stringify(content));
    }
    // A key's picture lives in an Images folder beside the page it's
    // on, and has to be a PNG. sips comes with macOS and does the
    // converting.
    const pagePath = Object.keys(files).find((path) => files[path].Controllers?.[0].Actions);
    const image = join(pagePath, "..", "Images", HOME_IMAGE);
    await mkdir(join(work, image, ".."), { recursive: true });
    execFileSync("sips", ["-s", "format", "png", fileURLToPath(new URL("home.svg", import.meta.url)), "--out", join(work, image)], { stdio: "ignore" });

    // A zip remembers when each file inside it was last changed. Left
    // alone, that's "just now" on every build, and git would see a new
    // file each time. So every file gets the same made-up date.
    for (const path of [...Object.keys(files), image]) await utimes(join(work, path), BUILT, BUILT);

    const out = join(dir, `${key}.streamDeckProfile`);
    await rm(out, { force: true });
    // Just the files, profile manifest first and no folder entries, the
    // way Stream Deck's own exports are laid out. -X leaves out extra
    // file attributes.
    execFileSync("zip", ["-q", "-X", "-D", out, ...Object.keys(files), image], { cwd: work });
    await rm(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pluginDir = join(fileURLToPath(new URL("..", import.meta.url)), `${PLUGIN}.sdPlugin`);
  const manifest = JSON.parse(await readFile(join(pluginDir, "manifest.json"), "utf8"));
  await writeProfiles(join(pluginDir, "profiles"), manifest);
  console.log(`Wrote ${PLUGIN}.sdPlugin/profiles`);
}
