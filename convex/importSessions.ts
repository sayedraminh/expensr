import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { assertOwner, requireUserId } from "./authHelpers";
import { removeRevenueFromStats } from "./revenueStats";

const MAX_IMPORT_SESSIONS = 1000;
const DELETE_BATCH_SIZE = 128;

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await ctx.db
      .query("importSessions")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(MAX_IMPORT_SESSIONS);
  },
});

export const getById = query({
  args: { id: v.id("importSessions") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const session = await ctx.db.get(args.id);
    assertOwner(session, userId, "Import session not found");
    return session;
  },
});

export const create = mutation({
  args: {
    fileName: v.string(),
    totalRows: v.number(),
    entityType: v.optional(
      v.union(v.literal("expense"), v.literal("revenue"))
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (args.fileName.trim() === "") {
      throw new Error("File name cannot be empty");
    }
    if (args.totalRows < 0) {
      throw new Error("Total rows cannot be negative");
    }

    return await ctx.db.insert("importSessions", {
      fileName: args.fileName,
      entityType: args.entityType ?? "expense",
      totalRows: args.totalRows,
      importedRows: 0,
      skippedRows: 0,
      errorRows: 0,
      status: "pending",
      userId,
    });
  },
});

export const updateProgress = mutation({
  args: {
    id: v.id("importSessions"),
    importedRows: v.number(),
    skippedRows: v.number(),
    errorRows: v.number(),
    errors: v.optional(
      v.array(
        v.object({
          row: v.number(),
          message: v.string(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db.get(args.id);
    assertOwner(existing, userId, "Import session not found");

    const patch: Record<string, unknown> = {
      importedRows: args.importedRows,
      skippedRows: args.skippedRows,
      errorRows: args.errorRows,
      status: "processing",
    };

    if (args.errors !== undefined) {
      patch.errors = args.errors;
    }

    await ctx.db.patch(args.id, patch);
  },
});

export const complete = mutation({
  args: { id: v.id("importSessions") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db.get(args.id);
    assertOwner(existing, userId, "Import session not found");
    await ctx.db.patch(args.id, { status: "completed" });
  },
});

export const fail = mutation({
  args: {
    id: v.id("importSessions"),
    errors: v.optional(
      v.array(
        v.object({
          row: v.number(),
          message: v.string(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db.get(args.id);
    assertOwner(existing, userId, "Import session not found");

    const patch: Record<string, unknown> = { status: "failed" };
    if (args.errors !== undefined) {
      patch.errors = args.errors;
    }

    await ctx.db.patch(args.id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("importSessions") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db.get(args.id);
    assertOwner(existing, userId, "Import session not found");

    let deletedExpenses = 0;
    let deletedRevenues = 0;
    const entityType = existing.entityType ?? "expense";
    let batchSize = 0;

    if (entityType === "revenue") {
      const batch = await ctx.db
        .query("revenues")
        .withIndex("by_userId_and_importSessionId", (q) =>
          q.eq("userId", userId).eq("importSessionId", args.id)
        )
        .take(DELETE_BATCH_SIZE);

      batchSize = batch.length;
      for (const revenue of batch) {
        await removeRevenueFromStats(ctx, revenue);
        await ctx.db.delete(revenue._id);
        deletedRevenues += 1;
      }
    } else {
      const batch = await ctx.db
        .query("expenses")
        .withIndex("by_userId_and_importSessionId", (q) =>
          q.eq("userId", userId).eq("importSessionId", args.id)
        )
        .take(DELETE_BATCH_SIZE);

      batchSize = batch.length;
      for (const expense of batch) {
        await ctx.db.delete(expense._id);
        deletedExpenses += 1;
      }
    }

    const done = batchSize < DELETE_BATCH_SIZE;
    if (done) {
      await ctx.db.delete(args.id);
    }

    return { done, deletedExpenses, deletedRevenues };
  },
});
