export interface RevenueFieldMapping {
  title: string | null;
  amount: string | null;
  date: string | null;
  provider: string | null;
  customer: string | null;
  fee: string | null;
  currency: string | null;
  transactionId: string | null;
  notes: string | null;
}

export type ValidatedRevenueRowStatus = "valid" | "skipped" | "error";

export interface ValidatedRevenueRow {
  status: ValidatedRevenueRowStatus;
  valid: boolean;
  title: string;
  amount: number;
  date: string;
  provider: string;
  customer?: string;
  fee?: number;
  netAmount: number;
  currency?: string;
  transactionId?: string;
  notes?: string;
  error?: string;
  skipReason?: string;
  rowIndex: number;
}

const HEADER_PATTERNS: Record<keyof RevenueFieldMapping, RegExp[]> = {
  title: [
    /^description$/i,
    /^statement descriptor$/i,
    /^product$/i,
    /^item$/i,
    /^plan$/i,
    /^customer description$/i,
  ],
  amount: [
    /^revenue$/i,
    /^amount$/i,
    /^converted amount$/i,
    /^gross$/i,
    /^gross amount$/i,
    /^subtotal$/i,
  ],
  date: [
    /^report date$/i,
    /^date$/i,
    /^created date/i,
    /^transaction date$/i,
    /^paid at$/i,
    /^timestamp$/i,
  ],
  provider: [/^provider$/i, /^platform$/i, /^source$/i, /^store$/i],
  customer: [
    /^customer email$/i,
    /^customer description$/i,
    /^customer id$/i,
    /^email$/i,
    /^user$/i,
    /^subscriber$/i,
  ],
  fee: [/^fee$/i, /^processor fee$/i, /^application fee$/i],
  currency: [/^currency$/i, /^converted currency$/i],
  transactionId: [
    /^id$/i,
    /^transaction id$/i,
    /^charge id$/i,
    /^invoice id$/i,
    /^payment id$/i,
  ],
  notes: [
    /^seller message$/i,
    /^notes?$/i,
    /^memo$/i,
    /^comment$/i,
    /^status$/i,
  ],
};

const STATUS_HEADER_PATTERNS = [/^status$/i, /^captured$/i, /^paid$/i];
const REFUND_HEADER_PATTERNS = [
  /^amount refunded$/i,
  /^refunded amount$/i,
  /^converted amount refunded$/i,
];
const DESCRIPTION_FALLBACK_PATTERNS = [
  /^description$/i,
  /^statement descriptor$/i,
  /^seller message$/i,
];

const SKIP_STATUS_PATTERNS = [
  /\bfailed\b/i,
  /\bpending\b/i,
  /\bcancel(?:led)?\b/i,
  /\bdeclined\b/i,
  /\bunpaid\b/i,
  /\brefunded\b/i,
  /\bdisputed\b/i,
  /\bchargeback\b/i,
  /\bvoid(?:ed)?\b/i,
];

export function detectRevenueProvider(
  fileName: string,
  headers: string[],
): string {
  const normalizedFileName = fileName.toLowerCase();
  const normalizedHeaders = headers.map((header) => header.toLowerCase());
  const headerText = normalizedHeaders.join(" ");

  if (
    normalizedFileName.includes("revenuecat") ||
    normalizedFileName.startsWith("rc-") ||
    (normalizedHeaders.includes("report date") &&
      normalizedHeaders.includes("revenue") &&
      normalizedHeaders.includes("transactions"))
  ) {
    return "RevenueCat";
  }

  if (
    normalizedFileName.includes("paypal") ||
    headerText.includes("paypal fee") ||
    headerText.includes("paypal")
  ) {
    return "PayPal";
  }

  if (
    normalizedFileName.includes("lemonsqueezy") ||
    normalizedFileName.includes("lemon squeezy")
  ) {
    return "Lemon Squeezy";
  }

  if (
    normalizedFileName.includes("stripe") ||
    normalizedFileName.includes("unified_payments") ||
    (normalizedHeaders.includes("customer id") &&
      normalizedHeaders.includes("statement descriptor") &&
      normalizedHeaders.includes("fee"))
  ) {
    return "Stripe";
  }

  return "Imported revenue";
}

export function autoMapRevenueHeaders(headers: string[]): RevenueFieldMapping {
  const mapping: RevenueFieldMapping = {
    title: null,
    amount: null,
    date: null,
    provider: null,
    customer: null,
    fee: null,
    currency: null,
    transactionId: null,
    notes: null,
  };

  const normalized = headers.map((header) =>
    header.trim().toLowerCase().replace(/[_\s]+/g, " "),
  );

  for (const [field, patterns] of Object.entries(HEADER_PATTERNS) as [
    keyof RevenueFieldMapping,
    RegExp[],
  ][]) {
    for (let i = 0; i < normalized.length; i++) {
      if (
        patterns.some(
          (pattern) =>
            pattern.test(normalized[i]) ||
            pattern.test(normalized[i].replace(/\s/g, "")),
        )
      ) {
        if (!mapping[field]) {
          mapping[field] = headers[i];
        }
      }
    }
  }

  return mapping;
}

function getValuesByPatterns(
  row: string[],
  headers: string[],
  patterns: RegExp[],
) {
  const values: string[] = [];

  for (let i = 0; i < headers.length; i++) {
    if (!patterns.some((pattern) => pattern.test(headers[i]))) {
      continue;
    }

    const value = row[i]?.trim();
    if (value) {
      values.push(value);
    }
  }

  return values;
}

