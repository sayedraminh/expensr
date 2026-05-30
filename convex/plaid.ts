import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type {
  ActionCtx,
  MutationCtx,
  QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertOwner, requireUserId } from "./authHelpers";

const DEFAULT_PRODUCTS = ["transactions"];
const DEFAULT_COUNTRY_CODES = ["US"];
const DEFAULT_LANGUAGE = "en";
const DEFAULT_DAYS_REQUESTED = 180;
const PLAID_SYNC_PAGE_SIZE = 100;
const MAX_SYNC_PAGES = 20;
const MAX_CONNECTIONS = 100;
const MAX_ACCOUNTS_PER_ITEM = 100;
const MAX_SYNC_ITEMS_PER_CRON = 50;
const MAX_REFERENCE_ROWS = 1000;
const DELETE_PLAID_ITEM_EXPENSE_BATCH_SIZE = 128;
const PLAID_REQUEST_TIMEOUT_MS = 30_000;

const CATEGORY_COLORS = [
  "#10b981",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#06b6d4",
  "#84cc16",
  "#6366f1",
  "#d946ef",
];

const plaidAccountValidator = v.object({
  accountId: v.string(),
  name: v.string(),
  officialName: v.optional(v.string()),
  mask: v.optional(v.string()),
  type: v.string(),
  subtype: v.optional(v.string()),
  availableBalance: v.optional(v.number()),
  currentBalance: v.optional(v.number()),
  isoCurrencyCode: v.optional(v.string()),
});

const plaidTransactionValidator = v.object({
  transactionId: v.string(),
  accountId: v.string(),
  amount: v.number(),
  isoCurrencyCode: v.optional(v.string()),
  date: v.string(),
  authorizedDate: v.optional(v.string()),
  name: v.string(),
  merchantName: v.optional(v.string()),
  pending: v.boolean(),
  pendingTransactionId: v.optional(v.string()),
  category: v.optional(v.string()),
  categoryDetailed: v.optional(v.string()),
});

const removedTransactionValidator = v.object({
  transactionId: v.string(),
});

const plaidMetadataInstitutionValidator = v.object({
  name: v.optional(v.string()),
  institution_id: v.optional(v.string()),
});

const plaidMetadataAccountValidator = v.object({
  id: v.optional(v.string()),
  account_id: v.optional(v.string()),
  name: v.optional(v.string()),
  mask: v.optional(v.string()),
  type: v.optional(v.string()),
  subtype: v.optional(v.string()),
});

const plaidMetadataValidator = v.object({
  institution: v.optional(
    v.union(v.null(), plaidMetadataInstitutionValidator)
  ),
  accounts: v.optional(v.array(plaidMetadataAccountValidator)),
});

type PlaidConfig = {
  clientId: string;
  secret: string;
  apiUrl: string;
  clientName: string;
  products: string[];
  countryCodes: string[];
  language: string;
  daysRequested: number;
  linkCustomizationName?: string;
  webhookUrl?: string;
};

type PlaidLinkTokenResponse = {
  link_token?: string;
  expiration?: string;
  request_id?: string;
};

type PlaidExchangeResponse = {
  access_token?: string;
  item_id?: string;
  request_id?: string;
};

type PlaidTransactionsSyncResponse = {
  accounts?: PlaidAccountResponse[];
  added?: PlaidTransactionResponse[];
  modified?: PlaidTransactionResponse[];
  removed?: PlaidRemovedTransactionResponse[];
  next_cursor?: string;
  has_more?: boolean;
  transactions_update_status?: string;
};

type PlaidAccountResponse = {
  account_id?: string;
  name?: string;
  official_name?: string | null;
  mask?: string | null;
  type?: string;
  subtype?: string | null;
  balances?: {
    available?: number | null;
    current?: number | null;
    iso_currency_code?: string | null;
  };
};

type PlaidTransactionResponse = {
  transaction_id?: string;
  account_id?: string;
  amount?: number;
  iso_currency_code?: string | null;
  date?: string;
  authorized_date?: string | null;
  name?: string;
  merchant_name?: string | null;
  pending?: boolean;
  pending_transaction_id?: string | null;
  personal_finance_category?: {
    primary?: string | null;
    detailed?: string | null;
  } | null;
  category?: string[] | null;
};

type PlaidRemovedTransactionResponse = {
  transaction_id?: string;
};

type NormalizedPlaidAccount = {
  accountId: string;
  name: string;
  officialName?: string;
  mask?: string;
  type: string;
  subtype?: string;
  availableBalance?: number;
  currentBalance?: number;
  isoCurrencyCode?: string;
};

type NormalizedPlaidTransaction = {
  transactionId: string;
  accountId: string;
  amount: number;
  isoCurrencyCode?: string;
  date: string;
  authorizedDate?: string;
  name: string;
  merchantName?: string;
  pending: boolean;
  pendingTransactionId?: string;
  category?: string;
  categoryDetailed?: string;
};

type NormalizedRemovedTransaction = {
  transactionId: string;
};

type SyncableItem = {
  plaidItemId: Id<"plaidItems">;
  userId: string;
  accessToken: string;
  cursor?: string;
  status: "active" | "disconnected" | "error";
};

type StoredPlaidItem = {
  plaidItemId: Id<"plaidItems">;
  userId: string;
  accessToken?: string;
  accessTokenCiphertext?: string;
  accessTokenNonce?: string;
  cursor?: string;
  status: "active" | "disconnected" | "error";
};

