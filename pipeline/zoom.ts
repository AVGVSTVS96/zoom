import { check, gaps } from "./check";
import { rewrite } from "./rewrite";
import type { Check, Message, Rewritten } from "./types";

export type Result = { rewrite: Rewritten[]; check: Check; rounds: number };

/**
 * The step: Muse Wonder rewrites one message or a set, a judge checks it for loss,
 * Muse Wonder puts back what it lost (up to `repairs` times), and two fresh judges
 * that saw none of the repairs score the best draft.
 */
export async function zoom(messages: Message[], dataDir: string, repairs = 2): Promise<Result> {
  let draft = await rewrite(messages, dataDir);
  let best = { draft, check: await check(messages, draft, [0], dataDir) };
  let rounds = 1;
  while (!best.check.loss.lossless || best.check.additions.length) {
    if (rounds > repairs) break;
    draft = await rewrite(messages, dataDir, { draft: best.draft, gaps: gaps(best.check) });
    const next = await check(messages, draft, [0], dataDir);
    rounds++;
    if (next.loss.score >= best.check.loss.score) best = { draft, check: next };
  }
  return { rewrite: best.draft, check: await check(messages, best.draft, [1, 2], dataDir), rounds };
}
