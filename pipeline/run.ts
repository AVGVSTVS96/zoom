// Builds data/zoom.json and data/zoom-report.md from data/general.json and data/structure.json.
//   bun pipeline/run.ts                 every set
//   bun pipeline/run.ts --sets a,b      only these sets, merged into the existing zoom.json
//   bun pipeline/run.ts --stdin         messages (Message[] JSON) in, { rewrite, check } out
//   bun pipeline/run.ts --rescore       fresh judges re-check the rewrites in zoom.json; no Muse Wonder calls
// Needs OPENROUTER_API_KEY. Muse Wonder and judge answers are cached in data/cache.

import { join } from "node:path";
import { parseArgs } from "node:util";
import { check, loss } from "./check";
import { claudeModel, costUsd, museModel, pool } from "./llm";
import { report } from "./report";
import { source } from "./source";
import type { Message, RewriteSet, Zoom } from "./types";
import { zoom } from "./zoom";

const dataDir = join(import.meta.dir, "../data");
const { values } = parseArgs({ options: { sets: { type: "string" }, stdin: { type: "boolean" }, rescore: { type: "boolean" } } });

if (values.stdin) {
  const messages: Message[] = JSON.parse(await Bun.stdin.text());
  console.log(JSON.stringify(await zoom(messages, dataDir), null, 1));
  process.exit(0);
}

type StructureSet = { id: string; title: string; messageIds: number[] };
const structure: { sections: { sets: StructureSet[] }[] } = await Bun.file(join(dataDir, "structure.json")).json();
const thread = await source(join(dataDir, "general.json"));
const byId = new Map(thread.messages.map((m) => [m.id, m]));
const all = structure.sections.flatMap((s) => s.sets);
const only = values.sets?.split(",");
const out = join(dataDir, "zoom.json");
const previous: Zoom | undefined = (only || values.rescore) && (await Bun.file(out).exists()) ? await Bun.file(out).json() : undefined;
if (values.rescore && !previous) throw new Error("--rescore needs data/zoom.json");

const done = await pool(
  all.filter((s) => !only || only.includes(s.id)),
  4,
  async (set): Promise<RewriteSet> => {
    const messages = set.messageIds.map((id) => byId.get(id)!);
    const kept = values.rescore && previous!.sets.find((p) => p.id === set.id);
    const result = kept ? { rewrite: kept.rewrite, check: await check(messages, kept.rewrite, [1, 2]), rounds: 0 } : await zoom(messages, dataDir);
    const before = messages.reduce((n, m) => n + m.text.length, 0);
    const after = result.rewrite.reduce((n, r) => n + r.text.length, 0);
    const l = result.check.loss;
    console.error(`${set.id}: ${l.unitsKept}/${l.units} units, ${l.verbatimKept}/${l.verbatim} exact, ${l.additions} added, ${result.rounds} rounds`);
    return { id: set.id, messageIds: set.messageIds, rewrite: result.rewrite, length: after / before, check: result.check };
  },
);

const fresh = new Map(done.map((s) => [s.id, s]));
const sets = all.map((s) => fresh.get(s.id) ?? previous?.sets.find((p) => p.id === s.id)).filter((s): s is RewriteSet => !!s);
const zoomed: Zoom = {
  thread: thread.thread,
  from: thread.from,
  to: thread.to,
  generatedAt: new Date().toISOString(),
  models: { rewrite: museModel, check: claudeModel },
  messages: thread.messages,
  sets,
  sections: structure.sections,
  loss: loss(
    sets.flatMap((s) => s.check.units),
    sets.flatMap((s) => s.check.verbatim),
    sets.reduce((n, s) => n + s.check.additions.length, 0),
  ),
  costUsd: await costUsd(),
};
await Bun.write(out, JSON.stringify(zoomed, null, 1));
await Bun.write(join(dataDir, "zoom-report.md"), report(zoomed, new Map(all.map((s) => [s.id, s.title]))));
console.error(`zoom.json: ${(zoomed.loss.score * 100).toFixed(1)}% came through, $${zoomed.costUsd.toFixed(2)} of Muse Wonder calls so far`);
