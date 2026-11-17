import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const cacheDir = join(import.meta.dir, "../data/cache");

async function cached<T>(key: unknown, run: () => Promise<T>): Promise<T> {
  const file = join(cacheDir, `${createHash("sha256").update(JSON.stringify(key)).digest("hex").slice(0, 24)}.json`);
  const hit = Bun.file(file);
  if (await hit.exists()) return hit.json();
  const value = await run();
  await mkdir(cacheDir, { recursive: true });
  await Bun.write(file, JSON.stringify(value));
  return value;
}

export const claudeModel = "claude-haiku-5-5";
const emptyDir = join(homedir(), ".cache/claude-empty");

/** Claude through `claude -p` (his plan), returning JSON that matches `schema`. */
export async function claude<T>(system: string, prompt: string, schema: object): Promise<T> {
  const args = ["--model", claudeModel, "--tools", "", "--no-session-persistence"];
  return cached({ args, system, prompt, schema }, async () => {
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
  const out: R[] = [];
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
