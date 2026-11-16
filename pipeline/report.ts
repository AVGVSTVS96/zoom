import type { Loss, Zoom } from "./types";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const line = (l: Loss) =>
  `${l.unitsKept}/${l.units} units, ${l.verbatimKept}/${l.verbatim} exact, ${l.additions} added`;

/** The loss check, written for a person: the numbers, then every miss and every fold. */
export function report(zoom: Zoom, titles: Map<string, string>): string {
  const text = new Map(zoom.messages.map((m) => [m.id, m.text]));
  const original = (ids: number[]) => ids.reduce((n, id) => n + (text.get(id)?.length ?? 0), 0);
  const out = [
    `# zoom loss report`,
    ``,
    `${zoom.thread}, ${zoom.messages.length} messages, ${zoom.sets.length} sets. Rewrites by ${zoom.models.rewrite}, checked by ${zoom.models.check}. ${zoom.generatedAt}.`,
    ``,
    `**${pct(zoom.loss.score)} came through** (${line(zoom.loss)}). ${zoom.sets.filter((s) => s.check.loss.lossless).length} of ${zoom.sets.length} sets lossless. Rewrites are ${pct(zoom.sets.reduce((n, s) => n + s.rewrite.reduce((m, r) => m + r.text.length, 0), 0) / original(zoom.sets.flatMap((s) => s.messageIds)))} of the originals' length. Muse Wonder cost $${zoom.costUsd.toFixed(2)} this run.`,
    ``,
    `A unit is one sentence, list item or code block of an original. Two independent judges account for every unit against the rewrite, the stricter verdict counts, and every quote they give as evidence is checked to be in the rewrite word for word. "Exact" is every link, code span, number, ID and photo, checked in code.`,
    ``,
    `| set | came through | units | exact | added | length |`,
    `| --- | --- | --- | --- | --- | --- |`,
    ...zoom.sets.map(
      (s) =>
        `| ${titles.get(s.id) ?? s.id} | ${s.check.loss.lossless ? "lossless" : pct(s.check.loss.score)} | ${s.check.loss.unitsKept}/${s.check.loss.units} | ${s.check.loss.verbatimKept}/${s.check.loss.verbatim} | ${s.check.loss.additions} | ${pct(s.length)} |`,
    ),
  ];
  const misses = zoom.sets.flatMap((s) => [
    ...s.check.units
      .filter((u) => ["partial", "changed", "missing"].includes(u.verdict))
      .map((u) => `- **${titles.get(s.id) ?? s.id}**, msg ${u.messageId}, ${u.verdict}: "${u.text}"\n  ${u.detail ?? ""}`),
    ...s.check.verbatim.filter((v) => !v.kept).map((v) => `- **${titles.get(s.id) ?? s.id}**, msg ${v.messageId}, ${v.kind} not kept exactly: \`${v.text}\``),
  ]);
  out.push(``, `## What was lost`, ``, misses.length ? misses.join("\n") : "Nothing.");
  const added = zoom.sets.flatMap((s) => s.check.additions.map((a) => `- **${titles.get(s.id) ?? s.id}**: "${a.quote}"\n  ${a.detail}`));
  out.push(``, `## What the rewrites added`, ``, added.length ? added.join("\n") : "Nothing.");
  const folds = zoom.sets.flatMap((s) =>
    s.check.units
      .filter((u) => u.verdict === "superseded" || u.verdict === "duplicate" || u.verdict === "dropped")
      .map((u) => `- **${titles.get(s.id) ?? s.id}**, msg ${u.messageId}, ${u.verdict}${u.ref ? ` by ${u.ref}` : ""}: "${u.text}"${u.detail ? `\n  ${u.detail}` : ""}`),
  );
  out.push(
    ``,
    `## What folded away`,
    ``,
    `Counted as carried: a duplicate or superseded unit's information is in the unit named, which came through; a dropped one is a greeting, acknowledgement, apology or tone.`,
    ``,
    folds.length ? folds.join("\n") : "Nothing.",
  );
  out.push(``, `## The rewrites`, ``);
  for (const s of zoom.sets) {
    out.push(`### ${titles.get(s.id) ?? s.id}`, ``);
    for (const r of s.rewrite) out.push(`**${r.author}** (${r.from.join(", ")})`, ``, r.text, ``);
  }
  return out.join("\n");
}
