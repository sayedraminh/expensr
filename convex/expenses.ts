import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { assertOwner, requireUserId } from "./authHelpers";

const MAX_EXPENSES_FOR_FILTERING = 5000;
const MAX_REFERENCE_ROWS = 1000;

const expenseFilterArgs = {
  categoryId: v.optional(v.id("categories")),
  paymentMethodId: v.optional(v.id("paymentMethods")),
  startDate: v.optional(v.string()),
  endDate: v.optional(v.string()),
  search: v.optional(v.string()),
  importSessionId: v.optional(v.id("importSessions")),
};

type ExpenseFilterArgs = {
  categoryId?: Id<"categories">;
  paymentMethodId?: Id<"paymentMethods">;
  startDate?: string;
  endDate?: string;
  search?: string;
  importSessionId?: Id<"importSessions">;
};

function applyExpenseFilters(
  expenses: Doc<"expenses">[],
  args: ExpenseFilterArgs
) {
  let filtered = expenses;

  if (args.categoryId !== undefined) {
    filtered = filtered.filter((expense) => expense.categoryId === args.categoryId);
  }
  if (args.paymentMethodId !== undefined) {
    filtered = filtered.filter(
      (expense) => expense.paymentMethodId === args.paymentMethodId
    );
  }
  if (args.startDate !== undefined) {
    const startDate = args.startDate;
    filtered = filtered.filter((expense) => expense.date >= startDate);
  }
  if (args.endDate !== undefined) {
    const endDate = args.endDate;
    filtered = filtered.filter((expense) => expense.date <= endDate);
  }
  if (args.search !== undefined && args.search.trim() !== "") {
    const term = args.search.toLowerCase();
    filtered = filtered.filter(
      (expense) =>
        expense.title.toLowerCase().includes(term) ||
        (expense.vendor && expense.vendor.toLowerCase().includes(term)) ||
        (expense.notes && expense.notes.toLowerCase().includes(term))
    );
  }
  if (args.importSessionId !== undefined) {
    filtered = filtered.filter(
      (expense) => expense.importSessionId === args.importSessionId
    );
  }

  return filtered;
}

async function assertCategoryBelongsToUser(
  ctx: MutationCtx,
  categoryId: Id<"categories"> | undefined,
  userId: string
) {
  if (categoryId === undefined) {
    return;
  }

  const category = await ctx.db.get(categoryId);
  assertOwner(category, userId, "Category not found");
}

async function assertPaymentMethodBelongsToUser(
  ctx: MutationCtx,
  paymentMethodId: Id<"paymentMethods"> | undefined,
  userId: string
) {
  if (paymentMethodId === undefined) {
    return;
  }

  const paymentMethod = await ctx.db.get(paymentMethodId);
  assertOwner(paymentMethod, userId, "Payment method not found");
}

async function assertImportSessionBelongsToUser(
  ctx: MutationCtx,
  importSessionId: Id<"importSessions"> | undefined,
  userId: string
) {
  if (importSessionId === undefined) {
    return;
  }

  const importSession = await ctx.db.get(importSessionId);
  assertOwner(importSession, userId, "Import session not found");
}

export const list = query({
  args: expenseFilterArgs,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const allExpenses = await ctx.db
      .query("expenses")
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
      .take(MAX_EXPENSES_FOR_FILTERING);

    // Batch-load all categories and payment methods into Maps
    const allCategories = await ctx.db
      .query("categories")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(MAX_REFERENCE_ROWS);
    const categoryMap = new Map<string, { name: string; color: string }>();
    for (const cat of allCategories) {
      categoryMap.set(cat._id, { name: cat.name, color: cat.color });
    }

    const allPaymentMethods = await ctx.db
      .query("paymentMethods")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(MAX_REFERENCE_ROWS);
    const pmMap = new Map<string, { name: string }>();
    for (const pm of allPaymentMethods) {
      pmMap.set(pm._id, { name: pm.name });
    }

    const filtered = applyExpenseFilters(allExpenses, args);

    // Sort by date descending, then by _creationTime descending as tiebreaker
    filtered.sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date);
      if (dateCmp !== 0) return dateCmp;
      return b._creationTime - a._creationTime;
    });

    // Limit to 500
    const limited = filtered.slice(0, 500);

    // Join category and payment method data
    return limited.map((expense) => {
      const category = expense.categoryId
        ? categoryMap.get(expense.categoryId) ?? null
        : null;
      const paymentMethod = expense.paymentMethodId
        ? pmMap.get(expense.paymentMethodId) ?? null
        : null;

      return {
        ...expense,
        categoryName: category?.name ?? null,
        categoryColor: category?.color ?? null,
        paymentMethodName: paymentMethod?.name ?? null,
      };
    });
  },
});

