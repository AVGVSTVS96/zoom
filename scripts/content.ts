// Builds app/content.json, the one file the app reads, from data/: the thread export
// (general.json), the designer's grouping (structure.json) and Muse Wonder's rewrites
// (zoom.json, once the pipeline has written it). data/ stays out of git, so the app gets its
// messages here, at build time. docs/design.md says what each level holds.
//   bun scripts/content.ts [data dir]
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const data = resolve(process.argv[2] ?? join(root, "data"));
const app = join(root, "app");
const zone = "America/Los_Angeles";

type Author = "owner" | "hex";
type Raw = {
  id: number;
  author: Author;
  at: string;
  text: string;
  image?: string;
  reply_to?: number;
  reply_to_text?: string;
  forwarded_from?: string;
  edited_at?: string;
  poll_options?: string;
};
type Rewritten = { author: Author; text: string; from: number[]; images: string[] };
type Loss = { score: number; lossless: boolean };
type Unit = { text: string; verdict: string; detail?: string };
type RewriteSet = { id: string; messageIds: number[]; rewrite: Rewritten[]; check: { loss: Loss; units: Unit[] } };
type Set = { id: string; title: string; messageIds: number[]; waiting?: string };
type Section = { id: string; title: string; sets: Set[] };

const read = <T>(name: string): T | undefined =>
  existsSync(join(data, name)) ? (JSON.parse(readFileSync(join(data, name), "utf8")) as T) : undefined;
const thread = read<{ from: string; to: string; messages: Raw[] }>("general.json");
const structure = read<{ sections: Section[] }>("structure.json");
if (!thread || !structure) throw new Error(`${data} needs general.json and structure.json`);
const zoom = read<{ sets: RewriteSet[]; loss: Loss }>("zoom.json");

const time = (at: string) => new Date(at).toLocaleTimeString("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" });
const day = (at: string) => new Date(at).toLocaleDateString("en-US", { timeZone: zone, weekday: "short" });
const when = (at: string) => `${day(at)} ${time(at)}`;
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

const byId = new Map(thread.messages.map((m) => [m.id, m]));
const rewrites = new Map(zoom?.sets.map((s) => [s.id, s]));
const placed = structure.sections.flatMap((s) => s.sets.flatMap((x) => x.messageIds));
const lost = thread.messages.filter((m) => !placed.includes(m.id)).map((m) => m.id);
const twice = placed.filter((id, i) => placed.indexOf(id) !== i);
if (lost.length || twice.length || placed.some((id) => !byId.has(id)))
  throw new Error(`structure.json must hold every message once: missing ${lost}, twice ${twice}`);

// Photos ship inside the app, never in git.
const media = join(app, "assets", "media");
rmSync(media, { recursive: true, force: true });
mkdirSync(media, { recursive: true });
const photo = (file?: string) => {
  if (!file) return "";
  copyFileSync(join(data, basename(file)), join(media, basename(file)));
  return `assets/media/${basename(file)}`;
};

const blank = { set: "", mine: false, text: "", title: "", detail: "", image: "", reply: "", note: "", waiting: "", count: 0, tint: "", poll: [] as string[], flag: "" };
type Row = typeof blank & { key: string; kind: string };
const row = (key: string, kind: string, fields: Partial<Row>): Row => ({ ...blank, ...fields, key, kind });
const tints = ["blue", "orange", "green", "purple", "pink", "teal", "indigo", "brown"].map((t) => `-exact-system-${t}`);

const original = (key: string, set: string, m: Raw): Row =>
  row(key, "message", {
    set,
    mine: m.author === "owner",
    text: m.image && m.text === "(photo)" ? "" : m.text,
    detail: time(m.at),
    image: photo(m.image),
    reply: m.reply_to_text ? oneLine(m.reply_to_text).slice(0, 160) : "",
    note: [m.forwarded_from && "Forwarded", m.edited_at && "Edited"].filter(Boolean).join(" · "),
    poll: m.poll_options ? m.poll_options.split(" / ") : [],
  });

const one: Row[] = [], two: Row[] = [], three: Row[] = [];
const places: { set: string; one: string; two: string; three: string }[] = [];
structure.sections.forEach((section, i) => {
  const tint = tints[i % tints.length];
  const ids = section.sets.flatMap((s) => s.messageIds);
  const head = { set: section.sets[0].id, title: section.title, tint, count: ids.length, detail: `${ids.length} messages` };
  one.push(row(`1-s-${section.id}`, "section", head));
  two.push(row(`2-s-${section.id}`, "section", head));
  three.push(row(`3-s-${section.id}`, "section", head));
  for (const set of section.sets) {
    const msgs = set.messageIds.map((id) => byId.get(id)!);
    const span = msgs.length > 1 && time(msgs[0].at) !== time(msgs.at(-1)!.at) ? `${when(msgs[0].at)} – ${day(msgs.at(-1)!.at) === day(msgs[0].at) ? time(msgs.at(-1)!.at) : when(msgs.at(-1)!.at)}` : when(msgs[0].at);
    const caption = { set: set.id, title: set.title, detail: span, tint, count: msgs.length };
    one.push(row(`1-${set.id}`, "set", caption));
    for (const m of msgs) one.push(original(`1-${set.id}-${m.id}`, set.id, m));

    two.push(row(`2-${set.id}`, "set", caption));
    const rewrite = rewrites.get(set.id);
    if (rewrite?.check.loss.lossless) {
      rewrite.rewrite.forEach((r, n) =>
        two.push(row(`2-${set.id}-${n}`, "line", { set: set.id, mine: r.author === "owner", text: r.text, image: photo(r.images[0]), count: r.from.length })),
      );
    } else {
      // The design's rule 3: a set whose check isn't lossless shows its originals here.
      const flag = rewrite ? "Muse Wonder's version lost something, so these are the originals" : "";
      msgs.forEach((m, n) => two.push({ ...original(`2-${set.id}-${n}`, set.id, m), flag: n === 0 ? flag : "" }));
    }

    three.push(row(`3-${set.id}`, "entry", { ...caption, detail: span, waiting: set.waiting ?? "" }));
    places.push({ set: set.id, one: `1-${set.id}`, two: `2-${set.id}`, three: `3-${set.id}` });
  }
});

const loss = zoom?.loss;
const content = {
  title: "General",
  span: `${when(thread.from)} – ${when(thread.to)}`,
  messages: thread.messages.length,
  kept: loss ? `${Math.round(loss.score * 1000) / 10}% kept` : "",
  lossless: loss?.lossless ?? false,
  one,
  two,
  three,
  places,
};
writeFileSync(join(app, "content.json"), `${JSON.stringify(content, null, 1)}\n`);
const concise = two.filter((r) => r.kind === "line").length;
console.log(`app/content.json: ${thread.messages.length} messages, ${places.length} sets in ${structure.sections.length} sections, ${concise ? `${concise} concise messages` : "no rewrites yet (level 2 shows the originals)"}`);