type SyncSummary = {
  imported: number;
  updated: number;
  removed: number;
  skipped: number;
  accounts: number;
};

type DisconnectSummary = {
  disconnected: boolean;
  deletedExpenses: number;
};

class PlaidRequestError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "PlaidRequestError";
    this.code = code;
  }
}

function parseEnvList(value: string | undefined, fallback: string[]) {
  const parsed = (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
}

function getPlaidApiUrl(env: string) {
  switch (env) {
    case "sandbox":
      return "https://sandbox.plaid.com";
    case "development":
      return "https://development.plaid.com";
    case "production":
      return "https://production.plaid.com";
    default:
      throw new Error(
        "PLAID_ENV must be one of sandbox, development, or production."
      );
  }
}

function getPlaidConfig(): PlaidConfig {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) {
    throw new Error(
      "Plaid is not configured. Set PLAID_CLIENT_ID and PLAID_SECRET in Convex environment variables."
    );
  }

  const plaidEnv = (process.env.PLAID_ENV ?? "sandbox").toLowerCase();
  const daysRequested = Number.parseInt(
    process.env.PLAID_DAYS_REQUESTED ?? `${DEFAULT_DAYS_REQUESTED}`,
    10
  );

  return {
    clientId,
    secret,
    apiUrl: process.env.PLAID_API_URL ?? getPlaidApiUrl(plaidEnv),
    clientName: process.env.PLAID_CLIENT_NAME ?? "Extracker",
    products: parseEnvList(process.env.PLAID_PRODUCTS, DEFAULT_PRODUCTS),
    countryCodes: parseEnvList(
      process.env.PLAID_COUNTRY_CODES,
      DEFAULT_COUNTRY_CODES
    ),
    language: process.env.PLAID_LANGUAGE ?? DEFAULT_LANGUAGE,
    daysRequested: Number.isFinite(daysRequested)
      ? daysRequested
      : DEFAULT_DAYS_REQUESTED,
    linkCustomizationName: optionalString(
      process.env.PLAID_LINK_CUSTOMIZATION_NAME
    ),
    webhookUrl: process.env.PLAID_WEBHOOK_URL,
  };
}

function getRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function getErrorMessage(value: unknown, fallback: string) {
  const record = getRecord(value);
  const displayMessage = record?.display_message;
  const errorMessage = record?.error_message;

  if (typeof displayMessage === "string" && displayMessage.trim() !== "") {
    return displayMessage;
  }
  if (typeof errorMessage === "string" && errorMessage.trim() !== "") {
    return errorMessage;
  }
  return fallback;
}

function getErrorCode(value: unknown) {
  const record = getRecord(value);
  return typeof record?.error_code === "string" ? record.error_code : undefined;
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

function hasPlaidTokenEncryptionSecret() {
  return (process.env.PLAID_TOKEN_ENCRYPTION_SECRET?.length ?? 0) >= 32;
}

function getPlaidTokenEncryptionSecret() {
  const secret = process.env.PLAID_TOKEN_ENCRYPTION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "Plaid token encryption is not configured. Set PLAID_TOKEN_ENCRYPTION_SECRET in Convex to a random value at least 32 characters long."
    );
  }

  return secret;
}

async function getPlaidTokenEncryptionKey() {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(getPlaidTokenEncryptionSecret())
  );
  return await crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptPlaidAccessToken(accessToken: string) {
  const key = await getPlaidTokenEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(accessToken)
  );

  return {
    accessTokenCiphertext: bytesToBase64(new Uint8Array(ciphertext)),
    accessTokenNonce: bytesToBase64(iv),
  };
}

async function decryptPlaidAccessToken(ciphertext: string, nonce: string) {
  const key = await getPlaidTokenEncryptionKey();
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(nonce) },
    key,
    base64ToBytes(ciphertext)
  );

  return new TextDecoder().decode(plaintext);
}

async function getStoredPlaidAccessToken(item: StoredPlaidItem) {
  if (item.accessTokenCiphertext && item.accessTokenNonce) {
    return await decryptPlaidAccessToken(
      item.accessTokenCiphertext,
      item.accessTokenNonce
    );
  }

  const legacyAccessToken = optionalString(item.accessToken);
  if (legacyAccessToken) {
    return legacyAccessToken;
  }

  throw new Error("This bank connection does not have a usable access token.");
}

async function upgradeLegacyStoredAccessToken(
  ctx: ActionCtx,
  item: StoredPlaidItem,
  accessToken: string
) {
  if (
    item.accessTokenCiphertext ||
    !optionalString(item.accessToken) ||
    !hasPlaidTokenEncryptionSecret()
  ) {
    return;
  }

  const encryptedAccessToken = await encryptPlaidAccessToken(accessToken);
  await ctx.runMutation(internal.plaid.storeEncryptedItemAccessToken, {
    userId: item.userId,
    plaidItemId: item.plaidItemId,
    ...encryptedAccessToken,
  });
}