export const filteredSummary = query({
  args: expenseFilterArgs,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const allExpenses = await ctx.db
      .query("expenses")
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
      .take(MAX_EXPENSES_FOR_FILTERING);
    const filtered = applyExpenseFilters(allExpenses, args);

    const totalAmount = filtered.reduce((sum, expense) => sum + expense.amount, 0);
    const vendorMap = new Map<
      string,
      { vendor: string; totalAmount: number; count: number }
    >();

    for (const expense of filtered) {
      const vendorName = (expense.vendor || expense.title || "Unknown vendor").trim();
      const vendorKey = vendorName.toLowerCase();
      const existing = vendorMap.get(vendorKey);

      if (existing) {
        existing.totalAmount += expense.amount;
        existing.count += 1;
        continue;
      }

      vendorMap.set(vendorKey, {
        vendor: vendorName,
        totalAmount: expense.amount,
        count: 1,
      });
    }

    const vendorTotals = Array.from(vendorMap.values())
      .sort(
        (a, b) =>
          b.totalAmount - a.totalAmount || a.vendor.localeCompare(b.vendor)
      )
      .slice(0, 8);

    return {
      count: filtered.length,
      totalAmount,
      vendorTotals,
    };
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const allExpenses = await ctx.db
      .query("expenses")
      .withIndex("by_userId_and_date", (q) => q.eq("userId", userId))
      .take(MAX_EXPENSES_FOR_FILTERING);

    // Batch-load all categories into a Map
    const allCategories = await ctx.db
      .query("categories")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(MAX_REFERENCE_ROWS);
    const categoryMap = new Map<
      string,
      { name: string; color: string }
    >();
    for (const cat of allCategories) {
      categoryMap.set(cat._id, { name: cat.name, color: cat.color });
    }

    const total = allExpenses.length;
    const totalAmount = allExpenses.reduce((sum, e) => sum + e.amount, 0);
    const avgAmount = total > 0 ? totalAmount / total : 0;

    // Current month in YYYY-MM format
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const thisMonthTotal = allExpenses
      .filter((e) => e.date.startsWith(currentMonth))
      .reduce((sum, e) => sum + e.amount, 0);

    // Monthly totals
    const monthlyMap = new Map<string, number>();
    for (const e of allExpenses) {
      const month = e.date.substring(0, 7); // "YYYY-MM"
      monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + e.amount);
    }
    const monthlyTotals = Array.from(monthlyMap.entries())
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Category totals
    const catTotalsMap = new Map<
      string,
      { name: string; color: string; total: number; count: number }
    >();
    for (const e of allExpenses) {
      const catId = e.categoryId ?? "__uncategorized__";
      const existing = catTotalsMap.get(catId);
      if (existing) {
        existing.total += e.amount;
        existing.count += 1;
      } else {
        const cat = e.categoryId ? categoryMap.get(e.categoryId) : null;
        catTotalsMap.set(catId, {
          name: cat?.name ?? "Uncategorized",
          color: cat?.color ?? "#9ca3af",
          total: e.amount,
          count: 1,
        });
      }
    }
    const categoryTotals = Array.from(catTotalsMap.values()).sort(
      (a, b) => b.total - a.total
    );

    return {
      total,
      totalAmount,
      avgAmount,
      thisMonthTotal,
      monthlyTotals,
      categoryTotals,
    };
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    amount: v.number(),
    date: v.string(),
    categoryId: v.optional(v.id("categories")),
    paymentMethodId: v.optional(v.id("paymentMethods")),
    notes: v.optional(v.string()),
    vendor: v.optional(v.string()),
    source: v.union(v.literal("manual"), v.literal("import")),
    importSessionId: v.optional(v.id("importSessions")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (args.amount <= 0) {
      throw new Error("Amount must be greater than 0");
    }

    // Validate date format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
      throw new Error("Date must be in YYYY-MM-DD format");
    }

    // Validate date is a real date
    const parsed = new Date(args.date + "T00:00:00Z");
    if (isNaN(parsed.getTime())) {
      throw new Error("Invalid date value");
    }

    await assertCategoryBelongsToUser(ctx, args.categoryId, userId);
    await assertPaymentMethodBelongsToUser(ctx, args.paymentMethodId, userId);
    await assertImportSessionBelongsToUser(ctx, args.importSessionId, userId);

    return await ctx.db.insert("expenses", {
      title: args.title,
      amount: args.amount,
      date: args.date,
      categoryId: args.categoryId,
      paymentMethodId: args.paymentMethodId,
      notes: args.notes,
      vendor: args.vendor,
      source: args.source,
      importSessionId: args.importSessionId,
      userId,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("expenses"),
    title: v.optional(v.string()),
    amount: v.optional(v.number()),
    date: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    paymentMethodId: v.optional(v.id("paymentMethods")),
    notes: v.optional(v.string()),
    vendor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db.get(args.id);
    assertOwner(existing, userId, "Expense not found");

    if (args.amount !== undefined && args.amount <= 0) {
      throw new Error("Amount must be greater than 0");
    }

    if (args.date !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
        throw new Error("Date must be in YYYY-MM-DD format");
      }
      const parsed = new Date(args.date + "T00:00:00Z");
      if (isNaN(parsed.getTime())) {
        throw new Error("Invalid date value");
      }
    }

    await assertCategoryBelongsToUser(ctx, args.categoryId, userId);
    await assertPaymentMethodBelongsToUser(ctx, args.paymentMethodId, userId);

    // Only include fields that were actually provided
    const patch: Record<string, unknown> = {};
    if (args.title !== undefined) patch.title = args.title;
    if (args.amount !== undefined) patch.amount = args.amount;
    if (args.date !== undefined) patch.date = args.date;
    if (args.categoryId !== undefined) patch.categoryId = args.categoryId;
    if (args.paymentMethodId !== undefined)
      patch.paymentMethodId = args.paymentMethodId;
    if (args.notes !== undefined) patch.notes = args.notes;
    if (args.vendor !== undefined) patch.vendor = args.vendor;

    await ctx.db.patch(args.id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("expenses") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db.get(args.id);
    assertOwner(existing, userId, "Expense not found");
    await ctx.db.delete(args.id);
  },
});

