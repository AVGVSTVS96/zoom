// Builds app/content.json, the one file the app reads, from data/: the thread export
// (general.json), the designer's grouping (structure.json) and Haiku's summaries
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
type RewriteSet = { id: string; messageIds: number[]; rewrite: Rewritten[] };
type Set = { id: string; title: string; messageIds: number[]; waiting?: string };
type Section = { id: string; title: string; sets: Set[] };

const read = <T>(name: string): T | undefined =>
  existsSync(join(data, name)) ? (JSON.parse(readFileSync(join(data, name), "utf8")) as T) : undefined;
const thread = read<{ from: string; to: string; messages: Raw[] }>("general.json");
const structure = read<{ sections: Section[] }>("structure.json");
if (!thread || !structure) throw new Error(`${data} needs general.json and structure.json`);
const zoom = read<{ sets: RewriteSet[] }>("zoom.json");

const time = (at: string) => new Date(at).toLocaleTimeString("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" });
const day = (at: string) => new Date(at).toLocaleDateString("en-US", { timeZone: zone, weekday: "short" });
const when = (at: string) => `${day(at)} ${time(at)}`;
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

const byId = new Map(thread.messages.map((m) => [m.id, m]));
const rewrites = new Map(zoom?.sets.map((s) => [s.id, s]));
const placed = structure.sections.flatMap((s) => s.sets.flatMap((x) => x.messageIds));
const twice = placed.filter((id, i) => placed.indexOf(id) !== i);
const unknown = placed.filter((id) => !byId.has(id));
if (twice.length || unknown.length) throw new Error(`structure.json places ${twice} twice and ${unknown} that aren't in the thread`);
// A message the grouping hasn't placed yet still shows, in a last section, one set to a message:
// nothing in the thread goes missing from the app.
const unplaced = thread.messages.filter((m) => !placed.includes(m.id));
if (unplaced.length) {
  console.warn(`structure.json doesn't place ${unplaced.map((m) => m.id)}; they go under "Not sorted yet"`);
  structure.sections.push({
    id: "unsorted",
    title: "Not sorted yet",
    sets: unplaced.map((m) => ({ id: `unsorted-${m.id}`, title: oneLine(m.text).slice(0, 28) || "Photo", messageIds: [m.id] })),
  });
}

// Photos ship inside the app, never in git.
const media = join(app, "assets", "media");
rmSync(media, { recursive: true, force: true });
mkdirSync(media, { recursive: true });
const photo = (file?: string) => {
  if (!file) return "";
  copyFileSync(join(data, basename(file)), join(media, basename(file)));
  return `assets/media/${basename(file)}`;
};

// A message as its level shows it: Full adds its time ("edited" before it when it was), the message it
// replies to, a photo, a poll's options and who forwarded or sent it; Short is the summary's text alone.
// A post older than the window and edited inside it shows the edit's time.
type Raw2 = Raw & { older_message_edited_in_window?: boolean; sent_by?: string | null };
const withRoom = <M extends { time: string }>(m: M) => ({ ...m, room: room(m.time) });
const message = (key: string, m: Raw2) => withRoom({
  key,
  mine: m.author === "owner",
  text: m.image && m.text === "(photo)" ? "" : m.text,
  time: `${m.edited_at ? "edited " : ""}${m.older_message_edited_in_window ? when(m.edited_at ?? m.at) : time(m.at)}`,
  image: photo(m.image),
  reply: m.reply_to_text ? oneLine(m.reply_to_text).slice(0, 160) : "",
  note: [m.forwarded_from && "Forwarded", m.sent_by && `Sent by ${m.sent_by}`].filter(Boolean).join(" · "),
  poll: m.poll_options ? m.poll_options.split(" / ") : [],
});
// Messages in a row from one side join, as a chat draws them: `top` opens a run, `tail` closes it.
const runs = <M extends { mine: boolean }>(list: M[]) =>
  list.map((m, i) => ({ ...m, top: list[i - 1]?.mine !== m.mine, tail: list[i + 1]?.mine !== m.mine }));
