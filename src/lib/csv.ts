import Papa from "papaparse";

export interface ParsedCSV {
  headers: string[];
  rows: string[][];
  rawText: string;
}

export function parseCSVFile(file: File): Promise<ParsedCSV> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const rawText = e.target?.result as string;
      if (!rawText) {
        reject(new Error("Failed to read file"));
        return;
      }

      const result = Papa.parse(rawText, {
        skipEmptyLines: true,
      });

      if (result.errors.length > 0 && result.data.length === 0) {
        reject(new Error(`CSV parse error: ${result.errors[0].message}`));
        return;
      }

      const data = result.data as string[][];
      if (data.length < 2) {
        reject(new Error("CSV must have at least a header row and one data row"));
        return;
      }

      resolve({
        headers: data[0].map((h) => h.trim()),
        rows: data.slice(1).filter((row) => row.some((cell) => cell.trim() !== "")),
        rawText,
      });
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

export interface FieldMapping {
  title: string | null;
  amount: string | null;
  date: string | null;
  category: string | null;
  vendor: string | null;
  paymentMethod: string | null;
  notes: string | null;
}

// Deterministic header matching — no AI needed for obvious cases
const HEADER_PATTERNS: Record<keyof FieldMapping, RegExp[]> = {
  title: [/^(title|name|description|item|expense|memo|narration)$/i],
  amount: [/^(amount|total|sum|price|cost|value|debit|credit|charge)$/i],
  date: [/^(date|transaction.?date|posted.?date|txn.?date|payment.?date)$/i],
  category: [/^(category|type|group|classification|expense.?type)$/i],
  vendor: [/^(vendor|merchant|payee|store|company|seller|source|from)$/i],
  paymentMethod: [/^(payment.?method|payment.?type|card|account|method|paid.?with)$/i],
  notes: [/^(notes?|comment|memo|remark|detail|reference)$/i],
};

export function autoMapHeaders(headers: string[]): FieldMapping {
  const mapping: FieldMapping = {
    title: null,
    amount: null,
    date: null,
    category: null,
    vendor: null,
    paymentMethod: null,
    notes: null,
  };

  const normalized = headers.map((h) => h.trim().toLowerCase().replace(/[_\s]+/g, " "));

  for (const [field, patterns] of Object.entries(HEADER_PATTERNS) as [keyof FieldMapping, RegExp[]][]) {
    for (let i = 0; i < normalized.length; i++) {
      if (patterns.some((p) => p.test(normalized[i].replace(/\s/g, "")) || p.test(normalized[i]))) {
        if (!mapping[field]) {
          mapping[field] = headers[i];
        }
      }
    }
  }

  return mapping;
}

export type ValidatedRowStatus = "valid" | "skipped" | "error";

export interface ValidatedRow {
  status: ValidatedRowStatus;
  valid: boolean;
  title: string;
  amount: number;
  date: string;
  category?: string;
  vendor?: string;
  paymentMethod?: string;
  notes?: string;
  error?: string;
  skipReason?: string;
  rowIndex: number;
}

const STATUS_HEADER_PATTERNS = [/^status$/i, /transaction.?status/i];
const CATEGORY_HEADER_PATTERNS = [/^category$/i, /mercury category/i, /expense.?type/i];
const DESCRIPTION_HEADER_PATTERNS = [
  /description/i,
  /^title$/i,
  /^name$/i,
  /merchant/i,
  /vendor/i,
  /bank description/i,
  /memo/i,
  /note/i,
  /reference/i,
];
const ACCOUNT_HEADER_PATTERNS = [/account/i, /card/i];
const BANK_STATEMENT_HEADER_PATTERNS = [
  /^status$/i,
  /source account/i,
  /bank description/i,
  /original currency/i,
  /last four digits/i,
  /name on card/i,
  /timestamp/i,
];
const SKIP_STATUS_PATTERNS = [
  /\bfailed\b/i,
  /\bpending\b/i,
  /\bcancel(?:led)?\b/i,
  /\bdeclined\b/i,
  /\breversed\b/i,
  /\bvoid(?:ed)?\b/i,
];
const TRANSFER_PATTERNS = [
  /\btransfer\b/i,
  /\bown account\b/i,
  /\bbetween your\b/i,
  /\banother bank account\b/i,
  /\bto mercury\b/i,
  /\bfrom mercury\b/i,
  /\bmercury accounts?\b/i,
];
const INCOMING_MARKERS = [
  /\brevenue\b/i,
  /\bincome\b/i,
  /\bdeposit\b/i,
  /\bpayout\b/i,
  /\breimbursement\b/i,
  /\brefund\b/i,
  /\bpayment received\b/i,
  /\binterest\b/i,
];