async function plaidRequest<T>(
  path: string,
  payload: Record<string, unknown>
): Promise<T> {
  const config = getPlaidConfig();
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    PLAID_REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(`${config.apiUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: config.clientId,
        secret: config.secret,
        ...payload,
      }),
      signal: controller.signal,
    });

    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new PlaidRequestError(
        getErrorMessage(data, `Plaid request failed with ${response.status}.`),
        getErrorCode(data)
      );
    }

    return data as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new PlaidRequestError(
        "Plaid request timed out. Try again in a few minutes.",
        "REQUEST_TIMEOUT"
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function optionalString(value: string | null | undefined) {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

function normalizeAccount(
  account: PlaidAccountResponse
): NormalizedPlaidAccount | null {
  const accountId = optionalString(account.account_id);
  if (!accountId) {
    return null;
  }

  const normalized: NormalizedPlaidAccount = {
    accountId,
    name: optionalString(account.name) ?? "Plaid account",
    type: optionalString(account.type) ?? "unknown",
  };
  const officialName = optionalString(account.official_name);
  const mask = optionalString(account.mask);
  const subtype = optionalString(account.subtype);
  const availableBalance = account.balances?.available;
  const currentBalance = account.balances?.current;
  const isoCurrencyCode = optionalString(account.balances?.iso_currency_code);

  if (officialName) normalized.officialName = officialName;
  if (mask) normalized.mask = mask;
  if (subtype) normalized.subtype = subtype;
  if (typeof availableBalance === "number") {
    normalized.availableBalance = availableBalance;
  }
  if (typeof currentBalance === "number") {
    normalized.currentBalance = currentBalance;
  }
  if (isoCurrencyCode) normalized.isoCurrencyCode = isoCurrencyCode;

  return normalized;
}

function formatPlaidCategory(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeTransaction(
  transaction: PlaidTransactionResponse
): NormalizedPlaidTransaction | null {
  const transactionId = optionalString(transaction.transaction_id);
  const accountId = optionalString(transaction.account_id);
  const name = optionalString(transaction.name);
  const date = optionalString(transaction.date);
  if (
    !transactionId ||
    !accountId ||
    typeof transaction.amount !== "number" ||
    !name ||
    !date
  ) {
    return null;
  }

  const normalized: NormalizedPlaidTransaction = {
    transactionId,
    accountId,
    amount: transaction.amount,
    date,
    name,
    pending: transaction.pending ?? false,
  };
  const isoCurrencyCode = optionalString(transaction.iso_currency_code);
  const authorizedDate = optionalString(transaction.authorized_date);
  const merchantName = optionalString(transaction.merchant_name);
  const pendingTransactionId = optionalString(
    transaction.pending_transaction_id
  );
  const primaryCategory = optionalString(
    transaction.personal_finance_category?.primary
  );
  const detailedCategory = optionalString(
    transaction.personal_finance_category?.detailed
  );
  const legacyCategory =
    Array.isArray(transaction.category) && transaction.category.length > 0
      ? optionalString(transaction.category[0])
      : undefined;

  if (isoCurrencyCode) normalized.isoCurrencyCode = isoCurrencyCode;
  if (authorizedDate) normalized.authorizedDate = authorizedDate;
  if (merchantName) normalized.merchantName = merchantName;
  if (pendingTransactionId) {
    normalized.pendingTransactionId = pendingTransactionId;
  }
  if (primaryCategory ?? legacyCategory) {
    normalized.category = formatPlaidCategory(primaryCategory ?? legacyCategory);
  }
  if (detailedCategory) {
    normalized.categoryDetailed = formatPlaidCategory(detailedCategory);
  }

  return normalized;
}

function normalizeRemovedTransaction(
  transaction: PlaidRemovedTransactionResponse
): NormalizedRemovedTransaction | null {
  const transactionId = optionalString(transaction.transaction_id);
  return transactionId ? { transactionId } : null;
}

function normalizeTransactionsSyncResponse(data: PlaidTransactionsSyncResponse) {
  const accounts = (data.accounts ?? [])
    .map(normalizeAccount)
    .filter((account): account is NormalizedPlaidAccount => account !== null);
  const added = (data.added ?? [])
    .map(normalizeTransaction)
    .filter(
      (transaction): transaction is NormalizedPlaidTransaction =>
        transaction !== null
    );
  const modified = (data.modified ?? [])
    .map(normalizeTransaction)
    .filter(
      (transaction): transaction is NormalizedPlaidTransaction =>
        transaction !== null
    );
  const removed = (data.removed ?? [])
    .map(normalizeRemovedTransaction)
    .filter(
      (transaction): transaction is NormalizedRemovedTransaction =>
        transaction !== null
    );

  return {
    accounts,
    added,
    modified,
    removed,
    nextCursor: optionalString(data.next_cursor),
    hasMore: data.has_more ?? false,
    transactionsUpdateStatus: optionalString(data.transactions_update_status),
  };
}

function addSummaries(total: SyncSummary, page: SyncSummary) {
  total.imported += page.imported;
  total.updated += page.updated;
  total.removed += page.removed;
  total.skipped += page.skipped;
  total.accounts += page.accounts;
}

function emptySummary(): SyncSummary {
  return {
    imported: 0,
    updated: 0,
    removed: 0,
    skipped: 0,
    accounts: 0,
  };
}

async function syncItemWithAccessToken(
  ctx: ActionCtx,
  item: SyncableItem
): Promise<SyncSummary> {
  if (item.status === "disconnected" || item.accessToken.trim() === "") {
    throw new Error("This bank connection is disconnected.");
  }

  let cursor = item.cursor;
  let hasMore = true;
  let pageCount = 0;
  const summary = emptySummary();

  while (hasMore && pageCount < MAX_SYNC_PAGES) {
    const data = await plaidRequest<PlaidTransactionsSyncResponse>(
      "/transactions/sync",
      {
        access_token: item.accessToken,
        cursor,
        count: PLAID_SYNC_PAGE_SIZE,
      }
    );
    const normalized = normalizeTransactionsSyncResponse(data);

    if (!normalized.nextCursor) {
      throw new Error("Plaid did not return a transaction sync cursor.");
    }

    const pageSummary: SyncSummary = await ctx.runMutation(
      internal.plaid.applySyncPage,
      {
        userId: item.userId,
        plaidItemId: item.plaidItemId,
        nextCursor: normalized.nextCursor,
        accounts: normalized.accounts,
        added: normalized.added,
        modified: normalized.modified,
        removed: normalized.removed,
        transactionsUpdateStatus: normalized.transactionsUpdateStatus,
      }
    );
    addSummaries(summary, pageSummary);

    cursor = normalized.nextCursor;
    hasMore = normalized.hasMore;
    pageCount += 1;
  }

  return summary;
}

function getSyncError(error: unknown) {
  if (error instanceof PlaidRequestError) {
    return {
      errorCode: error.code,
      errorMessage: error.message,
    };
  }

  return {
    errorCode: undefined,
    errorMessage: error instanceof Error ? error.message : "Unknown Plaid error",
  };
}

async function markSyncError(
  ctx: ActionCtx,
  item: SyncableItem,
  error: unknown
) {
  const syncError = getSyncError(error);
  await ctx.runMutation(internal.plaid.markItemError, {
    userId: item.userId,
    plaidItemId: item.plaidItemId,
    errorCode: syncError.errorCode,
    errorMessage: syncError.errorMessage,
  });
}

function buildPaymentMethodName(
  account:
    | NormalizedPlaidAccount
    | Pick<Doc<"plaidAccounts">, "name" | "mask">
    | undefined
) {
  if (!account) {
    return "Linked bank account";
  }
  return account.mask ? `${account.name} - ${account.mask}` : account.name;
}

async function loadReferenceMaps(ctx: MutationCtx, userId: string) {
  const categories = await ctx.db
    .query("categories")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(MAX_REFERENCE_ROWS);
  const paymentMethods = await ctx.db
    .query("paymentMethods")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(MAX_REFERENCE_ROWS);

  return {
    categories,
    categoryMap: new Map(
      categories.map((category) => [category.name.toLowerCase(), category._id])
    ),
    paymentMethodMap: new Map(
      paymentMethods.map((method) => [method.name.toLowerCase(), method._id])
    ),
  };
}

async function getOrCreateCategoryId(
  ctx: MutationCtx,
  name: string | undefined,
  userId: string,
  categoryMap: Map<string, Id<"categories">>,
  colorIndex: number
) {
  const trimmedName = name?.trim();
  if (!trimmedName) {
    return { categoryId: undefined, colorIndex };
  }

  const key = trimmedName.toLowerCase();
  const existing = categoryMap.get(key);
  if (existing) {
    return { categoryId: existing, colorIndex };
  }

  const categoryId = await ctx.db.insert("categories", {
    name: trimmedName,
    color: CATEGORY_COLORS[colorIndex % CATEGORY_COLORS.length],
    userId,
  });
  categoryMap.set(key, categoryId);
  return { categoryId, colorIndex: colorIndex + 1 };
}

async function getOrCreatePaymentMethodId(
  ctx: MutationCtx,
  name: string,
  userId: string,
  paymentMethodMap: Map<string, Id<"paymentMethods">>
) {
  const trimmedName = name.trim();
  const key = trimmedName.toLowerCase();
  const existing = paymentMethodMap.get(key);
  if (existing) {
    return existing;
  }

  const paymentMethodId = await ctx.db.insert("paymentMethods", {
    name: trimmedName,
    userId,
  });
  paymentMethodMap.set(key, paymentMethodId);
  return paymentMethodId;
}

async function loadExistingPlaidAccount(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  accountId: string
) {
  return await ctx.db
    .query("plaidAccounts")
    .withIndex("by_userId_and_accountId", (q) =>
      q.eq("userId", userId).eq("accountId", accountId)
    )
    .unique();
}

async function applyTransaction(
  ctx: MutationCtx,
  transaction: NormalizedPlaidTransaction,
  userId: string,
  plaidAccountDocId: Id<"plaidAccounts"> | undefined,
  account:
    | NormalizedPlaidAccount
    | Pick<Doc<"plaidAccounts">, "name" | "mask">
    | undefined,
  referenceMaps: Awaited<ReturnType<typeof loadReferenceMaps>>,
  colorIndex: number
) {
  const existing = await ctx.db
    .query("expenses")
    .withIndex("by_userId_and_plaidTransactionId", (q) =>
      q.eq("userId", userId).eq("plaidTransactionId", transaction.transactionId)
    )
    .unique();

  if (transaction.amount <= 0) {
    if (existing && existing.source === "plaid") {
      await ctx.db.delete(existing._id);
      return { kind: "removed" as const, colorIndex };
    }
    return { kind: "skipped" as const, colorIndex };
  }

  const categoryResult = await getOrCreateCategoryId(
    ctx,
    transaction.category,
    userId,
    referenceMaps.categoryMap,
    colorIndex
  );
  const paymentMethodId = await getOrCreatePaymentMethodId(
    ctx,
    buildPaymentMethodName(account),
    userId,
    referenceMaps.paymentMethodMap
  );

  const expenseFields = {
    title: transaction.merchantName ?? transaction.name,
    amount: transaction.amount,
    date: transaction.date,
    categoryId: categoryResult.categoryId,
    paymentMethodId,
    vendor: transaction.merchantName ?? transaction.name,
    source: "plaid" as const,
    plaidTransactionId: transaction.transactionId,
    plaidAccountId: plaidAccountDocId,
    plaidPendingTransactionId: transaction.pendingTransactionId,
    plaidCategory: transaction.categoryDetailed ?? transaction.category,
    pending: transaction.pending,
    userId,
  };

  if (existing) {
    await ctx.db.patch(existing._id, expenseFields);
    return { kind: "updated" as const, colorIndex: categoryResult.colorIndex };
  }

  await ctx.db.insert("expenses", expenseFields);
  return { kind: "imported" as const, colorIndex: categoryResult.colorIndex };
}

export const createLinkToken = action({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const config = getPlaidConfig();
    const payload: Record<string, unknown> = {
      client_name: config.clientName,
      language: config.language,
      country_codes: config.countryCodes,
      products: config.products,
      user: {
        client_user_id: userId,
      },
    };

    if (config.products.includes("transactions")) {
      payload.transactions = {
        days_requested: config.daysRequested,
      };
    }
    if (config.linkCustomizationName) {
      payload.link_customization_name = config.linkCustomizationName;
    }
    if (config.webhookUrl) {
      payload.webhook = config.webhookUrl;
    }

    const data = await plaidRequest<PlaidLinkTokenResponse>(
      "/link/token/create",
      payload
    );
    if (!data.link_token) {
      throw new Error("Plaid did not return a Link token.");
    }

    return {
      linkToken: data.link_token,
      expiration: data.expiration ?? null,
      requestId: data.request_id ?? null,
    };
  },
});

export const exchangePublicToken = action({
  args: {
    publicToken: v.string(),
    metadata: v.optional(plaidMetadataValidator),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const exchange = await plaidRequest<PlaidExchangeResponse>(
      "/item/public_token/exchange",
      {
        public_token: args.publicToken,
      }
    );
    if (!exchange.access_token || !exchange.item_id) {
      throw new Error("Plaid did not return an access token.");
    }

    const encryptedAccessToken = await encryptPlaidAccessToken(
      exchange.access_token
    );
    const upsertResult: { plaidItemId: Id<"plaidItems">; cursor?: string } =
      await ctx.runMutation(internal.plaid.upsertItem, {
        userId,
        itemId: exchange.item_id,
        ...encryptedAccessToken,
        institutionId: args.metadata?.institution?.institution_id,
        institutionName: args.metadata?.institution?.name,
      });

    const item: SyncableItem = {
      plaidItemId: upsertResult.plaidItemId,
      userId,
      accessToken: exchange.access_token,
      cursor: upsertResult.cursor,
      status: "active",
    };

    try {
      const syncSummary = await syncItemWithAccessToken(ctx, item);
      return {
        plaidItemId: upsertResult.plaidItemId,
        ...syncSummary,
      };
    } catch (error) {
      await markSyncError(ctx, item, error);
      throw error;
    }
  },
});

export const syncItem = action({
  args: { plaidItemId: v.id("plaidItems") },
  handler: async (ctx, args): Promise<SyncSummary> => {
    const userId = await requireUserId(ctx);
    const storedItem: StoredPlaidItem | null = await ctx.runQuery(
      internal.plaid.getSyncableItem,
      { userId, plaidItemId: args.plaidItemId }
    );
    if (!storedItem) {
      throw new Error("Bank connection not found.");
    }

    const accessToken = await getStoredPlaidAccessToken(storedItem);
    await upgradeLegacyStoredAccessToken(ctx, storedItem, accessToken);
    const item: SyncableItem = {
      plaidItemId: storedItem.plaidItemId,
      userId: storedItem.userId,
      accessToken,
      cursor: storedItem.cursor,
      status: storedItem.status,
    };

    try {
      return await syncItemWithAccessToken(ctx, item);
    } catch (error) {
      await markSyncError(ctx, item, error);
      throw error;
    }
  },
});

export const disconnectItem = action({
  args: {
    plaidItemId: v.id("plaidItems"),
    deleteTransactions: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<DisconnectSummary> => {
    const userId = await requireUserId(ctx);
    const storedItem: StoredPlaidItem | null = await ctx.runQuery(
      internal.plaid.getItemForOwner,
      { userId, plaidItemId: args.plaidItemId }
    );
    if (!storedItem) {
      throw new Error("Bank connection not found.");
    }

    const accessToken =
      storedItem.status === "disconnected"
        ? ""
        : await getStoredPlaidAccessToken(storedItem);
    if (accessToken.trim() !== "") {
      await upgradeLegacyStoredAccessToken(ctx, storedItem, accessToken);
    }
    const item: SyncableItem = {
      plaidItemId: storedItem.plaidItemId,
      userId: storedItem.userId,
      accessToken,
      cursor: storedItem.cursor,
      status: storedItem.status,
    };

    if (item.status !== "disconnected" && item.accessToken.trim() !== "") {
      try {
        await plaidRequest("/item/remove", {
          access_token: item.accessToken,
          reason_code: "OTHER",
          reason_note: "User disconnected in Extracker",
        });
      } catch (error) {
        if (
          !(error instanceof PlaidRequestError) ||
          error.code !== "ITEM_NOT_FOUND"
        ) {
          await markSyncError(ctx, item, error);
          throw error;
        }
      }
    }

    let deletedExpenses = 0;
    if (args.deleteTransactions === true) {
      let done = false;
      while (!done) {
        const result: { done: boolean; deletedExpenses: number } =
          await ctx.runMutation(internal.plaid.deletePlaidItemExpensesBatch, {
            userId,
            plaidItemId: args.plaidItemId,
          });
        deletedExpenses += result.deletedExpenses;
        done = result.done;
      }
    }

    await ctx.runMutation(internal.plaid.markItemDisconnected, {
      userId,
      plaidItemId: args.plaidItemId,
    });

    return { disconnected: true, deletedExpenses };
  },
});

export const disconnectAllItems = action({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const items: StoredPlaidItem[] = await ctx.runQuery(
      internal.plaid.listDisconnectableItemsForUser,
      { userId }
    );

    let disconnected = 0;
    const failures: string[] = [];
    for (const storedItem of items) {
      try {
        const accessToken = await getStoredPlaidAccessToken(storedItem);
        await upgradeLegacyStoredAccessToken(ctx, storedItem, accessToken);
        const item: SyncableItem = {
          plaidItemId: storedItem.plaidItemId,
          userId: storedItem.userId,
          accessToken,
          cursor: storedItem.cursor,
          status: storedItem.status,
        };

        if (item.accessToken.trim() !== "") {
          try {
            await plaidRequest("/item/remove", {
              access_token: item.accessToken,
              reason_code: "OTHER",
              reason_note: "User deleted Extracker data",
            });
          } catch (error) {
            if (
              !(error instanceof PlaidRequestError) ||
              error.code !== "ITEM_NOT_FOUND"
            ) {
              throw error;
            }
          }
        }
        await ctx.runMutation(internal.plaid.markItemDisconnected, {
          userId,
          plaidItemId: item.plaidItemId,
        });
        disconnected += 1;
      } catch (error) {
        const syncError = getSyncError(error);
        failures.push(syncError.errorMessage);
        await ctx.runMutation(internal.plaid.markItemError, {
          userId: storedItem.userId,
          plaidItemId: storedItem.plaidItemId,
          errorCode: syncError.errorCode,
          errorMessage: syncError.errorMessage,
        });
      }
    }

    return {
      disconnected,
      failed: failures.length,
      failures,
    };
  },
});

export const syncAllConnectedItems = internalAction({
  args: {},
  handler: async (ctx) => {
    const items: StoredPlaidItem[] = await ctx.runQuery(
      internal.plaid.listSyncableItems,
      {}
    );
    const total = emptySummary();
    let failed = 0;

    for (const storedItem of items) {
      try {
        const accessToken = await getStoredPlaidAccessToken(storedItem);
        await upgradeLegacyStoredAccessToken(ctx, storedItem, accessToken);
        const item: SyncableItem = {
          plaidItemId: storedItem.plaidItemId,
          userId: storedItem.userId,
          accessToken,
          cursor: storedItem.cursor,
          status: storedItem.status,
        };
        const itemSummary = await syncItemWithAccessToken(ctx, item);
        addSummaries(total, itemSummary);
      } catch (error) {
        failed += 1;
        await ctx.runMutation(internal.plaid.markItemError, {
          userId: storedItem.userId,
          plaidItemId: storedItem.plaidItemId,
          ...getSyncError(error),
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
    const activeItems = await ctx.db
      .query("plaidItems")
      .withIndex("by_userId_and_status", (q) =>
        q.eq("userId", userId).eq("status", "active")
      )
      .order("desc")
      .take(MAX_CONNECTIONS);
    const errorItems = await ctx.db
      .query("plaidItems")
      .withIndex("by_userId_and_status", (q) =>
        q.eq("userId", userId).eq("status", "error")
      )
      .order("desc")
      .take(MAX_CONNECTIONS);
    const items = [...activeItems, ...errorItems]
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, MAX_CONNECTIONS);

    const connections = [];
    for (const item of items) {
      const accounts = await ctx.db
        .query("plaidAccounts")
        .withIndex("by_userId_and_plaidItemId", (q) =>
          q.eq("userId", userId).eq("plaidItemId", item._id)
        )
        .take(MAX_ACCOUNTS_PER_ITEM);

      connections.push({
        _id: item._id,
        _creationTime: item._creationTime,
        itemId: item.itemId,
        institutionId: item.institutionId ?? null,
        institutionName: item.institutionName ?? "Connected institution",
        status: item.status,
        errorCode: item.errorCode ?? null,
        errorMessage: item.errorMessage ?? null,
        lastSyncedAt: item.lastSyncedAt ?? null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        accountCount: accounts.length,
        accounts: accounts.map((account) => ({
          _id: account._id,
          accountId: account.accountId,
          name: account.name,
          officialName: account.officialName ?? null,
          mask: account.mask ?? null,
          type: account.type,
          subtype: account.subtype ?? null,
          availableBalance: account.availableBalance ?? null,
          currentBalance: account.currentBalance ?? null,
          isoCurrencyCode: account.isoCurrencyCode ?? null,
          isActive: account.isActive,
          lastSyncedAt: account.lastSyncedAt ?? null,
        })),
      });
    }

    return connections;
  },
});

export const upsertItem = internalMutation({
  args: {
    userId: v.string(),
    itemId: v.string(),
    accessTokenCiphertext: v.string(),
    accessTokenNonce: v.string(),
    institutionId: v.optional(v.string()),
    institutionName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("plaidItems")
      .withIndex("by_userId_and_itemId", (q) =>
        q.eq("userId", args.userId).eq("itemId", args.itemId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        accessToken: undefined,
        accessTokenCiphertext: args.accessTokenCiphertext,
        accessTokenNonce: args.accessTokenNonce,
        institutionId: args.institutionId,
        institutionName: args.institutionName,
        status: "active" as const,
        updatedAt: now,
      });
      return {
        plaidItemId: existing._id,
        cursor: existing.cursor,
      };
    }

    const plaidItemId = await ctx.db.insert("plaidItems", {
      userId: args.userId,
      itemId: args.itemId,
      accessTokenCiphertext: args.accessTokenCiphertext,
      accessTokenNonce: args.accessTokenNonce,
      institutionId: args.institutionId,
      institutionName: args.institutionName,
      status: "active" as const,
      createdAt: now,
      updatedAt: now,
    });

    return { plaidItemId };
  },
});

export const storeEncryptedItemAccessToken = internalMutation({
  args: {
    userId: v.string(),
    plaidItemId: v.id("plaidItems"),
    accessTokenCiphertext: v.string(),
    accessTokenNonce: v.string(),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.plaidItemId);
    assertOwner(item, args.userId, "Bank connection not found");
    await ctx.db.patch(args.plaidItemId, {
      accessToken: undefined,
      accessTokenCiphertext: args.accessTokenCiphertext,
      accessTokenNonce: args.accessTokenNonce,
      updatedAt: Date.now(),
    });
  },
});

export const getSyncableItem = internalQuery({
  args: {
    userId: v.string(),
    plaidItemId: v.id("plaidItems"),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.plaidItemId);
    assertOwner(item, args.userId, "Bank connection not found");
    if (item.status === "disconnected") {
      return null;
    }

    return {
      plaidItemId: item._id,
      userId: item.userId,
      accessToken: item.accessToken,
      accessTokenCiphertext: item.accessTokenCiphertext,
      accessTokenNonce: item.accessTokenNonce,
      cursor: item.cursor,
      status: item.status,
    };
  },
});

export const getItemForOwner = internalQuery({
  args: {
    userId: v.string(),
    plaidItemId: v.id("plaidItems"),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.plaidItemId);
    assertOwner(item, args.userId, "Bank connection not found");

    return {
      plaidItemId: item._id,
      userId: item.userId,
      accessToken: item.accessToken,
      accessTokenCiphertext: item.accessTokenCiphertext,
      accessTokenNonce: item.accessTokenNonce,
      cursor: item.cursor,
      status: item.status,
    };
  },
});

export const listSyncableItems = internalQuery({
  args: {},
  handler: async (ctx) => {
    const activeItems = await ctx.db
      .query("plaidItems")
      .withIndex("by_status_and_lastSyncedAt", (q) =>
        q.eq("status", "active")
      )
      .order("asc")
      .take(MAX_SYNC_ITEMS_PER_CRON);
    const remaining = MAX_SYNC_ITEMS_PER_CRON - activeItems.length;
    const errorItems =
      remaining > 0
        ? await ctx.db
            .query("plaidItems")
            .withIndex("by_status_and_lastSyncedAt", (q) =>
              q.eq("status", "error")
            )
            .order("asc")
            .take(remaining)
        : [];

    return [...activeItems, ...errorItems].map((item) => ({
      plaidItemId: item._id,
      userId: item.userId,
      accessToken: item.accessToken,
      accessTokenCiphertext: item.accessTokenCiphertext,
      accessTokenNonce: item.accessTokenNonce,
      cursor: item.cursor,
      status: item.status,
    }));
  },
});

export const listDisconnectableItemsForUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("plaidItems")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .take(MAX_CONNECTIONS);

    return items
      .filter((item) => item.status !== "disconnected")
      .map((item) => ({
        plaidItemId: item._id,
        userId: item.userId,
        accessToken: item.accessToken,
        accessTokenCiphertext: item.accessTokenCiphertext,
        accessTokenNonce: item.accessTokenNonce,
        cursor: item.cursor,
        status: item.status,
      }));
  },
});

export const applySyncPage = internalMutation({
  args: {
    userId: v.string(),
    plaidItemId: v.id("plaidItems"),
    nextCursor: v.string(),
    accounts: v.array(plaidAccountValidator),
    added: v.array(plaidTransactionValidator),
    modified: v.array(plaidTransactionValidator),
    removed: v.array(removedTransactionValidator),
    transactionsUpdateStatus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.plaidItemId);
    assertOwner(item, args.userId, "Bank connection not found");
    if (item.status === "disconnected") {
      return emptySummary();
    }

    const now = Date.now();
    const accountMap = new Map<string, Id<"plaidAccounts">>();
    const normalizedAccountMap = new Map<string, NormalizedPlaidAccount>();

    for (const account of args.accounts) {
      normalizedAccountMap.set(account.accountId, account);
      const existing = await loadExistingPlaidAccount(
        ctx,
        args.userId,
        account.accountId
      );

      if (existing) {
        await ctx.db.patch(existing._id, {
          plaidItemId: args.plaidItemId,
          name: account.name,
          officialName: account.officialName,
          mask: account.mask,
          type: account.type,
          subtype: account.subtype,
          availableBalance: account.availableBalance,
          currentBalance: account.currentBalance,
          isoCurrencyCode: account.isoCurrencyCode,
          isActive: true,
          lastSyncedAt: now,
        });
        accountMap.set(account.accountId, existing._id);
      } else {
        const plaidAccountId = await ctx.db.insert("plaidAccounts", {
          userId: args.userId,
          plaidItemId: args.plaidItemId,
          accountId: account.accountId,
          name: account.name,
          officialName: account.officialName,
          mask: account.mask,
          type: account.type,
          subtype: account.subtype,
          availableBalance: account.availableBalance,
          currentBalance: account.currentBalance,
          isoCurrencyCode: account.isoCurrencyCode,
          isActive: true,
          lastSyncedAt: now,
        });
        accountMap.set(account.accountId, plaidAccountId);
      }
    }

    const referenceMaps = await loadReferenceMaps(ctx, args.userId);
    let colorIndex = referenceMaps.categories.length;
    const summary = emptySummary();

    for (const transaction of args.removed) {
      const existing = await ctx.db
        .query("expenses")
        .withIndex("by_userId_and_plaidTransactionId", (q) =>
          q
            .eq("userId", args.userId)
            .eq("plaidTransactionId", transaction.transactionId)
        )
        .unique();

      if (existing && existing.source === "plaid") {
        await ctx.db.delete(existing._id);
        summary.removed += 1;
      }
    }

    for (const transaction of [...args.added, ...args.modified]) {
      let plaidAccountDocId = accountMap.get(transaction.accountId);
      let account:
        | NormalizedPlaidAccount
        | Pick<Doc<"plaidAccounts">, "name" | "mask">
        | undefined = normalizedAccountMap.get(transaction.accountId);

      if (!plaidAccountDocId) {
        const existingAccount = await loadExistingPlaidAccount(
          ctx,
          args.userId,
          transaction.accountId
        );
        if (existingAccount) {
          plaidAccountDocId = existingAccount._id;
          account = {
            name: existingAccount.name,
            mask: existingAccount.mask,
          };
          accountMap.set(transaction.accountId, existingAccount._id);
        }
      }

      const result = await applyTransaction(
        ctx,
        transaction,
        args.userId,
        plaidAccountDocId,
        account,
        referenceMaps,
        colorIndex
      );
      colorIndex = result.colorIndex;

      switch (result.kind) {
        case "imported":
          summary.imported += 1;
          break;
        case "updated":
          summary.updated += 1;
          break;
        case "removed":
          summary.removed += 1;
          break;
        case "skipped":
          summary.skipped += 1;
          break;
      }
    }

    await ctx.db.patch(args.plaidItemId, {
      cursor: args.nextCursor,
      status: "active" as const,
      lastSyncedAt: now,
      updatedAt: now,
    });

    summary.accounts = args.accounts.length;
    return summary;
  },
});

export const markItemError = internalMutation({
  args: {
    userId: v.string(),
    plaidItemId: v.id("plaidItems"),
    errorCode: v.optional(v.string()),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.plaidItemId);
    assertOwner(item, args.userId, "Bank connection not found");
    if (item.status === "disconnected") {
      return;
    }

    await ctx.db.patch(args.plaidItemId, {
      status: "error" as const,
      errorCode: args.errorCode,
      errorMessage: args.errorMessage,
      updatedAt: Date.now(),
    });
  },
});

export const markItemDisconnected = internalMutation({
  args: {
    userId: v.string(),
    plaidItemId: v.id("plaidItems"),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.plaidItemId);
    assertOwner(item, args.userId, "Bank connection not found");
    await ctx.db.patch(args.plaidItemId, {
      accessToken: undefined,
      accessTokenCiphertext: undefined,
      accessTokenNonce: undefined,
      status: "disconnected" as const,
      updatedAt: Date.now(),
    });

    const accounts = await ctx.db
      .query("plaidAccounts")
      .withIndex("by_userId_and_plaidItemId", (q) =>
        q.eq("userId", args.userId).eq("plaidItemId", args.plaidItemId)
      )
      .take(MAX_ACCOUNTS_PER_ITEM);
    for (const account of accounts) {
      await ctx.db.patch(account._id, { isActive: false });
    }
  },
});

export const deletePlaidItemExpensesBatch = internalMutation({
  args: {
    userId: v.string(),
    plaidItemId: v.id("plaidItems"),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.plaidItemId);
    assertOwner(item, args.userId, "Bank connection not found");

    const accounts = await ctx.db
      .query("plaidAccounts")
      .withIndex("by_userId_and_plaidItemId", (q) =>
        q.eq("userId", args.userId).eq("plaidItemId", args.plaidItemId)
      )
      .take(MAX_ACCOUNTS_PER_ITEM);

    let deletedExpenses = 0;
    for (const account of accounts) {
      const remaining = DELETE_PLAID_ITEM_EXPENSE_BATCH_SIZE - deletedExpenses;
      if (remaining <= 0) {
        break;
      }

      const expenses = await ctx.db
        .query("expenses")
        .withIndex("by_userId_and_plaidAccountId", (q) =>
          q.eq("userId", args.userId).eq("plaidAccountId", account._id)
        )
        .take(remaining);

      for (const expense of expenses) {
        await ctx.db.delete(expense._id);
        deletedExpenses += 1;
      }
    }

    return {
      done: deletedExpenses < DELETE_PLAID_ITEM_EXPENSE_BATCH_SIZE,
      deletedExpenses,
    };
  },
});