// The room a message's last line keeps for its time: no-break spaces about as wide as the time at
// 11pt, after an ordinary space, so a full last line puts the time on a line of its own.
const room = (time: string) => (time ? ` ${"\u00a0".repeat(Math.ceil((time.length * 5.9 + 8) / 4.4))}` : "");
const shown = (m: Raw2) => m.older_message_edited_in_window ? m.edited_at ?? m.at : m.at;

// Where a zoom lands: `<from level><to level>:<key>=<key>` for every place whose key differs between
// two levels (docs/design.md, Zooming). An original's key is `msg-<id>`; a rewritten message's is the
// first original it carries, so a pinch in lands on that original.
const anchors: string[] = [];
const stale: string[] = [];
const tally = { full: 0, short: 0 };
const sections = structure.sections.map((section) => ({
  id: section.id,
  title: section.title,
  time: when(shown(byId.get(section.sets[0].messageIds[0])!)),
  sets: section.sets.map((set) => {
    const msgs = set.messageIds.map((id) => byId.get(id)!);
    // A rewrite counts only for the messages it was written from: when the grouping moves a message,
    // the set shows its originals until the pipeline rewrites it again.
    const written = rewrites.get(set.id);
    const rewrite = written && written.messageIds.join() === set.messageIds.join() ? written : undefined;
    if (written && !rewrite) stale.push(set.id);
    const full = msgs.map((m) => message(`msg-${m.id}`, m));
    const used = new Set<string>();
    const short = rewrite
      ? rewrite.rewrite.map((r, n) => {
          const first = r.from.find((id) => set.messageIds.includes(id));
          let key = first ? `msg-${first}` : `${set.id}-${n}`;
          if (used.has(key)) key = `${key}-${n}`;
          used.add(key);
          return { ...message(key, { ...byId.get(first ?? msgs[0].id)!, text: r.text, image: r.images[0] }), time: "", room: "", reply: "", note: "", from: r.from };
        })
      : full.map((m) => ({ ...m, from: [Number(m.key.slice(4))] }));
    if (rewrite) {
      tally.full += msgs.reduce((n, m) => n + m.text.length, 0);
      tally.short += short.reduce((n, m) => n + m.text.length, 0);
    }
    for (const m of short) {
      const down = m.from.find((id) => set.messageIds.includes(id));
      if (`msg-${down}` !== m.key) anchors.push(`21:${m.key}=${down ? `msg-${down}` : set.id}`);
      anchors.push(`23:${m.key}=${set.id}`);
    }
    for (const m of msgs) {
      // An original no rewritten message carries (said twice, or superseded) lands on the one before it.
      const up = short.findLast((r) => r.from.includes(m.id)) ?? short.findLast((r) => (r.from[0] ?? 0) <= m.id);
      if (up?.key !== `msg-${m.id}`) anchors.push(`12:msg-${m.id}=${up?.key ?? set.id}`);
      anchors.push(`13:msg-${m.id}=${set.id}`);
    }
    return {
      id: set.id,
      title: set.title,
      count: msgs.length,
      kept: "",
      original: !rewrite,
      short: runs(short.map(({ from, ...m }) => m)),
      full: runs(full),
    };
  }),
}));

if (stale.length) console.warn(`zoom.json rewrote ${stale} from other messages than structure.json now holds; they show their originals`);
const sets = sections.flatMap((s) => s.sets);
const rewritten = sets.filter((s) => !s.original).length;
const content = {
  totals: [
    `${thread.messages.length} messages`,
    `${sets.length} sets`,
    rewritten
      ? `Short is ${Math.round((tally.short / tally.full) * 100)}% of Full${rewritten < sets.length ? ` (${rewritten} of ${sets.length} sets summarized)` : ""}`
      : "Not summarized yet",
  ].join(" · "),
  anchors,
  sections,
};
writeFileSync(join(app, "content.json"), `${JSON.stringify(content, null, 1)}\n`);
console.log(`app/content.json: ${thread.messages.length} messages, ${sets.length} sets in ${sections.length} sections, ${sets.filter((s) => !s.original).length} summarized`);
