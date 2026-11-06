"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { askJson, learnProviders } from "@/lib/learn/ai";
import { type Bill, cleanBill, money, nextDue, perYear, STATUSES, type Status } from "@/lib/money/bills";
import { loadProfile } from "@/lib/jobs/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; field?: string };
const ID = /^[0-9a-f-]{36}$/i;
const NO_SESSION = { ok: false as const, error: "You are signed out. Sign in again, then try once more." };
const today = () => new Date().toISOString().slice(0, 10);

async function session() {
  const db = await createSupabaseServerClient();
  const { data } = await db.auth.getUser();
  return data.user ? { db, userId: data.user.id } : null;
}

const done = () => revalidatePath("/bills");

export async function saveBill(input: Record<string, string>, id?: string): Promise<Result<{ id: string }>> {
  const s = await session();
  if (!s) return NO_SESSION;
  const r = cleanBill(input);
  if (!r.ok) return { ok: false, error: r.error, field: r.field };
  if (id) {
    if (!ID.test(id)) return { ok: false, error: "That bill was not found." };
    const { error } = await s.db.from("bills").update(r.bill).eq("id", id).eq("user_id", s.userId);
    if (error) return { ok: false, error: "Your changes were not saved. Try again." };
    done();
    return { ok: true, id };
  }
  const { data, error } = await s.db.from("bills").insert({ ...r.bill, user_id: s.userId }).select("id").single();
  if (error || !data) return { ok: false, error: "It could not be saved. Try again." };
  done();
  return { ok: true, id: data.id };
}

// Paid: keep a record, then move the bill to its next date. A one-time bill is done.
export async function markPaid(id: string): Promise<Result<{ next: string | null; paymentId: string }>> {
  const s = await session();
  if (!s || !ID.test(id)) return NO_SESSION;
  const { data: b } = await s.db.from("bills").select("amount, currency, cycle, next_due").eq("id", id).eq("user_id", s.userId).maybeSingle();
  if (!b) return { ok: false, error: "That bill was not found." };
  const { data: pay, error } = await s.db.from("bill_payments").insert({ user_id: s.userId, bill_id: id, amount: b.amount, currency: b.currency, due_on: b.next_due, paid_on: today() }).select("id").single();
  if (error || !pay) return { ok: false, error: "The payment could not be saved. Try again." };
  const next = nextDue(b.next_due, b.cycle as Bill["cycle"]);
  await s.db.from("bills").update(next ? { next_due: next } : { status: "cancelled" }).eq("id", id).eq("user_id", s.userId);
  done();
  return { ok: true, next, paymentId: pay.id };
}

export async function undoPayment(paymentId: string): Promise<Result> {
  const s = await session();
  if (!s || !ID.test(paymentId)) return NO_SESSION;
  const { data: p } = await s.db.from("bill_payments").select("bill_id, due_on").eq("id", paymentId).eq("user_id", s.userId).maybeSingle();
  if (!p) return { ok: false, error: "That payment was not found." };
  await s.db.from("bill_payments").delete().eq("id", paymentId).eq("user_id", s.userId);
  if (p.due_on) await s.db.from("bills").update({ next_due: p.due_on, status: "active" }).eq("id", p.bill_id).eq("user_id", s.userId);
  done();
  return { ok: true };
}

export async function setBillStatus(id: string, status: Status): Promise<Result> {
  const s = await session();
  if (!s || !ID.test(id) || !STATUSES.includes(status)) return NO_SESSION;
  const { error } = await s.db.from("bills").update({ status }).eq("id", id).eq("user_id", s.userId);
  if (error) return { ok: false, error: "That could not be saved. Try again." };
  done();
  return { ok: true };
}

export async function deleteBill(id: string): Promise<Result> {
  const s = await session();
  if (!s || !ID.test(id)) return NO_SESSION;
  const { error } = await s.db.from("bills").delete().eq("id", id).eq("user_id", s.userId);
  if (error) return { ok: false, error: "It could not be deleted. Try again." };
  done();
  return { ok: true };
}

