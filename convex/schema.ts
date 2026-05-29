import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    subject: v.optional(v.string()),
    issuer: v.optional(v.string()),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    pictureUrl: v.optional(v.string()),
    createdAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  expenses: defineTable({
    title: v.string(),
    amount: v.number(),
    date: v.string(), // "YYYY-MM-DD"
    categoryId: v.optional(v.id("categories")),
    paymentMethodId: v.optional(v.id("paymentMethods")),
    notes: v.optional(v.string()),
    vendor: v.optional(v.string()),
    source: v.union(v.literal("manual"), v.literal("import")),
    importSessionId: v.optional(v.id("importSessions")),
    userId: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_date", ["userId", "date"])
    .index("by_userId_and_categoryId", ["userId", "categoryId"])
    .index("by_userId_and_paymentMethodId", ["userId", "paymentMethodId"])
    .index("by_userId_and_importSessionId", ["userId", "importSessionId"])
    .index("by_date", ["date"])
    .index("by_category", ["categoryId"])
    .index("by_paymentMethod", ["paymentMethodId"])
    .index("by_importSession", ["importSessionId"]),

  revenues: defineTable({
    title: v.string(),
    amount: v.number(),
    date: v.string(), // "YYYY-MM-DD"
    provider: v.string(),
    customer: v.optional(v.string()),
    fee: v.optional(v.number()),
    netAmount: v.number(),
    currency: v.optional(v.string()),
    transactionId: v.optional(v.string()),
    notes: v.optional(v.string()),
    source: v.union(v.literal("manual"), v.literal("import")),
    importSessionId: v.optional(v.id("importSessions")),
    userId: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_date", ["userId", "date"])
    .index("by_userId_and_provider", ["userId", "provider"])
    .index("by_userId_and_importSessionId", ["userId", "importSessionId"])
    .index("by_date", ["date"])
    .index("by_provider", ["provider"])
    .index("by_importSession", ["importSessionId"]),

  categories: defineTable({
    name: v.string(),
    color: v.string(),
    icon: v.optional(v.string()),
    userId: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_name", ["userId", "name"])
    .index("by_name", ["name"]),

  paymentMethods: defineTable({
    name: v.string(),
    userId: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_name", ["userId", "name"])
    .index("by_name", ["name"]),

  importSessions: defineTable({
    fileName: v.string(),
    entityType: v.optional(
      v.union(v.literal("expense"), v.literal("revenue"))
    ),
    totalRows: v.number(),
    importedRows: v.number(),
    skippedRows: v.number(),
    errorRows: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    mappingSummary: v.optional(v.string()),
    errors: v.optional(
      v.array(
        v.object({
          row: v.number(),
          message: v.string(),
        })
      )
    ),
    userId: v.optional(v.string()),
  }).index("by_userId", ["userId"]),

  settings: defineTable({
    key: v.string(),
    value: v.string(),
    userId: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_key", ["userId", "key"])
    .index("by_key", ["key"]),
});
