import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const cacheDir = join(import.meta.dir, "../data/cache");
let spent = 0;
export const costUsd = () => spent;

async function cached<T>(key: unknown, run: () => Promise<T>): Promise<T> {
  const file = join(cacheDir, `${createHash("sha256").update(JSON.stringify(key)).digest("hex").slice(0, 24)}.json`);
  const hit = Bun.file(file);
  if (await hit.exists()) return hit.json();
  const value = await run();
  await mkdir(cacheDir, { recursive: true });
  await Bun.write(file, JSON.stringify(value));
  return value;
}

export type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export type Turn = { role: "system" | "user" | "assistant"; content: string | Part[] };

export const museModel = "meta/muse-wonder";

/** Muse Wonder on OpenRouter, returning JSON that matches `schema`. */
export async function muse<T>(turns: Turn[], schema: object): Promise<T> {
  const body = {
    model: museModel,
    messages: turns,
    reasoning: { effort: "high" },
    response_format: { type: "json_schema", json_schema: { name: "rewrite", strict: true, schema } },
    usage: { include: true },
  };
  const { content } = await cached(body, async () => {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error("OPENROUTER_API_KEY is not set");
    for (let attempt = 1; ; attempt++) {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json: any = await res.json().catch(() => ({}));
      const content = json.choices?.[0]?.message?.content;
      if (res.ok && content) {
        spent += json.usage?.cost ?? 0;
        return { content, cost: json.usage?.cost ?? 0 };
      }
      if (attempt === 3) throw new Error(`Muse Wonder ${res.status}: ${JSON.stringify(json).slice(0, 500)}`);
    }
  });
  return JSON.parse(content);
}

export const claudeModel = "claude-opus-5-5";
const emptyDir = join(homedir(), ".cache/claude-empty");

/**
 * Claude through `claude -p` (his plan), returning JSON that matches `schema`.
 * `read` lets it open files in that folder, like a photo it has to see.
 */
export async function claude<T>(system: string, prompt: string, schema: object, run = 0, read?: string): Promise<T> {
  const tools = read ? ["--tools", "Read", "--add-dir", read] : ["--tools", ""];
  const args = ["--model", claudeModel, "--effort", "high", ...tools, "--no-session-persistence"];
  return cached({ args, system, prompt, schema, run }, async () => {
    await mkdir(emptyDir, { recursive: true });
    for (let attempt = 1; ; attempt++) {
      const proc = Bun.spawn(
        ["claude", "-p", ...args, "--system-prompt", system, "--output-format", "json", "--json-schema", JSON.stringify(schema)],
        { cwd: emptyDir, stdin: new Blob([prompt]), stdout: "pipe", stderr: "pipe" },
      );
      const out = await new Response(proc.stdout).text();
      await proc.exited;
      try {
        const json = JSON.parse(out);
        if (!json.is_error && json.structured_output) return json.structured_output as T;
      } catch {}
      if (attempt === 3) throw new Error(`claude -p failed: ${out.slice(0, 500)}`);
    }
  });
}

/** Runs `fn` over `items`, at most `limit` at a time. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
