import { mutation, query } from "./_generated/server";
import { requireUserId } from "./authHelpers";

const BATCH_SIZE = 128;
const COUNT_LIMIT = 1001;
const legacyDataClaimUserIds = (process.env.LEGACY_DATA_CLAIM_USER_IDS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

function countResult(rows: unknown[]) {
  return {
    count: Math.min(rows.length, COUNT_LIMIT - 1),
    hasMore: rows.length >= COUNT_LIMIT,
  };
}

function canClaimLegacyData(userId: string) {
  return legacyDataClaimUserIds.includes(userId);
}

function requireLegacyDataClaimAccess(userId: string) {
  if (!canClaimLegacyData(userId)) {
    throw new Error("Legacy data migration is not enabled for this account.");
  }
}

export const getOverview = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const legacyClaimAllowed = canClaimLegacyData(userId);

    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(COUNT_LIMIT);
    const revenues = await ctx.db
      .query("revenues")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(COUNT_LIMIT);
    const importSessions = await ctx.db
      .query("importSessions")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(COUNT_LIMIT);
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(COUNT_LIMIT);
    const paymentMethods = await ctx.db
      .query("paymentMethods")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(COUNT_LIMIT);

    const hasLegacyData =
      legacyClaimAllowed &&
      Boolean(
        (await ctx.db
          .query("expenses")
          .withIndex("by_userId", (q) => q.eq("userId", undefined))
          .first()) ||
          (await ctx.db
            .query("revenues")
            .withIndex("by_userId", (q) => q.eq("userId", undefined))
            .first()) ||
          (await ctx.db
            .query("importSessions")
            .withIndex("by_userId", (q) => q.eq("userId", undefined))
            .first()) ||
          (await ctx.db
            .query("categories")
            .withIndex("by_userId", (q) => q.eq("userId", undefined))
            .first()) ||
          (await ctx.db
            .query("paymentMethods")
            .withIndex("by_userId", (q) => q.eq("userId", undefined))
            .first()) ||
          (await ctx.db
            .query("settings")
            .withIndex("by_userId", (q) => q.eq("userId", undefined))
            .first())
      );

    return {
      expenses: countResult(expenses),
      revenues: countResult(revenues),
      importSessions: countResult(importSessions),
      categories: countResult(categories),
      paymentMethods: countResult(paymentMethods),
      hasLegacyData,
    };
  },
});

export const claimLegacyData = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    requireLegacyDataClaimAccess(userId);

    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_userId", (q) => q.eq("userId", undefined))
      .take(BATCH_SIZE);
    const revenues = await ctx.db
      .query("revenues")
      .withIndex("by_userId", (q) => q.eq("userId", undefined))
      .take(BATCH_SIZE);
    const importSessions = await ctx.db
      .query("importSessions")
      .withIndex("by_userId", (q) => q.eq("userId", undefined))
      .take(BATCH_SIZE);
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_userId", (q) => q.eq("userId", undefined))
      .take(BATCH_SIZE);
    const paymentMethods = await ctx.db
      .query("paymentMethods")
      .withIndex("by_userId", (q) => q.eq("userId", undefined))
      .take(BATCH_SIZE);
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_userId", (q) => q.eq("userId", undefined))
      .take(BATCH_SIZE);

    for (const row of expenses) await ctx.db.patch(row._id, { userId });
    for (const row of revenues) await ctx.db.patch(row._id, { userId });
    for (const row of importSessions) await ctx.db.patch(row._id, { userId });
    for (const row of categories) await ctx.db.patch(row._id, { userId });
    for (const row of paymentMethods) await ctx.db.patch(row._id, { userId });

    for (const row of settings) {
      const existing = await ctx.db
        .query("settings")
        .withIndex("by_userId_and_key", (q) =>
          q.eq("userId", userId).eq("key", row.key)
        )
        .unique();

      if (existing) {
        await ctx.db.delete(row._id);
      } else {
        await ctx.db.patch(row._id, { userId });
      }
    }

    const done =
      expenses.length < BATCH_SIZE &&
      revenues.length < BATCH_SIZE &&
      importSessions.length < BATCH_SIZE &&
      categories.length < BATCH_SIZE &&
      paymentMethods.length < BATCH_SIZE &&
      settings.length < BATCH_SIZE;

    return {
      done,
      claimed: {
        expenses: expenses.length,
        revenues: revenues.length,
        importSessions: importSessions.length,
        categories: categories.length,
        paymentMethods: paymentMethods.length,
        settings: settings.length,
      },
    };
  },
});

export const deleteMyData = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);

    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(BATCH_SIZE);
    const revenues = await ctx.db
      .query("revenues")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(BATCH_SIZE);
    const importSessions = await ctx.db
      .query("importSessions")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(BATCH_SIZE);
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(BATCH_SIZE);
    const paymentMethods = await ctx.db
      .query("paymentMethods")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(BATCH_SIZE);
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(BATCH_SIZE);

    for (const row of expenses) await ctx.db.delete(row._id);
    for (const row of revenues) await ctx.db.delete(row._id);
    for (const row of importSessions) await ctx.db.delete(row._id);
    for (const row of categories) await ctx.db.delete(row._id);
    for (const row of paymentMethods) await ctx.db.delete(row._id);
    for (const row of settings) await ctx.db.delete(row._id);

    const done =
      expenses.length < BATCH_SIZE &&
      revenues.length < BATCH_SIZE &&
      importSessions.length < BATCH_SIZE &&
      categories.length < BATCH_SIZE &&
      paymentMethods.length < BATCH_SIZE &&
      settings.length < BATCH_SIZE;

    return {
      done,
      deleted: {
        expenses: expenses.length,
        revenues: revenues.length,
        importSessions: importSessions.length,
        categories: categories.length,
        paymentMethods: paymentMethods.length,
        settings: settings.length,
      },
    };
  },
});
