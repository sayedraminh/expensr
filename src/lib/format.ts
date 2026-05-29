import { format, parseISO, isValid } from "date-fns";

export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(dateStr: string, fmt = "MMM d, yyyy"): string {
  try {
    const date = parseISO(dateStr);
    if (!isValid(date)) return dateStr;
    return format(date, fmt);
  } catch {
    return dateStr;
  }
}

export function formatMonth(dateStr: string): string {
  return formatDate(dateStr, "MMM yyyy");
}

export function formatCompactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(2);
}

export function toISODate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function parseAmount(raw: string): number | null {
  // Strip currency symbols, commas, spaces
  const cleaned = raw.replace(/[^0-9.\-]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : Math.abs(num);
}

export function parseDate(raw: string): string | null {
  // Try common date formats
  const formats = [
    /^(\d{4})-(\d{2})-(\d{2})$/, // YYYY-MM-DD
    /^(\d{2})\/(\d{2})\/(\d{4})$/, // MM/DD/YYYY
    /^(\d{2})-(\d{2})-(\d{4})$/, // MM-DD-YYYY
    /^(\d{2})\.(\d{2})\.(\d{4})$/, // DD.MM.YYYY
  ];

  // ISO format
  if (formats[0].test(raw)) return raw;

  // MM/DD/YYYY or MM-DD-YYYY
  const mdyMatch = raw.match(formats[1]) || raw.match(formats[2]);
  if (mdyMatch) {
    const [, m, d, y] = mdyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // DD.MM.YYYY
  const dmyMatch = raw.match(formats[3]);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // Try JS Date parse as last resort
  try {
    const date = new Date(raw);
    if (isValid(date)) {
      return format(date, "yyyy-MM-dd");
    }
  } catch {
    // ignore
  }

  return null;
}

// Category color palette
export const CATEGORY_COLORS = [
  "#10b981", // emerald
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#ef4444", // rose
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
  "#06b6d4", // cyan
  "#84cc16", // lime
  "#6366f1", // indigo
  "#d946ef", // fuchsia
];

export function getNextColor(usedColors: string[]): string {
  const available = CATEGORY_COLORS.filter((c) => !usedColors.includes(c));
  return available[0] || CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)];
}
