import "server-only";
import { goalProgress, METRICS, type Goal, type GoalProgress } from "./goals";
import { loadSales } from "./sales-query";
import { loadGoals } from "./workspace-query";
import { currentUserId } from "@/lib/jobs/profile";

export type GoalView = { goal: Goal; progress: GoalProgress; money: boolean };

export async function goalViews() {
  const [sales, userId] = await Promise.all([loadSales(), currentUserId()]);
  const { goals, samples, error } = await loadGoals(userId, sales.payments);
  const now = new Date();
  const views: GoalView[] = goals.map((g) => ({ goal: g, progress: goalProgress(g, samples[g.metric], now), money: METRICS[g.metric].unit === "money" }));
  return { views, error, sales };
}
