import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { assertOwner, requireUserId } from "./authHelpers";
import {
  addRevenueToStats,
  getCurrentLocalMonthKey,
  markRevenueStatsVersion,
  readRevenueStats,
  removeRevenueFromStats,
} from "./revenueStats";

const MAX_REVENUES_FOR_FILTERING = 5000;
const DELETE_IMPORTED_REVENUE_BATCH_SIZE = 128;

const revenueFilterArgs = {
  provider: v.optional(v.string()),
  startDate: v.optional(v.string()),
  endDate: v.optional(v.string()),
  search: v.optional(v.string()),
  importSessionId: v.optional(v.id("importSessions")),
  limit: v.optional(v.number()),
};

type RevenueFilterArgs = {
  provider?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  importSessionId?: Id<"importSessions">;
  limit?: number;
};

type RevenueImportRow = {
  title: string;
  amount: number;
  date: string;
  provider: string;
  customer?: string;
  fee?: number;
  netAmount: number;
  currency?: string;
  transactionId?: string;
  notes?: string;
};

function getListLimit(value: number | undefined) {
  if (value === undefined) {
    return 500;
  }

  return Math.min(Math.max(Math.trunc(value), 1), 500);
}

function applyRevenueFilters(
  revenues: Doc<"revenues">[],
  args: RevenueFilterArgs,
) {
  let filtered = revenues;

  if (args.provider !== undefined && args.provider.trim() !== "") {
    const provider = args.provider.trim().toLowerCase();
    filtered = filtered.filter(
      (revenue) => revenue.provider.trim().toLowerCase() === provider,
    );
  }
  if (args.startDate !== undefined) {
    filtered = filtered.filter((revenue) => revenue.date >= args.startDate!);
  }
  if (args.endDate !== undefined) {
    filtered = filtered.filter((revenue) => revenue.date <= args.endDate!);
  }
  if (args.search !== undefined && args.search.trim() !== "") {
    const term = args.search.trim().toLowerCase();
    filtered = filtered.filter(
      (revenue) =>
        revenue.title.toLowerCase().includes(term) ||
        revenue.provider.toLowerCase().includes(term) ||
        (revenue.customer &&
          revenue.customer.toLowerCase().includes(term)) ||
        (revenue.transactionId &&
          revenue.transactionId.toLowerCase().includes(term)) ||
        (revenue.notes && revenue.notes.toLowerCase().includes(term)),
    );
  }
  if (args.importSessionId !== undefined) {
    filtered = filtered.filter(
      (revenue) => revenue.importSessionId === args.importSessionId,
    );
  }

  return filtered;
}

function sortRevenues(revenues: Doc<"revenues">[]) {
  return revenues.sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    return b._creationTime - a._creationTime;
  });
}

async function assertImportSessionBelongsToUser(
  ctx: MutationCtx,
  importSessionId: Id<"importSessions">,
  userId: string,
) {
  const importSession = await ctx.db.get(importSessionId);
  assertOwner(importSession, userId, "Import session not found");
}

function validateRevenueImportRow(revenue: RevenueImportRow) {
  if (revenue.amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }
  if (revenue.netAmount < 0) {
    throw new Error("Net amount cannot be negative");
  }
  if (revenue.provider.trim() === "") {
    throw new Error("Provider is required");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(revenue.date)) {
    throw new Error("Date must be in YYYY-MM-DD format");
  }

  const parsed = new Date(`${revenue.date}T00:00:00Z`);
  if (isNaN(parsed.getTime())) {
    throw new Error("Invalid date value");
  }
}

export const list = query({
  args: revenueFilterArgs,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const allRevenues = await ctx.db
      .query("revenues")
      .withIndex("by_userId_and_date", (q) => {
        if (args.startDate !== undefined && args.endDate !== undefined) {
          return q
            .eq("userId", userId)
            .gte("date", args.startDate)
            .lte("date", args.endDate);
        }
        if (args.startDate !== undefined) {
          return q.eq("userId", userId).gte("date", args.startDate);
        }
        if (args.endDate !== undefined) {
          return q.eq("userId", userId).lte("date", args.endDate);
        }
        return q.eq("userId", userId);
      })
      .order("desc")
      .take(MAX_REVENUES_FOR_FILTERING);
    const filtered = sortRevenues(applyRevenueFilters(allRevenues, args));
    return filtered.slice(0, getListLimit(args.limit));
  },
});

export const listProviders = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const allRevenues = await ctx.db
      .query("revenues")
      .withIndex("by_userId_and_provider", (q) => q.eq("userId", userId))
      .take(MAX_REVENUES_FOR_FILTERING);
    return Array.from(
      new Set(
        allRevenues
          .map((revenue) => revenue.provider.trim())
          .filter((provider) => provider !== ""),
      ),
    ).sort((a, b) => a.localeCompare(b));
  },
});

