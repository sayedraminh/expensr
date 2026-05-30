import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { assertOwner, requireUserId } from "./authHelpers";
import {
  addRevenueToStats,
  markRevenueStatsVersion,
  removeRevenueFromStats,
  replaceRevenueInStats,
} from "./revenueStats";

const STRIPE_API_URL = "https://api.stripe.com";
const STRIPE_PAGE_SIZE = 100;
const STRIPE_REQUEST_TIMEOUT_MS = 30_000;
const SYNC_OVERLAP_SECONDS = 3 * 24 * 60 * 60;
const MAX_SYNC_PAGES = 100;
const MAX_CONNECTIONS = 20;
const MAX_SYNC_CONNECTIONS_PER_CRON = 50;
const DELETE_STRIPE_REVENUE_BATCH_SIZE = 128;
const REVENUE_BALANCE_TRANSACTION_TYPES = new Set(["charge", "payment"]);

const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
]);

const stripeRevenueValidator = v.object({
  title: v.string(),
  amount: v.number(),
  date: v.string(),
  provider: v.string(),
  customer: v.optional(v.string()),
  fee: v.optional(v.number()),
  netAmount: v.number(),
  currency: v.optional(v.string()),
  transactionId: v.optional(v.string()),
  stripeBalanceTransactionId: v.string(),
  stripeChargeId: v.optional(v.string()),
  notes: v.optional(v.string()),
});

type StripeListResponse<T> = {
  data?: T[];
  has_more?: boolean;
};

type StripeBalanceTransactionResponse = {
  id?: string;
  amount?: number;
  fee?: number;
  net?: number;
  currency?: string;
  created?: number;
  description?: string | null;
  type?: string;
  source?: string | StripeChargeResponse | null;
};

type StripeChargeResponse = {
  id?: string;
  object?: string;
  amount_captured?: number;
  billing_details?: {
    email?: string | null;
    name?: string | null;
  } | null;
  calculated_statement_descriptor?: string | null;
  customer?: string | null;
  description?: string | null;
  paid?: boolean;
  receipt_email?: string | null;
  status?: string;
};

type NormalizedStripeRevenue = {
  title: string;
  amount: number;
  date: string;
  provider: string;
  customer?: string;
  fee?: number;
  netAmount: number;
  currency?: string;
  transactionId?: string;
  stripeBalanceTransactionId: string;
  stripeChargeId?: string;
  notes?: string;
};

type SyncableStripeConnection = {
  stripeConnectionId: Id<"stripeConnections">;
  userId: string;
  apiKey: string;
  status: "active" | "disconnected" | "error";
  lastSyncedAt?: number;
};

type StoredStripeConnection = {
  stripeConnectionId: Id<"stripeConnections">;
  userId: string;
  apiKey?: string;
  apiKeyCiphertext?: string;
  apiKeyNonce?: string;
  status: "active" | "disconnected" | "error";
  lastSyncedAt?: number;
};

type SyncOptions = {
  backfillAllTime?: boolean;
};

type SyncSummary = {
  imported: number;
  updated: number;
  skipped: number;
};

type DisconnectSummary = {
  disconnected: boolean;
  deletedRevenue: number;
};

class StripeRequestError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "StripeRequestError";
    this.code = code;
  }
}

function getRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function getStripeErrorMessage(value: unknown, fallback: string) {
  const record = getRecord(value);
  const stripeError = getRecord(record?.error);
  const message = stripeError?.message;
  return typeof message === "string" && message.trim() !== ""
    ? message
    : fallback;
}

function getStripeErrorCode(value: unknown) {
  const record = getRecord(value);
  const stripeError = getRecord(record?.error);
  const code = stripeError?.code ?? stripeError?.type;
  return typeof code === "string" ? code : undefined;
}

