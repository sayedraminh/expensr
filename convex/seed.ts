import { mutation } from "./_generated/server";
import { requireUserId } from "./authHelpers";

const DEFAULT_CATEGORIES = [
  { name: "Food & Dining", color: "#10b981" },
  { name: "Transportation", color: "#3b82f6" },
  { name: "Shopping", color: "#f59e0b" },
  { name: "Entertainment", color: "#ef4444" },
  { name: "Health", color: "#8b5cf6" },
  { name: "Bills & Utilities", color: "#ec4899" },
  { name: "Travel", color: "#14b8a6" },
  { name: "Education", color: "#f97316" },
  { name: "Personal", color: "#06b6d4" },
  { name: "Other", color: "#84cc16" },
] as const;

const DEFAULT_PAYMENT_METHODS = [
  "Credit Card",
  "Debit Card",
  "Cash",
  "Bank Transfer",
  "PayPal",
] as const;

export const seedDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    let categoriesCreated = 0;
    let paymentMethodsCreated = 0;

    // Seed categories if this account has none yet
    const existingCategories = await ctx.db
      .query("categories")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!existingCategories) {
      for (const cat of DEFAULT_CATEGORIES) {
        await ctx.db.insert("categories", {
          name: cat.name,
          color: cat.color,
          userId,
        });
        categoriesCreated++;
      }
    }

    // Seed payment methods if this account has none yet
    const existingMethods = await ctx.db
      .query("paymentMethods")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!existingMethods) {
      for (const name of DEFAULT_PAYMENT_METHODS) {
        await ctx.db.insert("paymentMethods", { name, userId });
        paymentMethodsCreated++;
      }
    }

    return { categoriesCreated, paymentMethodsCreated };
  },
});
