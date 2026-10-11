import type { CrmDb } from "./apply.ts";
import type { CrmEvent } from "./events.ts";

export type FakeState = {
  events: Map<string, { id: number; status: string; error: string | null }>;
  companies: Map<string, { id: string; name: string; stage?: string; segment?: string; winProbability?: number; pipelineValueMinor?: number }>;
  contacts: Map<string, { name: string; email?: string }>;
  subscriptions: Map<string, { id: string; status: string; sourceAt: string; amountMinor: number }>;
  deals: Map<string, { status: string }>;
  payments: Map<string, { status: string; amountMinor: number }>;
  activities: Map<string, string>;
  failOn?: string;
};

export function createFakeDb(): CrmDb & { state: FakeState } {
  const state: FakeState = {
    events: new Map(),
    companies: new Map(),
    contacts: new Map(),
    subscriptions: new Map(),
    deals: new Map(),
    payments: new Map(),
    activities: new Map(),
  };
  let nextId = 1;
  const guard = (name: string) => {
    if (state.failOn === name) throw new Error(`${name} failed`);
  };

  return {
    state,
    async insertEvent(event: CrmEvent) {
      if (state.events.has(event.event_id)) return null;
      const id = nextId++;
      state.events.set(event.event_id, { id, status: "received", error: null });
      return { id };
    },
    async setEventStatus(id, status, error) {
      for (const row of state.events.values()) if (row.id === id) Object.assign(row, { status, error });
    },
    async upsertCompany(_ws, product, m) {
      guard("company");
      const key = `${product}:${m.externalId}`;
      const existing = state.companies.get(key);
      const next = { ...existing, id: existing?.id ?? key, name: m.name };
      for (const field of ["stage", "segment", "winProbability", "pipelineValueMinor"] as const) {
        if (m[field] !== undefined) Object.assign(next, { [field]: m[field] });
      }
      state.companies.set(key, next);
      return next.id;
    },
    async upsertContact(_ws, companyId, m) {
      state.contacts.set(`${companyId}:${m.name}`, { name: m.name, email: m.email });
    },
    async upsertSubscription(_ws, companyId, product, m) {
      guard("subscription");
      const key = `${companyId}:${product}`;
      const existing = state.subscriptions.get(key);
      if (existing && existing.sourceAt > m.sourceAt) return null;
      const id = existing?.id ?? `sub:${key}`;
      state.subscriptions.set(key, { id, status: m.status, sourceAt: m.sourceAt, amountMinor: m.amountMinor });
      return id;
    },
    async upsertDeal(_ws, companyId, m) {
      state.deals.set(companyId, { status: m.status });
    },
    async upsertPayment(_ws, _companyId, _subId, m) {
      state.payments.set(`${m.provider}:${m.reference}`, { status: m.status, amountMinor: m.amountMinor });
    },
    async insertActivity(_ws, companyId, eventId, m) {
      if (!state.activities.has(eventId)) state.activities.set(eventId, `${companyId}:${m.summary}`);
    },
  };
}