function parseAmountValue(raw: string): number | null {
  if (!raw) return null;

  const cleaned = raw.replace(/[^0-9.\-\(\)]/g, "");
  const isNegative = cleaned.startsWith("(") && cleaned.endsWith(")");
  const numeric = cleaned.replace(/[()]/g, "");
  const parsed = parseFloat(numeric);

  if (Number.isNaN(parsed)) {
    return null;
  }

  return isNegative ? -parsed : parsed;
}

function parseDateValue(raw: string): string | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  const isoDatePrefix = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDatePrefix) {
    return `${isoDatePrefix[1]}-${isoDatePrefix[2]}-${isoDatePrefix[3]}`;
  }

  const slashDate = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashDate) {
    const [, month, day, year] = slashDate;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  try {
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  } catch {
    // ignore invalid dates
  }

  return null;
}

function getMappedValue(
  row: string[],
  headers: string[],
  header: string | null,
) {
  if (!header) return "";
  const index = headers.indexOf(header);
  return index >= 0 ? (row[index] || "").trim() : "";
}

function getFallbackValue(
  row: string[],
  headers: string[],
  patterns: RegExp[],
) {
  return getValuesByPatterns(row, headers, patterns)[0] ?? "";
}

export function validateRevenueRow(
  row: string[],
  headers: string[],
  mapping: RevenueFieldMapping,
  rowIndex: number,
  fallbackProvider: string,
): ValidatedRevenueRow {
  const title = getMappedValue(row, headers, mapping.title);
  const rawAmount = getMappedValue(row, headers, mapping.amount);
  const rawDate = getMappedValue(row, headers, mapping.date);
  const providerFromColumn = getMappedValue(row, headers, mapping.provider);
  const customer = getMappedValue(row, headers, mapping.customer);
  const rawFee = getMappedValue(row, headers, mapping.fee);
  const currency = getMappedValue(row, headers, mapping.currency);
  const transactionId = getMappedValue(row, headers, mapping.transactionId);
  const notes = getMappedValue(row, headers, mapping.notes);

  const provider = providerFromColumn || fallbackProvider;
  const statusValues = getValuesByPatterns(
    row,
    headers,
    STATUS_HEADER_PATTERNS,
  );
  const refundValues = getValuesByPatterns(
    row,
    headers,
    REFUND_HEADER_PATTERNS,
  );

  const buildError = (
    reason: string,
    partial?: Partial<ValidatedRevenueRow>,
  ): ValidatedRevenueRow => ({
    status: "error",
    valid: false,
    title: title || provider || "Revenue entry",
    amount: 0,
    date: "",
    provider: provider || fallbackProvider,
    netAmount: 0,
    rowIndex,
    error: reason,
    ...partial,
  });

  const amount = parseAmountValue(rawAmount);
  if (amount === null) {
    return buildError(`Invalid amount: "${rawAmount}"`);
  }

  const date = parseDateValue(rawDate);
  if (!date) {
    return buildError(`Invalid date: "${rawDate}"`, {
      amount: Math.abs(amount),
    });
  }

  const fee = parseAmountValue(rawFee);
  const refundAmount =
    parseAmountValue(refundValues.find(Boolean) ?? "") ?? 0;

  const blockedStatus = statusValues.find((value) =>
    SKIP_STATUS_PATTERNS.some((pattern) => pattern.test(value)),
  );
  if (blockedStatus) {
    return {
      status: "skipped",
      valid: false,
      title: title || provider || "Revenue entry",
      amount: Math.abs(amount),
      date,
      provider,
      customer: customer || undefined,
      fee: fee !== null ? Math.abs(fee) : undefined,
      netAmount: Math.max(Math.abs(amount) - Math.abs(fee ?? 0), 0),
      currency: currency || undefined,
      transactionId: transactionId || undefined,
      notes: notes || undefined,
      skipReason: `Skipped transaction with status "${blockedStatus}"`,
      rowIndex,
    };
  }

  if (refundAmount >= Math.abs(amount) && refundAmount > 0) {
    return {
      status: "skipped",
      valid: false,
      title: title || provider || "Revenue entry",
      amount: Math.abs(amount),
      date,
      provider,
      customer: customer || undefined,
      fee: fee !== null ? Math.abs(fee) : undefined,
      netAmount: Math.max(Math.abs(amount) - Math.abs(fee ?? 0), 0),
      currency: currency || undefined,
      transactionId: transactionId || undefined,
      notes: notes || undefined,
      skipReason: "Skipped fully refunded transaction",
      rowIndex,
    };
  }

  if (Math.abs(amount) === 0) {
    return {
      status: "skipped",
      valid: false,
      title: title || provider || "Revenue entry",
      amount: 0,
      date,
      provider,
      customer: customer || undefined,
      fee: fee !== null ? Math.abs(fee) : undefined,
      netAmount: 0,
      currency: currency || undefined,
      transactionId: transactionId || undefined,
      notes: notes || undefined,
      skipReason: "Skipped zero-value revenue row",
      rowIndex,
    };
  }

  const fallbackTitle =
    title ||
    getFallbackValue(row, headers, DESCRIPTION_FALLBACK_PATTERNS) ||
    `${provider} revenue`;
  const normalizedAmount = Math.abs(amount);
  const normalizedFee = fee === null ? undefined : Math.abs(fee);
  const netAmount = Math.max(normalizedAmount - (normalizedFee ?? 0), 0);

  return {
    status: "valid",
    valid: true,
    title: fallbackTitle,
    amount: normalizedAmount,
    date,
    provider,
    customer: customer || undefined,
    fee: normalizedFee,
    netAmount,
    currency: currency ? currency.toUpperCase() : undefined,
    transactionId: transactionId || undefined,
    notes: notes || undefined,
    rowIndex,
  };
}
