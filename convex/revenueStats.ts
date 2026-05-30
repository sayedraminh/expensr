import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export const REVENUE_STATS_VERSION = 1;

const MAX_LEGACY_REVENUES_FOR_STATS = 5000;
const MAX_REVENUE_MONTHLY_STATS = 2400;
const MAX_REVENUE_PROVIDER_STATS = 1000;

type RevenueStatsInput = Pick<
  Doc<"revenues">,
  "amount" | "date" | "fee" | "netAmount" | "provider" | "statsVersion" | "userId"
>;

type RevenueStatsDraft = Omit<RevenueStatsInput, "statsVersion"> & {
  statsVersion?: number;
};

type MutableRevenueSummary = {
  total: number;
  totalAmount: number;
  totalFees: number;
  totalNet: number;
  monthlyTotals: Map<string, { month: string; amount: number; netAmount: number; count: number }>;
  providerTotals: Map<
    string,
    { provider: string; totalAmount: number; totalNet: number; count: number }
  >;
};

export function markRevenueStatsVersion<T extends object>(
  revenue: T
): T & { statsVersion: number } {
  return {
    ...revenue,
    statsVersion: REVENUE_STATS_VERSION,
  };
}

export async function addRevenueToStats(
  ctx: MutationCtx,
  revenue: RevenueStatsDraft
) {
  await adjustRevenueStats(ctx, revenue, 1);
}

export async function removeRevenueFromStats(
  ctx: MutationCtx,
  revenue: RevenueStatsInput
) {
  if (revenue.statsVersion !== REVENUE_STATS_VERSION) {
    return;
  }

  await adjustRevenueStats(ctx, revenue, -1);
}

export async function replaceRevenueInStats(
  ctx: MutationCtx,
  previousRevenue: RevenueStatsInput,
  nextRevenue: RevenueStatsDraft
) {
  await removeRevenueFromStats(ctx, previousRevenue);
  await addRevenueToStats(ctx, nextRevenue);
}

export async function readRevenueStats(ctx: QueryCtx, userId: string) {
  const summary = createEmptySummary();

  const persistedStats = await ctx.db
    .query("revenueStats")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(100);

  for (const row of persistedStats) {
    summary.total += row.total;
    summary.totalAmount += row.totalAmount;
    summary.totalFees += row.totalFees;
    summary.totalNet += row.totalNet;
  }

  const monthlyStats = await ctx.db
    .query("revenueMonthlyStats")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(MAX_REVENUE_MONTHLY_STATS);

  for (const row of monthlyStats) {
    const existing = summary.monthlyTotals.get(row.month) ?? {
      month: row.month,
      amount: 0,
      netAmount: 0,
      count: 0,
    };
    existing.amount += row.amount;
    existing.netAmount += row.netAmount;
    existing.count += row.count;
    summary.monthlyTotals.set(row.month, existing);
  }

  const providerStats = await ctx.db
    .query("revenueProviderStats")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(MAX_REVENUE_PROVIDER_STATS);

  for (const row of providerStats) {
    const existing = summary.providerTotals.get(row.providerKey) ?? {
      provider: row.provider,
      totalAmount: 0,
      totalNet: 0,
      count: 0,
    };
    existing.provider = row.provider;
    existing.totalAmount += row.totalAmount;
    existing.totalNet += row.totalNet;
    existing.count += row.count;
    summary.providerTotals.set(row.providerKey, existing);
  }

  const legacyRevenues = await ctx.db
    .query("revenues")
    .withIndex("by_userId_and_statsVersion", (q) =>
      q.eq("userId", userId).eq("statsVersion", undefined)
    )
    .take(MAX_LEGACY_REVENUES_FOR_STATS);

  for (const revenue of legacyRevenues) {
    addRevenueToSummary(summary, revenue);
  }

  return finalizeSummary(summary);
}

function createEmptySummary(): MutableRevenueSummary {
  return {
    total: 0,
    totalAmount: 0,
    totalFees: 0,
    totalNet: 0,
    monthlyTotals: new Map(),
    providerTotals: new Map(),
  };
}

function addRevenueToSummary(
  summary: MutableRevenueSummary,
  revenue: RevenueStatsInput
) {
  const userId = revenue.userId;
  if (!userId) {
    return;
  }

  const fee = revenue.fee ?? 0;
  const month = getMonthKey(revenue.date);
  const { providerKey, provider } = getProviderDetails(revenue.provider);

  summary.total += 1;
  summary.totalAmount += revenue.amount;
  summary.totalFees += fee;
  summary.totalNet += revenue.netAmount;

  const monthlyTotal = summary.monthlyTotals.get(month) ?? {
    month,
    amount: 0,
    netAmount: 0,
    count: 0,
  };
  monthlyTotal.amount += revenue.amount;
  monthlyTotal.netAmount += revenue.netAmount;
  monthlyTotal.count += 1;
  summary.monthlyTotals.set(month, monthlyTotal);

  const providerTotal = summary.providerTotals.get(providerKey) ?? {
    provider,
    totalAmount: 0,
    totalNet: 0,
    count: 0,
  };
  providerTotal.provider = provider;
  providerTotal.totalAmount += revenue.amount;
  providerTotal.totalNet += revenue.netAmount;
  providerTotal.count += 1;
  summary.providerTotals.set(providerKey, providerTotal);
}

