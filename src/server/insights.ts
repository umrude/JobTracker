import "server-only";
import { getDb } from "@/server/db/client";
import { getMode } from "@/server/mode";
import { requireUserId } from "@/server/current-user";
import { insightInputs } from "@/server/db/insights-store";
import { buildInsights, type Insights, type InsightScope } from "@/lib/insights/build";

// The Insights page's numbers for the current user (docs/insights.md).
// Reads only; nothing here calls a model.
export async function getInsights(scope: InsightScope): Promise<Insights> {
  const db = getDb(await getMode());
  const { jobs, profileSkills } = insightInputs(db, await requireUserId());
  return buildInsights(jobs, profileSkills, scope);
}
