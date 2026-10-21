"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertWritable } from "@/server/mode";
import { requireSession } from "@/server/require-session";
import { compareNextBatch, type BatchResult } from "@/server/insights";

// One batch of "Compare all". Called by the page in a loop, with plain
// arguments rather than a form: the ids of jobs that already failed in
// this run, to skip. Validated like any input; ids that aren't yours are
// simply not among the jobs it looks at.
const skipSchema = z.array(z.number().int().positive()).max(2000);

export async function compareNextBatchAction(skip: number[]): Promise<BatchResult> {
  await requireSession();
  assertWritable();
  const parsed = skipSchema.safeParse(skip);
  if (!parsed.success) return { compared: 0, failed: [], remaining: 0, stopped: "Invalid request. Reload the page." };

  const result = await compareNextBatch(parsed.data);
  revalidatePath("/insights");
  revalidatePath("/compare");
  return result;
}