function finalizeSummary(summary: MutableRevenueSummary) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const thisMonth = summary.monthlyTotals.get(currentMonth)?.amount ?? 0;

  return {
    total: summary.total,
    totalAmount: summary.totalAmount,
    totalFees: summary.totalFees,
    totalNet: summary.totalNet,
    thisMonth,
    monthlyTotals: Array.from(summary.monthlyTotals.values()).sort((a, b) =>
      a.month.localeCompare(b.month)
    ),
    providerTotals: Array.from(summary.providerTotals.values())
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 8),
  };
}

async function adjustRevenueStats(
  ctx: MutationCtx,
  revenue: RevenueStatsDraft,
  direction: 1 | -1
) {
  const userId = revenue.userId;
  if (!userId) {
    return;
  }

  const now = Date.now();
  const fee = revenue.fee ?? 0;
  const month = getMonthKey(revenue.date);
  const { providerKey, provider } = getProviderDetails(revenue.provider);

  await adjustGlobalStats(ctx, {
    userId,
    total: direction,
    totalAmount: revenue.amount * direction,
    totalFees: fee * direction,
    totalNet: revenue.netAmount * direction,
    updatedAt: now,
  });

  await adjustMonthlyStats(ctx, {
    userId,
    month,
    amount: revenue.amount * direction,
    netAmount: revenue.netAmount * direction,
    count: direction,
    updatedAt: now,
  });

  await adjustProviderStats(ctx, {
    userId,
    providerKey,
    provider,
    totalAmount: revenue.amount * direction,
    totalNet: revenue.netAmount * direction,
    count: direction,
    updatedAt: now,
  });
}

async function adjustGlobalStats(
  ctx: MutationCtx,
  values: {
    userId: string;
    total: number;
    totalAmount: number;
    totalFees: number;
    totalNet: number;
    updatedAt: number;
  }
) {
  const existing = await ctx.db
    .query("revenueStats")
    .withIndex("by_userId", (q) => q.eq("userId", values.userId))
    .first();

  if (!existing) {
    if (values.total > 0) {
      await ctx.db.insert("revenueStats", values);
    }
    return;
  }

  const nextTotal = existing.total + values.total;
  if (nextTotal <= 0) {
    await ctx.db.delete(existing._id);
    return;
  }

  await ctx.db.patch(existing._id, {
    total: nextTotal,
    totalAmount: existing.totalAmount + values.totalAmount,
    totalFees: existing.totalFees + values.totalFees,
    totalNet: existing.totalNet + values.totalNet,
    updatedAt: values.updatedAt,
  });
}

async function adjustMonthlyStats(
  ctx: MutationCtx,
  values: {
    userId: string;
    month: string;
    amount: number;
    netAmount: number;
    count: number;
    updatedAt: number;
  }
) {
  const existing = await ctx.db
    .query("revenueMonthlyStats")
    .withIndex("by_userId_and_month", (q) =>
      q.eq("userId", values.userId).eq("month", values.month)
    )
    .first();

  if (!existing) {
    if (values.count > 0) {
      await ctx.db.insert("revenueMonthlyStats", values);
    }
    return;
  }

  const nextCount = existing.count + values.count;
  if (nextCount <= 0) {
    await ctx.db.delete(existing._id);
    return;
  }

  await ctx.db.patch(existing._id, {
    amount: existing.amount + values.amount,
    netAmount: existing.netAmount + values.netAmount,
    count: nextCount,
    updatedAt: values.updatedAt,
  });
}

async function adjustProviderStats(
  ctx: MutationCtx,
  values: {
    userId: string;
    providerKey: string;
    provider: string;
    totalAmount: number;
    totalNet: number;
    count: number;
    updatedAt: number;
  }
) {
  const existing = await ctx.db
    .query("revenueProviderStats")
    .withIndex("by_userId_and_providerKey", (q) =>
      q.eq("userId", values.userId).eq("providerKey", values.providerKey)
    )
    .first();

  if (!existing) {
    if (values.count > 0) {
      await ctx.db.insert("revenueProviderStats", values);
    }
    return;
  }

  const nextCount = existing.count + values.count;
  if (nextCount <= 0) {
    await ctx.db.delete(existing._id);
    return;
  }

  await ctx.db.patch(existing._id, {
    provider: values.provider,
    totalAmount: existing.totalAmount + values.totalAmount,
    totalNet: existing.totalNet + values.totalNet,
    count: nextCount,
    updatedAt: values.updatedAt,
  });
}

function getMonthKey(date: string) {
  return date.slice(0, 7);
}

function getProviderDetails(providerValue: string) {
  const provider = providerValue.trim() || "Unknown source";
  return {
    provider,
    providerKey: provider.toLowerCase(),
  };
}