export const filteredSummary = query({
  args: revenueFilterArgs,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const allRevenues = await ctx.db
      .query("revenues")
      .withIndex("by_userId_and_date", (q) => {
        if (args.startDate !== undefined && args.endDate !== undefined) {
          return q
            .eq("userId", userId)
            .gte("date", args.startDate)
            .lte("date", args.endDate);
        }
        if (args.startDate !== undefined) {
          return q.eq("userId", userId).gte("date", args.startDate);
        }
        if (args.endDate !== undefined) {
          return q.eq("userId", userId).lte("date", args.endDate);
        }
        return q.eq("userId", userId);
      })
      .order("desc")
      .take(MAX_REVENUES_FOR_FILTERING);
    const filtered = applyRevenueFilters(allRevenues, args);

    const totalAmount = filtered.reduce((sum, revenue) => sum + revenue.amount, 0);
    const totalFees = filtered.reduce(
      (sum, revenue) => sum + (revenue.fee ?? 0),
      0,
    );
    const totalNet = filtered.reduce(
      (sum, revenue) => sum + revenue.netAmount,
      0,
    );

    const providerMap = new Map<
      string,
      { provider: string; totalAmount: number; totalNet: number; count: number }
    >();

    for (const revenue of filtered) {
      const providerName = revenue.provider.trim() || "Unknown source";
      const providerKey = providerName.toLowerCase();
      const existing = providerMap.get(providerKey);

      if (existing) {
        existing.totalAmount += revenue.amount;
        existing.totalNet += revenue.netAmount;
        existing.count += 1;
        continue;
      }

      providerMap.set(providerKey, {
        provider: providerName,
        totalAmount: revenue.amount,
        totalNet: revenue.netAmount,
        count: 1,
      });
    }

    const providerTotals = Array.from(providerMap.values())
      .sort(
        (a, b) =>
          b.totalAmount - a.totalAmount ||
          a.provider.localeCompare(b.provider),
      )
      .slice(0, 8);

    return {
      count: filtered.length,
      totalAmount,
      totalFees,
      totalNet,
      providerTotals,
    };
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const stats = await readRevenueStats(ctx, userId);
    const currentMonth = getCurrentLocalMonthKey();

    return {
      ...stats,
      thisMonthAmount: stats.thisMonth,
      thisMonthNet:
        stats.monthlyTotals.find((entry) =>
          entry.month === currentMonth
        )?.netAmount ?? 0,
    };
  },
});

export const remove = mutation({
  args: { id: v.id("revenues") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db.get(args.id);
    assertOwner(existing, userId, "Revenue entry not found");

    await removeRevenueFromStats(ctx, existing);
    await ctx.db.delete(args.id);
  },
});

export const deleteImportedRevenueBatch = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const revenues = await ctx.db
      .query("revenues")
      .withIndex("by_userId_and_source", (q) =>
        q.eq("userId", userId).eq("source", "import")
      )
      .take(DELETE_IMPORTED_REVENUE_BATCH_SIZE);

    for (const revenue of revenues) {
      await removeRevenueFromStats(ctx, revenue);
      await ctx.db.delete(revenue._id);
    }

    let importSessionsDeleted = 0;
    if (revenues.length === 0) {
      const importSessions = await ctx.db
        .query("importSessions")
        .withIndex("by_userId_and_entityType", (q) =>
          q.eq("userId", userId).eq("entityType", "revenue")
        )
        .take(DELETE_IMPORTED_REVENUE_BATCH_SIZE);

      for (const importSession of importSessions) {
        await ctx.db.delete(importSession._id);
      }
      importSessionsDeleted = importSessions.length;
    }

    return {
      done:
        revenues.length === 0 &&
        importSessionsDeleted < DELETE_IMPORTED_REVENUE_BATCH_SIZE,
      deletedRevenues: revenues.length,
      deletedImportSessions: importSessionsDeleted,
    };
  },
});

export const bulkCreate = mutation({
  args: {
    revenues: v.array(
      v.object({
        title: v.string(),
        amount: v.number(),
        date: v.string(),
        provider: v.string(),
        customer: v.optional(v.string()),
        fee: v.optional(v.number()),
        netAmount: v.number(),
        currency: v.optional(v.string()),
        transactionId: v.optional(v.string()),
        notes: v.optional(v.string()),
      }),
    ),
    importSessionId: v.id("importSessions"),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await assertImportSessionBelongsToUser(ctx, args.importSessionId, userId);

    let imported = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < args.revenues.length; i++) {
      const revenue = args.revenues[i];

      try {
        validateRevenueImportRow(revenue);
      } catch (error) {
        errors.push({
          row: i + 1,
          message:
            error instanceof Error ? error.message : "Unknown import error",
        });
        continue;
      }

      const revenueFields = markRevenueStatsVersion({
        title: revenue.title,
        amount: revenue.amount,
        date: revenue.date,
        provider: revenue.provider,
        customer: revenue.customer,
        fee: revenue.fee,
        netAmount: revenue.netAmount,
        currency: revenue.currency,
        transactionId: revenue.transactionId,
        notes: revenue.notes,
        source: "import" as const,
        importSessionId: args.importSessionId,
        userId,
      });
      await ctx.db.insert("revenues", revenueFields);
      await addRevenueToStats(ctx, revenueFields);
      imported += 1;
    }

    return { imported, errors };
  },
});
