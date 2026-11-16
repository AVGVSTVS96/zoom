import { join } from "node:path";
import { muse, type Part, type Turn } from "./llm";
import type { Message, Rewritten } from "./types";

const system = `You rewrite a stretch of a Telegram chat between Bassim ("owner") and hex, his AI assistant. Bassim reads your version in place of the originals, so he can read fast and miss nothing.

The messages were sent one after another and never edited, so they run long: explanations that a later message overturns, drafts that get replaced, the same point made twice, questions answered further down, hedges and preambles. Write the same messages again as they'd read had each been edited once the conversation settled: every point said once, in its final form, in the fewest words that carry it. Where hex was wrong and corrected itself, give the right answer and say briefly what was wrong. This is still the conversation, from the same speakers in their own voices, with hex speaking to Bassim as "you"; not an overview of it. Most of the cutting is in hex's messages: merge hex's messages in a row into one, give each point once in its final form, and fold reasoning a later message overturns into a few words.

It has to be lossless: everything a reader learns from the originals stays, every fact, name, number, date and time, link, ID, list item, step, question, request, decision, caveat and open question, and who said each, with a guess still a guess and a ruled-out option still ruled out. Greetings, acknowledgements, apologies, promises the set goes on to keep, and tone can go. Links, code, commands and anything meant to be copied (like a drafted text to send) stay exactly as written. Photos show beside your rewrite as sent, so they need no description. A quoted message a reply points to is context from outside the set, not one of its messages.

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

type Draft = { messages: Omit<Rewritten, "images">[] };

/**
 * Muse Wonder's rewrite of one message or a set of them.
 * `gaps`, from a check of `previous`, asks it to put back what that draft lost.
 */
export async function rewrite(
  messages: Message[],
  dataDir: string,
  previous?: { draft: Rewritten[]; gaps: string[] },
): Promise<Rewritten[]> {
  const turns: Turn[] = [
    { role: "system", content: system },
    { role: "user", content: await originals(messages, dataDir) },
  ];
  if (previous) {
    const draft: Draft = { messages: previous.draft.map(({ author, text, from }) => ({ author, text, from })) };
    turns.push(
      { role: "assistant", content: JSON.stringify(draft) },
      {
        role: "user",
        content: `A strict check against the originals found what this draft lost or changed:\n\n${previous.gaps.map((g) => `- ${g}`).join("\n")}\n\nChange only what it takes to carry these, and keep the rest of your draft as it is.`,
      },
    );
  }
  const draft = await muse<Draft>(turns, schema);
  const ids = new Set(messages.map((m) => m.id));
  return draft.messages.flatMap((r) => {
    const from = r.from.filter((id) => ids.has(id));
    const images = messages.filter((m) => m.image && from.includes(m.id)).map((m) => m.image!);
    return from.length ? [{ author: r.author, text: r.text, from, images }] : [];
  });
}
