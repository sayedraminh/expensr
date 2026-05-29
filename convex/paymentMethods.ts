import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { assertOwner, requireUserId } from "./authHelpers";

const MAX_PAYMENT_METHODS = 1000;

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const methods = await ctx.db
      .query("paymentMethods")
      .withIndex("by_userId_and_name", (q) => q.eq("userId", userId))
      .take(MAX_PAYMENT_METHODS);
    return methods.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const getOrCreate = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const trimmedName = args.name.trim();
    if (trimmedName === "") {
      throw new Error("Payment method name cannot be empty");
    }

    // Case-insensitive lookup
    const allMethods = await ctx.db
      .query("paymentMethods")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(MAX_PAYMENT_METHODS);
    const existing = allMethods.find(
      (m) => m.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("paymentMethods", {
      name: trimmedName,
      userId,
    });
  },
});

export const create = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const trimmedName = args.name.trim();
    if (trimmedName === "") {
      throw new Error("Payment method name cannot be empty");
    }

    // Check for duplicate (case-insensitive)
    const allMethods = await ctx.db
      .query("paymentMethods")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(MAX_PAYMENT_METHODS);
    const duplicate = allMethods.find(
      (m) => m.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      throw new Error(`Payment method "${trimmedName}" already exists`);
    }

    return await ctx.db.insert("paymentMethods", {
      name: trimmedName,
      userId,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("paymentMethods") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db.get(args.id);
    assertOwner(existing, userId, "Payment method not found");

    // Check if any expenses reference this payment method
    const referencingExpense = await ctx.db
      .query("expenses")
      .withIndex("by_userId_and_paymentMethodId", (q) =>
        q.eq("userId", userId).eq("paymentMethodId", args.id)
      )
      .first();

    if (referencingExpense) {
      throw new Error(
        `Cannot delete payment method "${existing.name}" because it is used by one or more expenses. Reassign those expenses first.`
      );
    }

    await ctx.db.delete(args.id);
  },
});
