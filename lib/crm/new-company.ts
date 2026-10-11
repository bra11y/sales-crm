export type NewCompanyInput = {
  name: string;
  segment: string;
  stage: string;
  pipelineValue: number;
  winProbability: number;
  interactionDate: string;
  interactionType: string;
};

type Context = { ownerId: string | null; externalId: string; today: string };

type Rows = {
  ok: true;
  company: {
    workspace_id: number;
    product: "direct";
    external_id: string;
    name: string;
    segment: string;
    stage: string;
    owner_id: string | null;
    pipeline_value_minor: number;
    currency: string;
    win_probability: number;
  };
  deal: { stage: string; value_minor: number; currency: string; status: "open" } | null;
  activity: { kind: "manual"; summary: string; at: string };
};

export function newCompanyRows(input: NewCompanyInput, ctx: Context): Rows | { ok: false; error: string } {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Company name: enter a name." };
  const value = Number.isFinite(input.pipelineValue) ? Math.max(0, Math.round(input.pipelineValue * 100)) : 0;
  const win = Math.min(100, Math.max(0, Math.round(Number.isFinite(input.winProbability) ? input.winProbability : 0)));
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.interactionDate) && input.interactionDate <= ctx.today ? input.interactionDate : ctx.today;

  return {
    ok: true,
    company: {
      workspace_id: 1,
      product: "direct",
      external_id: ctx.externalId,
      name,
      segment: input.segment,
      stage: input.stage,
      owner_id: ctx.ownerId,
      pipeline_value_minor: value,
      currency: "NGN",
      win_probability: win,
    },
    deal: value > 0 ? { stage: input.stage, value_minor: value, currency: "NGN", status: "open" } : null,
    activity: { kind: "manual", summary: input.interactionType.trim() || "Added by hand", at: `${date}T12:00:00.000Z` },
  };
}
