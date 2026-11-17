// Builds data/zoom.json and data/zoom-report.md from data/general.json and data/structure.json.
//   bun pipeline/run.ts                 every set
//   bun pipeline/run.ts --sets a,b      only these sets, merged into the existing zoom.json
//   bun pipeline/run.ts --stdin         messages (Message[] JSON) in, their summary out
// Summaries come from `claude -p`, cached in data/cache.

import { join } from "node:path";
import { parseArgs } from "node:util";
import { claudeModel, pool } from "./llm";
import { report } from "./report";
import { length, summarize } from "./rewrite";
import { source } from "./source";
import type { Message, RewriteSet, Zoom } from "./types";

const dataDir = join(import.meta.dir, "../data");
const { values } = parseArgs({ options: { sets: { type: "string" }, stdin: { type: "boolean" } } });

if (values.stdin) {
  const messages: Message[] = JSON.parse(await Bun.stdin.text());
  console.log(JSON.stringify(await summarize(messages), null, 1));
  process.exit(0);
}

type StructureSet = { id: string; title: string; messageIds: number[] };
const structure: { sections: { sets: StructureSet[] }[] } = await Bun.file(join(dataDir, "structure.json")).json();
const thread = await source(join(dataDir, "general.json"));
const byId = new Map(thread.messages.map((m) => [m.id, m]));
const all = structure.sections.flatMap((s) => s.sets);
const only = values.sets?.split(",");
const out = join(dataDir, "zoom.json");
const previous: Zoom | undefined = only && (await Bun.file(out).exists()) ? await Bun.file(out).json() : undefined;

const done = await pool(
  all.filter((s) => !only || only.includes(s.id)),
  4,
  async (set): Promise<RewriteSet> => {
    const messages = set.messageIds.map((id) => byId.get(id)!);
    const rewrite = await summarize(messages);
    const share = length(rewrite) / length(messages);
    console.error(`${set.id}: ${Math.round(share * 100)}%`);
    return { id: set.id, messageIds: set.messageIds, rewrite, length: share };
  },
);

const fresh = new Map(done.map((s) => [s.id, s]));
const sets = all.map((s) => fresh.get(s.id) ?? previous?.sets.find((p) => p.id === s.id)).filter((s): s is RewriteSet => !!s);
const zoomed: Zoom = {
  thread: thread.thread,
  from: thread.from,
  to: thread.to,
  generatedAt: new Date().toISOString(),
  model: claudeModel,
  messages: thread.messages,
  sets,
  sections: structure.sections,
};
await Bun.write(out, JSON.stringify(zoomed, null, 1));
await Bun.write(join(dataDir, "zoom-report.md"), report(zoomed, new Map(all.map((s) => [s.id, s.title]))));
const total = sets.reduce((n, s) => n + length(s.rewrite), 0) / length(sets.flatMap((s) => s.messageIds.map((id) => byId.get(id)!)));
console.error(`zoom.json: summaries are ${Math.round(total * 100)}% of the originals' length`);