export async function savePlan(input: { income: string; currency: string; save: string }): Promise<Result> {
  const s = await session();
  if (!s) return NO_SESSION;
  const income = input.income.trim() ? Number(input.income.replace(/[,\s₦$£€]/g, "")) : null;
  if (income !== null && (!Number.isFinite(income) || income < 0)) return { ok: false, error: "Enter your income as a number, like 500000.", field: "income" };
  const save = Math.round(Number(input.save) || 0);
  if (save < 0 || save > 90) return { ok: false, error: "Pick a savings target from 0 to 90 percent.", field: "save" };
  const currency = /^[A-Z]{3}$/.test(input.currency) ? input.currency : "NGN";
  const { error } = await s.db.from("money_plans").upsert({ user_id: s.userId, income, currency, save_percent: save, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return { ok: false, error: "Your budget was not saved. Try again." };
  done();
  return { ok: true };
}

export type Tip = { title: string; detail: string };

// Ideas to spend less, from your own list only. The model never names a price it was not given.
export async function findSavings(): Promise<Result<{ tips: Tip[] }>> {
  const s = await session();
  if (!s) return NO_SESSION;
  const [{ data: bills }, { data: plan }, profile] = await Promise.all([
    s.db.from("bills").select("name, amount, currency, cycle, category").eq("user_id", s.userId).eq("status", "active"),
    s.db.from("money_plans").select("income, currency, save_percent").eq("user_id", s.userId).maybeSingle(),
    loadProfile(s.db, s.userId),
  ]);
  if (!bills?.length) return { ok: false, error: "Add your bills and subscriptions first." };
  const providers = profile?.preferences.ai === "off" ? [] : learnProviders(process.env, (await headers()).get("x-vercel-oidc-token"));
  const lines = bills.map((b) => `- ${b.name}: ${money(Number(b.amount), b.currency)} ${b.cycle === "once" ? "once" : `per ${b.cycle}`} (${b.category}), ${money(perYear({ amount: Number(b.amount), cycle: b.cycle as Bill["cycle"] }), b.currency)} a year`);
  const system = [
    "You help a person spend less on their recurring bills and subscriptions, so they can save.",
    "Rules:",
    "- Talk only about items in their list, by the name they gave.",
    "- Never invent a price, a plan name or a product they did not list. Use the yearly costs given.",
    "- Give 3 to 5 practical tips: overlaps (two services that do the same job), yearly plans, items to pause, the largest costs to review first.",
    "- Plain English, active voice, short sentences. No em dashes. No judgement about their choices.",
    'Reply with JSON only: {"tips":[{"title":"short title","detail":"one or two sentences"}]}',
  ].join("\n");
  const user = `${plan?.income ? `Monthly income: ${money(Number(plan.income), plan.currency)}. Savings target: ${plan.save_percent}%.\n` : ""}Their list:\n${lines.join("\n")}`;
  const names = bills.map((b) => b.name.toLowerCase());
  const r = await askJson(providers, system, user, (v) => {
    const tips = (Array.isArray(v.tips) ? v.tips : [])
      .map((t) => t as Record<string, unknown>)
      .map((t) => ({ title: String(t.title ?? "").replace(/\s*—\s*/g, ", ").trim().slice(0, 100), detail: String(t.detail ?? "").replace(/\s*—\s*/g, ", ").trim().slice(0, 400) }))
      .filter((t) => t.title && t.detail)
      // A tip about something not in the list is dropped.
      .filter((t) => names.some((n) => `${t.title} ${t.detail}`.toLowerCase().includes(n)) || !/\b(switch to|try|use)\s+[A-Z]/.test(t.detail))
      .slice(0, 5);
    return tips.length ? tips : null;
  }, 1500);
  if (!r.ok) return { ok: false, error: `Ideas could not be written just now (${r.error}). Try again in a minute.` };
  await s.db.from("money_plans").upsert({ user_id: s.userId, tips: { list: r.value, at: new Date().toISOString() }, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  done();
  return { ok: true, tips: r.value };
}
