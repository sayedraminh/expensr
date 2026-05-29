import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { assertOwner, requireUserId } from "./authHelpers";

const MAX_CATEGORIES = 1000;

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_userId_and_name", (q) => q.eq("userId", userId))
      .take(MAX_CATEGORIES);
    return categories.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const getOrCreate = mutation({
  args: {
    name: v.string(),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const trimmedName = args.name.trim();
    if (trimmedName === "") {
      throw new Error("Category name cannot be empty");
    }

    // Look for an existing category with a case-insensitive name match
    const allCategories = await ctx.db
      .query("categories")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(MAX_CATEGORIES);
    const existing = allCategories.find(
      (c) => c.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("categories", {
      name: trimmedName,
      color: args.color,
      userId,
    });
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    color: v.string(),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const trimmedName = args.name.trim();
    if (trimmedName === "") {
      throw new Error("Category name cannot be empty");
    }

    // Check for duplicate name (case-insensitive)
    const allCategories = await ctx.db
      .query("categories")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(MAX_CATEGORIES);
    const duplicate = allCategories.find(
      (c) => c.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      throw new Error(`Category "${trimmedName}" already exists`);
    }

    return await ctx.db.insert("categories", {
      name: trimmedName,
      color: args.color,
      icon: args.icon,
      userId,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("categories"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db.get(args.id);
    assertOwner(existing, userId, "Category not found");

    const patch: Record<string, unknown> = {};

    if (args.name !== undefined) {
      const trimmedName = args.name.trim();
      if (trimmedName === "") {
        throw new Error("Category name cannot be empty");
      }
      // Check for duplicate name (case-insensitive), excluding current
      const allCategories = await ctx.db
        .query("categories")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(MAX_CATEGORIES);
      const duplicate = allCategories.find(
        (c) =>
          c._id !== args.id &&
          c.name.toLowerCase() === trimmedName.toLowerCase()
      );
      if (duplicate) {
        throw new Error(`Category "${trimmedName}" already exists`);
      }
      patch.name = trimmedName;
    }

    if (args.color !== undefined) patch.color = args.color;
    if (args.icon !== undefined) patch.icon = args.icon;

    await ctx.db.patch(args.id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("categories") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db.get(args.id);
    assertOwner(existing, userId, "Category not found");

    // Check if any expenses reference this category
    const referencingExpenses = await ctx.db
      .query("expenses")
      .withIndex("by_userId_and_categoryId", (q) =>
        q.eq("userId", userId).eq("categoryId", args.id)
      )
      .first();

    if (referencingExpenses) {
      throw new Error(
        `Cannot delete category "${existing.name}" because it is used by one or more expenses. Reassign those expenses first.`
      );
    }

    await ctx.db.delete(args.id);
  },
});