function optionalString(value: string | null | undefined) {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function hasStripeEncryptionSecret() {
  return (process.env.STRIPE_KEY_ENCRYPTION_SECRET?.length ?? 0) >= 32;
}

async function getStripeEncryptionKey() {
  const secret = process.env.STRIPE_KEY_ENCRYPTION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "Stripe key encryption is not configured. Set STRIPE_KEY_ENCRYPTION_SECRET in Convex to a random value at least 32 characters long."
    );
  }

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret)
  );
  return await crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptStripeApiKey(apiKey: string) {
  const key = await getStripeEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(apiKey)
  );

  return {
    apiKeyCiphertext: bytesToBase64(new Uint8Array(ciphertext)),
    apiKeyNonce: bytesToBase64(iv),
  };
}

async function decryptStripeApiKey(ciphertext: string, nonce: string) {
  const key = await getStripeEncryptionKey();
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(nonce) },
    key,
    base64ToBytes(ciphertext)
  );

  return new TextDecoder().decode(plaintext);
}

async function getStoredStripeApiKey(connection: StoredStripeConnection) {
  if (connection.apiKeyCiphertext && connection.apiKeyNonce) {
    return await decryptStripeApiKey(
      connection.apiKeyCiphertext,
      connection.apiKeyNonce
    );
  }

  const legacyApiKey = optionalString(connection.apiKey);
  if (legacyApiKey) {
    return legacyApiKey;
  }

  throw new Error("This Stripe connection does not have a usable API key.");
}

async function upgradeLegacyStoredApiKey(
  ctx: ActionCtx,
  connection: StoredStripeConnection,
  apiKey: string
) {
  if (
    connection.apiKeyCiphertext ||
    !optionalString(connection.apiKey) ||
    !hasStripeEncryptionSecret()
  ) {
    return;
  }

  const encryptedApiKey = await encryptStripeApiKey(apiKey);
  await ctx.runMutation(internal.stripe.storeEncryptedConnectionKey, {
    userId: connection.userId,
    stripeConnectionId: connection.stripeConnectionId,
    ...encryptedApiKey,
  });
}

function getRestrictedKeyMode(apiKey: string) {
  if (apiKey.startsWith("rk_live_")) {
    return "live" as const;
  }
  if (apiKey.startsWith("rk_test_")) {
    return "test" as const;
  }
  throw new Error(
    "Use a restricted Stripe API key that starts with rk_live_ or rk_test_."
  );
}

