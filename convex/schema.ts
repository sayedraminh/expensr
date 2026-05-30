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
    source: v.union(
      v.literal("manual"),
      v.literal("import"),
      v.literal("plaid")
    ),
    importSessionId: v.optional(v.id("importSessions")),
    plaidTransactionId: v.optional(v.string()),
    plaidAccountId: v.optional(v.id("plaidAccounts")),
    plaidPendingTransactionId: v.optional(v.string()),
    plaidCategory: v.optional(v.string()),
    pending: v.optional(v.boolean()),
    userId: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_date", ["userId", "date"])
    .index("by_userId_and_categoryId", ["userId", "categoryId"])
    .index("by_userId_and_paymentMethodId", ["userId", "paymentMethodId"])
    .index("by_userId_and_importSessionId", ["userId", "importSessionId"])
    .index("by_userId_and_plaidTransactionId", [
      "userId",
      "plaidTransactionId",
    ])
    .index("by_userId_and_plaidAccountId", ["userId", "plaidAccountId"])
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
    stripeBalanceTransactionId: v.optional(v.string()),
    stripeChargeId: v.optional(v.string()),
    stripeConnectionId: v.optional(v.id("stripeConnections")),
    notes: v.optional(v.string()),
    source: v.union(
      v.literal("manual"),
      v.literal("import"),
      v.literal("stripe")
    ),
    importSessionId: v.optional(v.id("importSessions")),
    statsVersion: v.optional(v.number()),
    userId: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_date", ["userId", "date"])
    .index("by_userId_and_provider", ["userId", "provider"])
    .index("by_userId_and_importSessionId", ["userId", "importSessionId"])
    .index("by_userId_and_source", ["userId", "source"])
    .index("by_userId_and_statsVersion", ["userId", "statsVersion"])
    .index("by_userId_and_stripeBalanceTransactionId", [
      "userId",
      "stripeBalanceTransactionId",
    ])
    .index("by_userId_and_stripeConnectionId", [
      "userId",
      "stripeConnectionId",
    ])
    .index("by_date", ["date"])
    .index("by_provider", ["provider"])
    .index("by_importSession", ["importSessionId"]),

  revenueStats: defineTable({
    userId: v.string(),
    total: v.number(),
    totalAmount: v.number(),
    totalFees: v.number(),
    totalNet: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  revenueMonthlyStats: defineTable({
    userId: v.string(),
    month: v.string(),
    amount: v.number(),
    netAmount: v.number(),
    count: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_month", ["userId", "month"]),

  revenueProviderStats: defineTable({
    userId: v.string(),
    providerKey: v.string(),
    provider: v.string(),
    totalAmount: v.number(),
    totalNet: v.number(),
    count: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_providerKey", ["userId", "providerKey"]),

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
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_entityType", ["userId", "entityType"]),

  settings: defineTable({
    key: v.string(),
    value: v.string(),
    userId: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_key", ["userId", "key"])
    .index("by_key", ["key"]),

  plaidItems: defineTable({
    userId: v.string(),
    itemId: v.string(),
    accessToken: v.optional(v.string()),
    accessTokenCiphertext: v.optional(v.string()),
    accessTokenNonce: v.optional(v.string()),
    institutionId: v.optional(v.string()),
    institutionName: v.optional(v.string()),
    cursor: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("disconnected"),
      v.literal("error")
    ),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    lastSyncedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_status", ["status"])
    .index("by_itemId", ["itemId"])
    .index("by_userId_and_itemId", ["userId", "itemId"])
    .index("by_userId_and_status", ["userId", "status"])
    .index("by_status_and_lastSyncedAt", ["status", "lastSyncedAt"]),

  plaidAccounts: defineTable({
    userId: v.string(),
    plaidItemId: v.id("plaidItems"),
    accountId: v.string(),
    name: v.string(),
    officialName: v.optional(v.string()),
    mask: v.optional(v.string()),
    type: v.string(),
    subtype: v.optional(v.string()),
    availableBalance: v.optional(v.number()),
    currentBalance: v.optional(v.number()),
    isoCurrencyCode: v.optional(v.string()),
    isActive: v.boolean(),
    lastSyncedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_plaidItemId", ["plaidItemId"])
    .index("by_userId_and_plaidItemId", ["userId", "plaidItemId"])
    .index("by_userId_and_accountId", ["userId", "accountId"]),

  stripeConnections: defineTable({
    userId: v.string(),
    apiKey: v.optional(v.string()),
    apiKeyCiphertext: v.optional(v.string()),
    apiKeyNonce: v.optional(v.string()),
    keyLast4: v.string(),
    keyMode: v.union(v.literal("live"), v.literal("test")),
    status: v.union(
      v.literal("active"),
      v.literal("disconnected"),
      v.literal("error")
    ),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    lastSyncedAt: v.optional(v.number()),
    syncCursor: v.optional(v.string()),
    syncStartUnix: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_status", ["status"])
    .index("by_userId_and_status", ["userId", "status"])
    .index("by_status_and_lastSyncedAt", ["status", "lastSyncedAt"]),
});
