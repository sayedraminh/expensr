import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUserId } from "./authHelpers";

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const allSettings = await ctx.db
      .query("settings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(1000);
    const result: Record<string, string> = {};
    for (const setting of allSettings) {
      result[setting.key] = setting.value;
    }
    return result;
  },
});

export const get = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const setting = await ctx.db
      .query("settings")
      .withIndex("by_userId_and_key", (q) =>
        q.eq("userId", userId).eq("key", args.key)
      )
      .unique();

    return setting?.value ?? null;
  },
});

export const set = mutation({
  args: {
    key: v.string(),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (args.key.trim() === "") {
      throw new Error("Setting key cannot be empty");
    }

    const existing = await ctx.db
      .query("settings")
      .withIndex("by_userId_and_key", (q) =>
        q.eq("userId", userId).eq("key", args.key)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { value: args.value });
      return existing._id;
    }

    return await ctx.db.insert("settings", {
      key: args.key,
      value: args.value,
      userId,
    });
  },
});