function getInitialSyncDays() {
  const rawValue = process.env.STRIPE_INITIAL_SYNC_DAYS;
  if (!rawValue) {
    return undefined;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function getSyncStartUnix(
  lastSyncedAt: number | undefined,
  options: SyncOptions = {}
) {
  if (options.backfillAllTime === true) {
    return undefined;
  }

  if (typeof lastSyncedAt === "number") {
    return Math.max(0, Math.floor(lastSyncedAt / 1000) - SYNC_OVERLAP_SECONDS);
  }

  const initialSyncDays = getInitialSyncDays();
  if (initialSyncDays === undefined) {
    return undefined;
  }

  const initialWindowSeconds = initialSyncDays * 24 * 60 * 60;
  return Math.max(0, Math.floor(Date.now() / 1000) - initialWindowSeconds);
}

function addParam(
  params: URLSearchParams,
  key: string,
  value: string | number | string[] | undefined
) {
  if (value === undefined) {
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      params.append(key, entry);
    }
    return;
  }

  params.append(key, String(value));
}

async function stripeGet<T>(
  apiKey: string,
  path: string,
  params: Record<string, string | number | string[] | undefined>
): Promise<T> {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    addParam(searchParams, key, value);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    STRIPE_REQUEST_TIMEOUT_MS
  );

  let response: Response;
  try {
    response = await fetch(`${STRIPE_API_URL}${path}?${searchParams}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new StripeRequestError("Stripe request timed out.", "timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new StripeRequestError(
      getStripeErrorMessage(
        data,
        `Stripe request failed with ${response.status}.`
      ),
      getStripeErrorCode(data)
    );
  }

  return data as T;
}

async function listBalanceTransactions(
  apiKey: string,
  params: Record<string, string | number | string[] | undefined>
) {
  return await stripeGet<
    StripeListResponse<StripeBalanceTransactionResponse>
  >(apiKey, "/v1/balance_transactions", params);
}

function currencyDivisor(currency: string) {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase()) ? 1 : 100;
}

function toCurrencyAmount(amount: number, currency: string) {
  return amount / currencyDivisor(currency);
}

function dateFromStripeTimestamp(timestamp: number) {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function getChargeSource(
  source: StripeBalanceTransactionResponse["source"]
): { chargeId?: string; charge?: StripeChargeResponse } {
  if (typeof source === "string") {
    return { chargeId: optionalString(source) };
  }

  if (source && source.object === "charge") {
    return {
      chargeId: optionalString(source.id),
      charge: source,
    };
  }

  return {};
}

function normalizeBalanceTransaction(
  transaction: StripeBalanceTransactionResponse
): NormalizedStripeRevenue | null {
  const stripeBalanceTransactionId = optionalString(transaction.id);
  const currency = optionalString(transaction.currency)?.toUpperCase();
  if (
    !stripeBalanceTransactionId ||
    !currency ||
    typeof transaction.amount !== "number" ||
    typeof transaction.net !== "number" ||
    typeof transaction.created !== "number"
  ) {
    return null;
  }

  if (
    !transaction.type ||
    !REVENUE_BALANCE_TRANSACTION_TYPES.has(transaction.type) ||
    transaction.amount <= 0
  ) {
    return null;
  }

  const { chargeId, charge } = getChargeSource(transaction.source);
  if (charge?.status && charge.status !== "succeeded") {
    return null;
  }
  if (charge?.paid === false) {
    return null;
  }

  const customer =
    optionalString(charge?.billing_details?.name) ??
    optionalString(charge?.billing_details?.email) ??
    optionalString(charge?.receipt_email) ??
    optionalString(charge?.customer);
  const title =
    optionalString(charge?.description) ??
    optionalString(transaction.description) ??
    optionalString(charge?.calculated_statement_descriptor) ??
    "Stripe payment";
  const amount = toCurrencyAmount(transaction.amount, currency);
  const fee =
    typeof transaction.fee === "number"
      ? toCurrencyAmount(transaction.fee, currency)
      : undefined;
  const netAmount = toCurrencyAmount(transaction.net, currency);

  const normalized: NormalizedStripeRevenue = {
    title,
    amount,
    date: dateFromStripeTimestamp(transaction.created),
    provider: "Stripe",
    netAmount,
    currency,
    stripeBalanceTransactionId,
  };

  if (customer) normalized.customer = customer;
  if (fee !== undefined) normalized.fee = fee;
  if (chargeId) {
    normalized.transactionId = chargeId;
    normalized.stripeChargeId = chargeId;
  }

  return normalized;
}

function emptySummary(): SyncSummary {
  return {
    imported: 0,
    updated: 0,
    skipped: 0,
  };
}

function addSummaries(total: SyncSummary, page: SyncSummary) {
  total.imported += page.imported;
  total.updated += page.updated;
  total.skipped += page.skipped;
}

function getSyncError(error: unknown) {
  if (error instanceof StripeRequestError) {
    return {
      errorCode: error.code,
      errorMessage: error.message,
    };
  }

  return {
    errorCode: undefined,
    errorMessage:
      error instanceof Error ? error.message : "Unknown Stripe error",
  };
}

async function markSyncError(
  ctx: ActionCtx,
  connection: SyncableStripeConnection,
  error: unknown
) {
  const syncError = getSyncError(error);
  await ctx.runMutation(internal.stripe.markConnectionError, {
    userId: connection.userId,
    stripeConnectionId: connection.stripeConnectionId,
    errorCode: syncError.errorCode,
    errorMessage: syncError.errorMessage,
  });
}

async function syncConnectionWithApiKey(
  ctx: ActionCtx,
  connection: SyncableStripeConnection,
  options: SyncOptions = {}
): Promise<SyncSummary> {
  if (
    connection.status === "disconnected" ||
    connection.apiKey.trim() === ""
  ) {
    throw new Error("This Stripe connection is disconnected.");
  }

  const syncStartUnix = getSyncStartUnix(connection.lastSyncedAt, options);
  let startingAfter: string | undefined;
  let hasMore = true;
  let pageCount = 0;
  const summary = emptySummary();

  while (hasMore && pageCount < MAX_SYNC_PAGES) {
    const data = await listBalanceTransactions(connection.apiKey, {
      limit: STRIPE_PAGE_SIZE,
      "created[gte]": syncStartUnix,
      "expand[]": ["data.source"],
      starting_after: startingAfter,
    });

    const transactions = data.data ?? [];
    const normalized = transactions
      .map(normalizeBalanceTransaction)
      .filter(
        (revenue): revenue is NormalizedStripeRevenue => revenue !== null
      );

    const pageSummary: SyncSummary = await ctx.runMutation(
      internal.stripe.applySyncPage,
      {
        userId: connection.userId,
        stripeConnectionId: connection.stripeConnectionId,
        revenues: normalized,
      }
    );
    pageSummary.skipped += transactions.length - normalized.length;
    addSummaries(summary, pageSummary);

    hasMore = data.has_more ?? false;
    startingAfter = optionalString(transactions[transactions.length - 1]?.id);
    if (hasMore && !startingAfter) {
      throw new Error("Stripe did not return a pagination cursor.");
    }
    pageCount += 1;
  }

  if (hasMore) {
    throw new Error(
      `Stripe sync reached the ${MAX_SYNC_PAGES} page limit before finishing. Run the sync again to continue without advancing the saved sync time.`
    );
  }

  await ctx.runMutation(internal.stripe.finishConnectionSync, {
    userId: connection.userId,
    stripeConnectionId: connection.stripeConnectionId,
    lastSyncedAt: Date.now(),
  });

  return summary;
}

export const connect = action({
  args: {
    apiKey: v.string(),
  },
  handler: async (ctx, args): Promise<SyncSummary> => {
    const userId = await requireUserId(ctx);
    const apiKey = args.apiKey.trim();
    const keyMode = getRestrictedKeyMode(apiKey);
    const keyLast4 = apiKey.slice(-4);
    const encryptedApiKey = await encryptStripeApiKey(apiKey);

    await listBalanceTransactions(apiKey, {
      limit: 1,
      "expand[]": ["data.source"],
    });

    const upsertResult: { stripeConnectionId: Id<"stripeConnections"> } =
      await ctx.runMutation(internal.stripe.upsertConnection, {
        userId,
        keyLast4,
        keyMode,
        ...encryptedApiKey,
      });

    const connection: SyncableStripeConnection = {
      stripeConnectionId: upsertResult.stripeConnectionId,
      userId,
      apiKey,
      status: "active",
    };

    try {
      return await syncConnectionWithApiKey(ctx, connection);
    } catch (error) {
      await markSyncError(ctx, connection, error);
      throw error;
    }
  },
});

export const syncConnection = action({
  args: {
    stripeConnectionId: v.id("stripeConnections"),
    backfillAllTime: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<SyncSummary> => {
    const userId = await requireUserId(ctx);
    const storedConnection: StoredStripeConnection | null = await ctx.runQuery(
      internal.stripe.getSyncableConnection,
      {
        userId,
        stripeConnectionId: args.stripeConnectionId,
      }
    );
    if (!storedConnection) {
      throw new Error("Stripe connection not found.");
    }

    const apiKey = await getStoredStripeApiKey(storedConnection);
    await upgradeLegacyStoredApiKey(ctx, storedConnection, apiKey);
    const connection: SyncableStripeConnection = {
      stripeConnectionId: storedConnection.stripeConnectionId,
      userId: storedConnection.userId,
      apiKey,
      status: storedConnection.status,
      lastSyncedAt: storedConnection.lastSyncedAt,
    };

    try {
      return await syncConnectionWithApiKey(ctx, connection, {
        backfillAllTime: args.backfillAllTime,
      });
    } catch (error) {
      await markSyncError(ctx, connection, error);
      throw error;
    }
  },
});

export const disconnectConnection = action({
  args: {
    stripeConnectionId: v.id("stripeConnections"),
    deleteRevenue: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<DisconnectSummary> => {
    const userId = await requireUserId(ctx);
    const connection: StoredStripeConnection | null = await ctx.runQuery(
      internal.stripe.getConnectionForOwner,
      {
        userId,
        stripeConnectionId: args.stripeConnectionId,
      }
    );
    if (!connection) {
      throw new Error("Stripe connection not found.");
    }

    let deletedRevenue = 0;
    if (args.deleteRevenue === true) {
      let done = false;
      while (!done) {
        const result: { done: boolean; deletedRevenue: number } =
          await ctx.runMutation(
            internal.stripe.deleteStripeConnectionRevenueBatch,
            {
              userId,
              stripeConnectionId: args.stripeConnectionId,
            }
          );
        deletedRevenue += result.deletedRevenue;
        done = result.done;
      }
    }

    await ctx.runMutation(internal.stripe.markConnectionDisconnected, {
      userId,
      stripeConnectionId: args.stripeConnectionId,
    });

    return { disconnected: true, deletedRevenue };
  },
});

export const disconnectAllConnections = action({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const connections: StoredStripeConnection[] = await ctx.runQuery(
      internal.stripe.listDisconnectableConnectionsForUser,
      { userId }
    );

    let disconnected = 0;
    for (const connection of connections) {
      await ctx.runMutation(internal.stripe.markConnectionDisconnected, {
        userId,
        stripeConnectionId: connection.stripeConnectionId,
      });
      disconnected += 1;
    }

    return { disconnected };
  },
});

export const syncAllConnectedConnections = internalAction({
  args: {},
  handler: async (ctx) => {
    const connections: StoredStripeConnection[] = await ctx.runQuery(
      internal.stripe.listSyncableConnections,
      {}
    );
    const total = emptySummary();
    let failed = 0;

    for (const connection of connections) {
      try {
        const apiKey = await getStoredStripeApiKey(connection);
        await upgradeLegacyStoredApiKey(ctx, connection, apiKey);
        const connectionSummary = await syncConnectionWithApiKey(ctx, {
          stripeConnectionId: connection.stripeConnectionId,
          userId: connection.userId,
          apiKey,
          status: connection.status,
          lastSyncedAt: connection.lastSyncedAt,
        });
        addSummaries(total, connectionSummary);
      } catch (error) {
        failed += 1;
        const syncError = getSyncError(error);
        await ctx.runMutation(internal.stripe.markConnectionError, {
          userId: connection.userId,
          stripeConnectionId: connection.stripeConnectionId,
          errorCode: syncError.errorCode,
          errorMessage: syncError.errorMessage,
        });
      }
    }

    return {
      ...total,
      failed,
    };
  },
});

export const listConnections = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const connections = await ctx.db
      .query("stripeConnections")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(MAX_CONNECTIONS);

    return connections
      .filter((connection) => connection.status !== "disconnected")
      .map((connection) => ({
        _id: connection._id,
        _creationTime: connection._creationTime,
        keyLast4: connection.keyLast4,
        keyMode: connection.keyMode,
        status: connection.status,
        errorCode: connection.errorCode ?? null,
        errorMessage: connection.errorMessage ?? null,
        lastSyncedAt: connection.lastSyncedAt ?? null,
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
      }));
  },
});

export const upsertConnection = internalMutation({
  args: {
    userId: v.string(),
    apiKeyCiphertext: v.string(),
    apiKeyNonce: v.string(),
    keyLast4: v.string(),
    keyMode: v.union(v.literal("live"), v.literal("test")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const active = await ctx.db
      .query("stripeConnections")
      .withIndex("by_userId_and_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active")
      )
      .first();
    const error = active
      ? null
      : await ctx.db
          .query("stripeConnections")
          .withIndex("by_userId_and_status", (q) =>
            q.eq("userId", args.userId).eq("status", "error")
          )
          .first();
    const existing = active ?? error;

    if (existing) {
      await ctx.db.patch(existing._id, {
        apiKey: undefined,
        apiKeyCiphertext: args.apiKeyCiphertext,
        apiKeyNonce: args.apiKeyNonce,
        keyLast4: args.keyLast4,
        keyMode: args.keyMode,
        status: "active" as const,
        errorCode: undefined,
        errorMessage: undefined,
        updatedAt: now,
      });
      return { stripeConnectionId: existing._id };
    }

    const stripeConnectionId = await ctx.db.insert("stripeConnections", {
      userId: args.userId,
      apiKeyCiphertext: args.apiKeyCiphertext,
      apiKeyNonce: args.apiKeyNonce,
      keyLast4: args.keyLast4,
      keyMode: args.keyMode,
      status: "active" as const,
      createdAt: now,
      updatedAt: now,
    });

    return { stripeConnectionId };
  },
});

export const storeEncryptedConnectionKey = internalMutation({
  args: {
    userId: v.string(),
    stripeConnectionId: v.id("stripeConnections"),
    apiKeyCiphertext: v.string(),
    apiKeyNonce: v.string(),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.stripeConnectionId);
    assertOwner(connection, args.userId, "Stripe connection not found");
    await ctx.db.patch(args.stripeConnectionId, {
      apiKey: undefined,
      apiKeyCiphertext: args.apiKeyCiphertext,
      apiKeyNonce: args.apiKeyNonce,
      updatedAt: Date.now(),
    });
  },
});

export const getSyncableConnection = internalQuery({
  args: {
    userId: v.string(),
    stripeConnectionId: v.id("stripeConnections"),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.stripeConnectionId);
    assertOwner(connection, args.userId, "Stripe connection not found");
    if (connection.status === "disconnected") {
      return null;
    }

    return {
      stripeConnectionId: connection._id,
      userId: connection.userId,
      apiKey: connection.apiKey,
      apiKeyCiphertext: connection.apiKeyCiphertext,
      apiKeyNonce: connection.apiKeyNonce,
      status: connection.status,
      lastSyncedAt: connection.lastSyncedAt,
    };
  },
});

export const getConnectionForOwner = internalQuery({
  args: {
    userId: v.string(),
    stripeConnectionId: v.id("stripeConnections"),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.stripeConnectionId);
    assertOwner(connection, args.userId, "Stripe connection not found");

    return {
      stripeConnectionId: connection._id,
      userId: connection.userId,
      apiKey: connection.apiKey,
      apiKeyCiphertext: connection.apiKeyCiphertext,
      apiKeyNonce: connection.apiKeyNonce,
      status: connection.status,
      lastSyncedAt: connection.lastSyncedAt,
    };
  },
});

export const listSyncableConnections = internalQuery({
  args: {},
  handler: async (ctx) => {
    const activeConnections = await ctx.db
      .query("stripeConnections")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(MAX_SYNC_CONNECTIONS_PER_CRON);
    const remaining = MAX_SYNC_CONNECTIONS_PER_CRON - activeConnections.length;
    const errorConnections =
      remaining > 0
        ? await ctx.db
            .query("stripeConnections")
            .withIndex("by_status", (q) => q.eq("status", "error"))
            .take(remaining)
        : [];

    return [...activeConnections, ...errorConnections].map((connection) => ({
      stripeConnectionId: connection._id,
      userId: connection.userId,
      apiKey: connection.apiKey,
      apiKeyCiphertext: connection.apiKeyCiphertext,
      apiKeyNonce: connection.apiKeyNonce,
      status: connection.status,
      lastSyncedAt: connection.lastSyncedAt,
    }));
  },
});

export const listDisconnectableConnectionsForUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const connections = await ctx.db
      .query("stripeConnections")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .take(MAX_CONNECTIONS);

    return connections
      .filter((connection) => connection.status !== "disconnected")
      .map((connection) => ({
        stripeConnectionId: connection._id,
        userId: connection.userId,
        apiKey: connection.apiKey,
        apiKeyCiphertext: connection.apiKeyCiphertext,
        apiKeyNonce: connection.apiKeyNonce,
        status: connection.status,
        lastSyncedAt: connection.lastSyncedAt,
      }));
  },
});

export const applySyncPage = internalMutation({
  args: {
    userId: v.string(),
    stripeConnectionId: v.id("stripeConnections"),
    revenues: v.array(stripeRevenueValidator),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.stripeConnectionId);
    assertOwner(connection, args.userId, "Stripe connection not found");
    if (connection.status === "disconnected") {
      return emptySummary();
    }

    const summary = emptySummary();
    for (const revenue of args.revenues) {
      const existing = await ctx.db
        .query("revenues")
        .withIndex("by_userId_and_stripeBalanceTransactionId", (q) =>
          q
            .eq("userId", args.userId)
            .eq(
              "stripeBalanceTransactionId",
              revenue.stripeBalanceTransactionId
            )
        )
        .unique();

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
        stripeBalanceTransactionId: revenue.stripeBalanceTransactionId,
        stripeChargeId: revenue.stripeChargeId,
        stripeConnectionId: args.stripeConnectionId,
        notes: revenue.notes,
        source: "stripe" as const,
        userId: args.userId,
      });

      if (existing) {
        await replaceRevenueInStats(ctx, existing, revenueFields);
        await ctx.db.patch(existing._id, revenueFields);
        summary.updated += 1;
        continue;
      }

      await ctx.db.insert("revenues", revenueFields);
      await addRevenueToStats(ctx, revenueFields);
      summary.imported += 1;
    }

    return summary;
  },
});

export const finishConnectionSync = internalMutation({
  args: {
    userId: v.string(),
    stripeConnectionId: v.id("stripeConnections"),
    lastSyncedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.stripeConnectionId);
    assertOwner(connection, args.userId, "Stripe connection not found");
    if (connection.status === "disconnected") {
      return;
    }

    await ctx.db.patch(args.stripeConnectionId, {
      status: "active" as const,
      errorCode: undefined,
      errorMessage: undefined,
      lastSyncedAt: args.lastSyncedAt,
      updatedAt: args.lastSyncedAt,
    });
  },
});

export const markConnectionError = internalMutation({
  args: {
    userId: v.string(),
    stripeConnectionId: v.id("stripeConnections"),
    errorCode: v.optional(v.string()),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.stripeConnectionId);
    assertOwner(connection, args.userId, "Stripe connection not found");
    if (connection.status === "disconnected") {
      return;
    }

    await ctx.db.patch(args.stripeConnectionId, {
      status: "error" as const,
      errorCode: args.errorCode,
      errorMessage: args.errorMessage,
      updatedAt: Date.now(),
    });
  },
});

export const markConnectionDisconnected = internalMutation({
  args: {
    userId: v.string(),
    stripeConnectionId: v.id("stripeConnections"),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.stripeConnectionId);
    assertOwner(connection, args.userId, "Stripe connection not found");
    await ctx.db.patch(args.stripeConnectionId, {
      apiKey: "",
      apiKeyCiphertext: undefined,
      apiKeyNonce: undefined,
      keyLast4: "",
      status: "disconnected" as const,
      updatedAt: Date.now(),
    });
  },
});

export const deleteStripeConnectionRevenueBatch = internalMutation({
  args: {
    userId: v.string(),
    stripeConnectionId: v.id("stripeConnections"),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.stripeConnectionId);
    assertOwner(connection, args.userId, "Stripe connection not found");

    const revenues = await ctx.db
      .query("revenues")
      .withIndex("by_userId_and_stripeConnectionId", (q) =>
        q
          .eq("userId", args.userId)
          .eq("stripeConnectionId", args.stripeConnectionId)
      )
      .take(DELETE_STRIPE_REVENUE_BATCH_SIZE);

    for (const revenue of revenues) {
      await removeRevenueFromStats(ctx, revenue);
      await ctx.db.delete(revenue._id);
    }

    return {
      done: revenues.length < DELETE_STRIPE_REVENUE_BATCH_SIZE,
      deletedRevenue: revenues.length,
    };
  },
});