function getRowValuesByHeaderPatterns(
  row: string[],
  headers: string[],
  patterns: RegExp[],
): string[] {
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

function hasHeaderMatch(headers: string[], patterns: RegExp[]): boolean {
  return headers.some((header) =>
    patterns.some((pattern) => pattern.test(header)),
  );
}

export function validateRow(
  row: string[],
  headers: string[],
  mapping: FieldMapping,
  rowIndex: number
): ValidatedRow {
  const get = (header: string | null): string => {
    if (!header) return "";
    const idx = headers.indexOf(header);
    return idx >= 0 ? (row[idx] || "").trim() : "";
  };

  const title = get(mapping.title);
  const rawAmount = get(mapping.amount);
  const rawDate = get(mapping.date);
  const category = get(mapping.category);
  const vendor = get(mapping.vendor);
  const paymentMethod = get(mapping.paymentMethod);
  const notes = get(mapping.notes);

  const buildErrorRow = (
    reason: string,
    partial?: Partial<ValidatedRow>,
  ): ValidatedRow => ({
    status: "error",
    valid: false,
    title: title || vendor || "Unknown",
    amount: 0,
    date: "",
    error: reason,
    rowIndex,
    ...partial,
  });

  const buildSkippedRow = (reason: string): ValidatedRow => ({
    status: "skipped",
    valid: false,
    title: title || vendor || "Unknown",
    amount: Math.abs(amount ?? 0),
    date: date ?? "",
    category: category || undefined,
    vendor: vendor || undefined,
    paymentMethod: paymentMethod || undefined,
    notes: notes || undefined,
    skipReason: reason,
    rowIndex,
  });

  // Parse amount
  const amount = parseAmountValue(rawAmount);
  if (amount === null) {
    return buildErrorRow(`Invalid amount: "${rawAmount}"`);
  }

  // Parse date
  const date = parseDateValue(rawDate);
  if (!date) {
    return buildErrorRow(`Invalid date: "${rawDate}"`, { amount });
  }

  const statusValues = getRowValuesByHeaderPatterns(
    row,
    headers,
    STATUS_HEADER_PATTERNS,
  );
  const rawCategoryValues = getRowValuesByHeaderPatterns(
    row,
    headers,
    CATEGORY_HEADER_PATTERNS,
  );
  const rawDescriptionValues = getRowValuesByHeaderPatterns(
    row,
    headers,
    DESCRIPTION_HEADER_PATTERNS,
  );
  const rawAccountValues = getRowValuesByHeaderPatterns(
    row,
    headers,
    ACCOUNT_HEADER_PATTERNS,
  );

  const contextText = [
    title,
    category,
    vendor,
    paymentMethod,
    notes,
    ...statusValues,
    ...rawCategoryValues,
    ...rawDescriptionValues,
    ...rawAccountValues,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const blockedStatus = statusValues.find((value) =>
    SKIP_STATUS_PATTERNS.some((pattern) => pattern.test(value)),
  );
  if (blockedStatus) {
    return buildSkippedRow(`Skipped transaction with status "${blockedStatus}"`);
  }

  if (TRANSFER_PATTERNS.some((pattern) => pattern.test(contextText))) {
    return buildSkippedRow("Skipped transfer between your own accounts");
  }

  const looksLikeBankStatement = hasHeaderMatch(
    headers,
    BANK_STATEMENT_HEADER_PATTERNS,
  );
  const looksLikeIncoming = INCOMING_MARKERS.some((pattern) =>
    pattern.test(contextText),
  );
  if (amount > 0 && (looksLikeBankStatement || looksLikeIncoming)) {
    return buildSkippedRow("Skipped incoming transaction");
  }

  return {
    status: "valid",
    valid: true,
    title: title || vendor || "Untitled expense",
    amount: Math.abs(amount),
    date,
    category: category || undefined,
    vendor: vendor || undefined,
    paymentMethod: paymentMethod || undefined,
    notes: notes || undefined,
    rowIndex,
  };
}

function parseAmountValue(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.\-\(\)]/g, "");
  // Handle parentheses as negative
  const isNeg = cleaned.startsWith("(") && cleaned.endsWith(")");
  const numStr = cleaned.replace(/[\(\)]/g, "");
  const num = parseFloat(numStr);
  if (isNaN(num)) return null;
  return isNeg ? -num : num;
}

function parseDateValue(raw: string): string | null {
  if (!raw) return null;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // MM/DD/YYYY
  const mdySlash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdySlash) {
    const [, m, d, y] = mdySlash;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // MM-DD-YYYY
  const mdyDash = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (mdyDash) {
    const [, m, d, y] = mdyDash;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // DD/MM/YYYY (try if month > 12)
  const dmySlash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmySlash) {
    const [, first, second, y] = dmySlash;
    if (parseInt(first) > 12) {
      return `${y}-${second.padStart(2, "0")}-${first.padStart(2, "0")}`;
    }
  }

  // Try Date constructor
  try {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
  } catch {
    // ignore
  }

  return null;
}

// Build CSV export with injection protection
export function exportToCSV(
  rows: Array<Record<string, string | number>>,
  filename: string
) {
  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]);

  const sanitize = (val: string | number): string => {
    const str = String(val);
    // Prevent CSV injection
    if (/^[=+\-@\t\r]/.test(str)) {
      return `'${str}`;
    }
    // Quote if contains comma, quote, or newline
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvContent = [
    headers.map(sanitize).join(","),
    ...rows.map((row) => headers.map((h) => sanitize(row[h])).join(",")),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
