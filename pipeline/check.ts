import { claude } from "./llm";
import { render } from "./rewrite";
import type { Addition, Check, Loss, Message, Rewritten, Unit, Verbatim, Verdict } from "./types";

/** Splits each message into sentences, list items and code blocks: the units the judge has to account for one by one. */
export function units(messages: Message[]): Unit[] {
  const out: Unit[] = [];
  for (const m of messages) {
    const pieces: string[] = [];
    for (const [i, chunk] of m.text.split(/(```[\s\S]*?```)/).entries()) {
      if (i % 2) pieces.push(chunk);
      else
        for (const line of chunk.split("\n")) {
          const links: string[] = [];
          const held = line.replace(/\[[^\]]*\]\([^)]*\)/g, (link) => `\uE000${links.push(link) - 1}\uE000`);
          const sentences = held.split(/(?<=[a-z0-9)"'`*]{2}[.!?])\s+(?=[A-Za-z0-9"“([*`])/);
          for (const [i, piece] of sentences.entries()) {
            // A list marker like "10." belongs to the sentence after it.
            if (/^\s*\d+\.$/.test(piece) && i + 1 < sentences.length) sentences[i + 1] = `${piece} ${sentences[i + 1]}`;
            else pieces.push(piece.replace(/\uE000(\d+)\uE000/g, (_, n) => links[Number(n)]));
          }
        }
    }
    if (m.poll) pieces.push(`Poll options: ${m.poll.join(" / ")}`);
    // A photo rides along with its set, so its "(photo)" placeholder is no sentence to carry.
    if (m.image && pieces.length === 1 && pieces[0].trim() === "(photo)") pieces.pop();
    for (const text of pieces.map((p) => p.trim()).filter(Boolean))
      out.push({ id: `U${out.length + 1}`, messageId: m.id, text, verdict: "missing" });
  }
  return out;
}

const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/** Text compared loosely: case, markdown, quote marks, dash kinds and spacing don't count. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, "$1 $2")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/…/g, "...")
    .replace(/[*_`#>•[\]()]/g, " ")
    .replace(/^\s*(?:-|\d+\.)\s+/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Links, code spans, numbers and IDs, each of which has to appear in the rewrite word for word. */
export function verbatim(messages: Message[], rewrite: Rewritten[]): Verbatim[] {
  const text = rewrite.map((r) => r.text).join("\n");
  const flat = normalize(text);
  const seen = new Set<string>();
  const out: Verbatim[] = [];
  const add = (messageId: number, kind: Verbatim["kind"], item: string, kept: boolean) => {
    if (seen.has(`${kind}:${item}`)) return;
    seen.add(`${kind}:${item}`);
    out.push({ messageId, kind, text: item, kept });
  };
  for (const m of messages) {
    for (const url of m.text.match(/https?:\/\/[^\s)\]>]+/g) ?? []) {
      const clean = url.replace(/[.,;:!?'"]+$/, "");
      add(m.id, "link", clean, text.includes(clean));
    }
    for (const [, code] of m.text.replace(/```[\s\S]*?```/g, "").matchAll(/`([^`\n]+)`/g))
      add(m.id, "code", code, text.includes(code));
    const prose = m.text
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`[^`\n]+`/g, " ")
      .replace(/https?:\/\/[^\s)\]>]+/g, " ")
      .replace(/^\s*\d+\.\s/gm, " ");
    for (const raw of prose.match(/[\w#$.:,/-]*\d[\w#$.:,/-]*/g) ?? []) {
      const atom = raw.replace(/^[.,:/-]+|[.,:/-]+$/g, "");
      if (!atom) continue;
      add(m.id, "number", atom, numberKept(atom, flat));
    }
  }
  return out;
}

function numberKept(atom: string, flat: string): boolean {
  const a = normalize(atom);
  const core = /^[\d.,:]+[a-z]+$/.test(a) ? a.replace(/[a-z]+$/, "") : a;
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const alts = [core, words[Number(core)]].filter(Boolean).map(escape);
  return new RegExp(`(?<![\\w]|\\d\\.)(?:${alts.join("|")})(?![\\d])`).test(flat);
}

/** True when every piece of `quote` (split at an ellipsis) appears in `text`, in order. */
export function quoted(quote: string, text: string): boolean {
  const pieces = normalize(quote).split("...").map((p) => p.trim()).filter(Boolean);
  if (!pieces.length) return false;
  let from = 0;
  for (const piece of pieces) {
    const at = text.indexOf(piece, from);
    if (at < 0) return false;
    from = at + piece.length;
  }
  return true;
}

const judge = `You check a rewrite of Telegram messages for loss. Bassim needs it lossless: someone who reads only the rewrite learns everything the originals tell them, and nothing they don't.

The originals are split into numbered units. Account for every unit:
- kept: everything it tells the reader is in the rewrite with the same meaning. quote: the rewrite's words that carry it, copied exactly.
- duplicate: another unit says the same thing. ref: that unit.
- superseded: a later unit corrects or replaces it (a revised draft, a correction), and the reader loses nothing they'd want by not seeing this earlier version. ref: the later unit.
- partial: some of it is there, but a detail is gone or vaguer. quote what is there; detail: exactly what's missing.
- changed: the rewrite says something different (a wrong number, person, or time; a hedge turned certain; a reason or caveat altered). quote and detail.
- missing: none of it is there. detail: what's lost.
- dropped: a greeting, acknowledgement, apology or bit of tone that tells the reader nothing, left out.

Who said what holds: Bassim's words stay his and hex's stay hex's; a guess stays a guess, what was checked stays checked, a question to him stays a question, and an option he ruled out stays ruled out. Anything else is changed.

Be strict about information: a dropped name, number, link, list item, reason or condition, or a change in how sure something is, makes a unit partial. Wording isn't information: rewording, merging, reordering, and cutting filler or emphasis that doesn't change what the reader knows or would do are fine. So are formatting, emoji and message metadata (times, ids, reply markers).

Then list additions: anything the rewrite states that the originals don't support, quoted exactly.`;

const schema = {
  type: "object",
  properties: {
    units: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          verdict: { type: "string", enum: ["kept", "duplicate", "superseded", "dropped", "partial", "changed", "missing"] },
          quote: { type: "string" },
          ref: { type: "string" },
          detail: { type: "string" },
        },
        required: ["id", "verdict", "quote", "ref", "detail"],
        additionalProperties: false,
      },
    },
    additions: {
      type: "array",
      items: {
        type: "object",
        properties: { quote: { type: "string" }, detail: { type: "string" } },
        required: ["quote", "detail"],
        additionalProperties: false,
      },
    },
  },
  required: ["units", "additions"],
  additionalProperties: false,
};

type Judged = { units: { id: string; verdict: Verdict; quote: string; ref: string; detail: string }[]; additions: Addition[] };

const severity: Record<Verdict, number> = { kept: 0, duplicate: 0, superseded: 0, dropped: 0, partial: 1, changed: 2, missing: 3 };
const conveyed = (v: Verdict) => severity[v] === 0;

/** One judge run, with every quote and reference it gives checked in code. */
async function judgeOnce(messages: Message[], base: Unit[], rewrite: Rewritten[], run: number) {
  const text = rewrite.map((r) => `${r.author}: ${r.text}`).join("\n\n");
  const flat = normalize(text);
  const prompt = [
    "# Originals",
    messages.map(render).join("\n\n"),
    "# Units",
    base.map((u) => `${u.id} (msg ${u.messageId}): ${u.text}`).join("\n"),
    "# Rewrite",
    text,
  ].join("\n\n");
  const judged = await claude<Judged>(judge, prompt, schema, run);
  const byId = new Map(judged.units.map((j) => [j.id, j]));
  const index = new Map(base.map((u, i) => [u.id, i]));
  const result: Unit[] = base.map((u) => {
    const j = byId.get(u.id);
    if (!j) return { ...u, verdict: "missing", detail: "The checker gave no verdict for this unit." };
    const unit: Unit = { ...u, verdict: j.verdict };
    if (j.quote) unit.quote = j.quote;
    if (j.detail) unit.detail = j.detail;
    if (j.ref) unit.ref = j.ref;
    if ((j.verdict === "kept" || j.verdict === "partial" || j.verdict === "changed") && !quoted(j.quote, flat))
      return { ...unit, verdict: j.verdict === "kept" ? "partial" : j.verdict, detail: `${j.detail ? `${j.detail} ` : ""}(The checker's quote isn't in the rewrite, so it's unproven.)` };
    if (j.verdict === "duplicate" || j.verdict === "superseded") {
      const at = index.get(j.ref);
      const ok = at !== undefined && j.ref !== u.id && (j.verdict === "duplicate" || at > index.get(u.id)!);
      if (!ok) return { ...unit, verdict: "partial", detail: `Marked ${j.verdict} of ${j.ref || "nothing"}, which isn't a valid unit for it.` };
    }
    return unit;
  });
  // A duplicate or superseded unit is only as safe as the unit it points to.
  for (let pass = 0; pass < result.length; pass++) {
    let moved = false;
    for (const u of result) {
      if ((u.verdict === "duplicate" || u.verdict === "superseded") && u.ref) {
        const target = result[index.get(u.ref)!];
        if (!conveyed(target.verdict) || (target.ref === u.id)) {
          u.verdict = "partial";
          u.detail = `Points to ${u.ref}, which didn't come through itself.`;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  const additions = judged.additions.filter((a) => quoted(a.quote, flat));
  return { units: result, additions };
}

/**
 * Checks a rewrite against its originals: every unit accounted for by `runs` independent
 * judges (the worst verdict wins), plus every link, code span, number and photo in code.
 */
export async function check(messages: Message[], rewrite: Rewritten[], runs: number[]): Promise<Check> {
  const base = units(messages);
  const judged = await Promise.all(runs.map((run) => judgeOnce(messages, base, rewrite, run)));
  const merged = base.map((_, i) =>
    judged.map((j) => j.units[i]).reduce((a, b) => (severity[b.verdict] > severity[a.verdict] ? b : a)),
  );
  const additions = judged.flatMap((j) => j.additions).filter((a, i, all) => all.findIndex((b) => normalize(b.quote) === normalize(a.quote)) === i);
  const exact = verbatim(messages, rewrite);
  for (const m of messages.filter((m) => m.image))
    exact.push({ messageId: m.id, kind: "image", text: m.image!, kept: rewrite.some((r) => r.images.includes(m.image!)) });
  return { loss: loss(merged, exact, additions.length), units: merged, verbatim: exact, additions };
}

export function loss(units: Unit[], exact: Verbatim[], additions: number): Loss {
  const unitsKept = units.filter((u) => conveyed(u.verdict)).length;
  const verbatimKept = exact.filter((v) => v.kept).length;
  const total = units.length + exact.length;
  return {
    units: units.length,
    unitsKept,
    verbatim: exact.length,
    verbatimKept,
    additions,
    score: total ? (unitsKept + verbatimKept) / total : 1,
    lossless: unitsKept === units.length && verbatimKept === exact.length && additions === 0,
  };
}

/** What a check found, written for the rewriter to put back. */
export function gaps(c: Check): string[] {
  return [
    ...c.units
      .filter((u) => !conveyed(u.verdict))
      .map((u) => `msg ${u.messageId}, "${u.text}": ${u.verdict}. ${u.detail ?? ""}`.trim()),
    ...c.verbatim.filter((v) => !v.kept && v.kind !== "image").map((v) => `msg ${v.messageId}: "${v.text}" has to appear exactly as written.`),
    ...c.additions.map((a) => `Not in the originals: "${a.quote}". ${a.detail}`),
  ];
}