export const bulkCreate = mutation({
  args: {
    expenses: v.array(
      v.object({
        title: v.string(),
        amount: v.number(),
        date: v.string(),
        categoryId: v.optional(v.id("categories")),
        paymentMethodId: v.optional(v.id("paymentMethods")),
        notes: v.optional(v.string()),
        vendor: v.optional(v.string()),
      })
    ),
    importSessionId: v.id("importSessions"),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await assertImportSessionBelongsToUser(ctx, args.importSessionId, userId);

    let imported = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < args.expenses.length; i++) {
      const expense = args.expenses[i];
      try {
        if (expense.amount <= 0) {
          throw new Error("Amount must be greater than 0");
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(expense.date)) {
          throw new Error("Date must be in YYYY-MM-DD format");
        }
        const parsed = new Date(expense.date + "T00:00:00Z");
        if (isNaN(parsed.getTime())) {
          throw new Error("Invalid date value");
        }

        await assertCategoryBelongsToUser(ctx, expense.categoryId, userId);
        await assertPaymentMethodBelongsToUser(
          ctx,
          expense.paymentMethodId,
          userId
        );

        await ctx.db.insert("expenses", {
          title: expense.title,
          amount: expense.amount,
          date: expense.date,
          categoryId: expense.categoryId,
          paymentMethodId: expense.paymentMethodId,
          notes: expense.notes,
          vendor: expense.vendor,
          source: "import" as const,
          importSessionId: args.importSessionId,
          userId,
        });
        imported++;
      } catch (err) {
        errors.push({
          row: i + 1,
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return { imported, errors };
  },
});
