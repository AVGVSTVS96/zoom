import type { Zoom } from "./types";

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** The summaries, written for a person: each set's length against its originals, then the text. */
export function report(zoom: Zoom, titles: Map<string, string>): string {
  const out = [
    `# zoom summaries`,
    ``,
    `${zoom.thread}, ${zoom.messages.length} messages, ${zoom.sets.length} sets. Summaries by ${zoom.model}. ${zoom.generatedAt}.`,
    ``,
    `| set | length |`,
    `| --- | --- |`,
    ...zoom.sets.map((s) => `| ${titles.get(s.id) ?? s.id} | ${pct(s.length)} |`),
    ``,
  ];
  for (const s of zoom.sets) {
    out.push(`## ${titles.get(s.id) ?? s.id}`, ``);
    for (const r of s.rewrite) out.push(`**${r.author}** (${r.from.join(", ")})`, ``, r.text, ``);
  }
  return out.join("\n");
}
