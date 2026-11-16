import { join } from "node:path";
import { muse, type Part, type Turn } from "./llm";
import type { Message, Rewritten } from "./types";

const system = `You edit a stretch of a Telegram chat between Bassim ("owner") and hex, his AI assistant, into a shorter version he reads in place of the originals.

The messages were sent one after another and never edited, so they run long: explanations a later message overturns, drafts that get replaced, points made twice, preambles, hedges and words that carry nothing. Make every message as short as it can be while it still says everything: tighter sentences, each point once in its final form, hex's messages in a row merged into one, reasoning a later message overturns folded into a few words. Write full, natural sentences in each speaker's own voice, with hex speaking to Bassim as "you": the cutting comes from saying each thing once and dropping what carries nothing, never from dropping the articles and verbs that make it read well. This is the same conversation, shorter; not an overview of it.

Everything a reader learns has to survive: every fact, name, number, date and time, link, ID, list item, step, question, request, decision, caveat and open question, and who said each, with a guess still a guess and a ruled-out option still ruled out. Links, code, commands and anything meant to be copied (like a drafted text to send) stay exactly as written. Greetings, acknowledgements, apologies, promises the set goes on to keep, and tone can go. A strict check compares your version with the originals and sends back anything it lost, so cut boldly.

Photos show beside your rewrite as sent, so they need no description. Each original opens with a header line (its id, author, time, and what it replies to) that's metadata, not text, and a quoted message a reply points to is context from outside the set, not one of its messages.

Write Telegram markdown. Use a comma, colon or semicolon where an em dash might go.

Return the rewritten messages, each with its author and "from": the ids of the originals it carries. Every original id is in some "from".`;

const schema = {
  type: "object",
  properties: {
    messages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          author: { type: "string", enum: ["owner", "hex"] },
          text: { type: "string" },
          from: { type: "array", items: { type: "integer" } },
        },
        required: ["author", "text", "from"],
        additionalProperties: false,
      },
    },
  },
  required: ["messages"],
  additionalProperties: false,
};

const time = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
});

export function render(m: Message): string {
  const meta = [
    m.author,
    `${time.format(new Date(m.at))} PT`,
    m.replyTo && `reply to ${m.replyTo}${m.replyToText ? ` ("${m.replyToText}")` : ""}`,
    m.forwardedFrom && `forwarded`,
    m.poll && `poll: ${m.poll.join(" / ")}`,
    m.image && "photo attached",
  ].filter(Boolean);
  return `[${m.id}] ${meta.join(" · ")}\n${m.text}`;
}

async function originals(messages: Message[], dataDir: string): Promise<Part[]> {
  const parts: Part[] = [];
  for (const m of messages) {
    parts.push({ type: "text", text: render(m) });
    if (m.image) {
      const bytes = await Bun.file(join(dataDir, m.image)).bytes();
      parts.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}` } });
    }
  }
  return parts;
}

/** A length to aim for: without one, Muse Wonder keeps nearly every word. */
function target(messages: Message[]): string {
  const length = messages.reduce((n, m) => n + m.text.length, 0);
  return `These are ${length} characters; aim for about ${Math.round(length * 0.7)}.`;
}

type Draft = { messages: Omit<Rewritten, "images">[] };

/** Asks Muse Wonder to put back what a check found `draft` lost. */
export const repair = (gaps: string[]) =>
  `A strict check against the originals found what this draft lost or changed:\n\n${gaps.map((g) => `- ${g}`).join("\n")}\n\nChange only what it takes to carry these, and keep the rest of your draft as it is.`;

/** Asks Muse Wonder to cut a lossless draft that came out long. */
export const tighten = (share: number) =>
  `A strict check found nothing lost, but this is ${Math.round(share * 100)}% of the originals' length. Cut what's left to cut, keeping everything it says and keeping it in full, natural sentences.`;

/**
 * Muse Wonder's rewrite of one message or a set of them, or, given `previous`,
 * its next version of that draft as `previous.ask` asks.
 */
export async function rewrite(
  messages: Message[],
  dataDir: string,
  previous?: { draft: Rewritten[]; ask: string },
): Promise<Rewritten[]> {
  const turns: Turn[] = [
    { role: "system", content: system },
    { role: "user", content: [...(await originals(messages, dataDir)), { type: "text", text: target(messages) }] },
  ];
  if (previous) {
    const draft: Draft = { messages: previous.draft.map(({ author, text, from }) => ({ author, text, from })) };
    turns.push({ role: "assistant", content: JSON.stringify(draft) }, { role: "user", content: previous.ask });
  }
  const draft = await muse<Draft>(turns, schema);
  const ids = new Set(messages.map((m) => m.id));
  return draft.messages.flatMap((r) => {
    const from = r.from.filter((id) => ids.has(id));
    const images = messages.filter((m) => m.image && from.includes(m.id)).map((m) => m.image!);
    return from.length ? [{ author: r.author, text: r.text, from, images }] : [];
  });
}
