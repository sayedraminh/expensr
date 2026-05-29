import {
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";

import { formatDate, formatMonth, toISODate } from "@/lib/format";

export type ExpenseDatePreset =
  | "all"
  | "last7"
  | "last30"
  | "thisMonth"
  | "lastMonth"
  | "month"
  | "custom";

export interface ExpenseDateRangeState {
  datePreset: ExpenseDatePreset;
  selectedMonth: string;
  startDate: string;
  endDate: string;
}

export function getCurrentMonthValue(now = new Date()): string {
  return format(now, "yyyy-MM");
}

export function getReferenceDate(referenceDate?: string): Date {
  if (!referenceDate) {
    return new Date();
  }

  const parsed = parseISO(referenceDate);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }

  return parsed;
}

export function getMonthDateRange(month: string): {
  startDate: string;
  endDate: string;
} {
  if (!month) {
    return { startDate: "", endDate: "" };
  }

  const baseDate = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(baseDate.getTime())) {
    return { startDate: "", endDate: "" };
  }

  return {
    startDate: toISODate(startOfMonth(baseDate)),
    endDate: toISODate(endOfMonth(baseDate)),
  };
}

export function getRelativeDateRange(
  days: number,
  now = new Date(),
): {
  startDate: string;
  endDate: string;
} {
  return {
    startDate: toISODate(subDays(now, days - 1)),
    endDate: toISODate(now),
  };
}

export function getDatePresetValues(
  preset: ExpenseDatePreset,
  options?: {
    referenceDate?: string;
    selectedMonth?: string;
    startDate?: string;
    endDate?: string;
  },
): ExpenseDateRangeState {
  const referenceDate = getReferenceDate(options?.referenceDate);
  const selectedMonth =
    options?.selectedMonth || getCurrentMonthValue(referenceDate);

  switch (preset) {
    case "last7": {
      const range = getRelativeDateRange(7, referenceDate);
      return {
        datePreset: preset,
        selectedMonth: "",
        ...range,
      };
    }
    case "last30": {
      const range = getRelativeDateRange(30, referenceDate);
      return {
        datePreset: preset,
        selectedMonth: "",
        ...range,
      };
    }
    case "thisMonth": {
      const month = getCurrentMonthValue(referenceDate);
      const range = getMonthDateRange(month);
      return {
        datePreset: preset,
        selectedMonth: "",
        ...range,
      };
    }
    case "lastMonth": {
      const month = getCurrentMonthValue(subMonths(referenceDate, 1));
      const range = getMonthDateRange(month);
      return {
        datePreset: preset,
        selectedMonth: "",
        ...range,
      };
    }
    case "month": {
      const range = getMonthDateRange(selectedMonth);
      return {
        datePreset: preset,
        selectedMonth,
        ...range,
      };
    }
    case "custom":
      return {
        datePreset: preset,
        selectedMonth: "",
        startDate: options?.startDate ?? "",
        endDate: options?.endDate ?? "",
      };
    case "all":
    default:
      return {
        datePreset: "all",
        selectedMonth: "",
        startDate: "",
        endDate: "",
      };
  }
}

export function getDatePresetLabel(state: ExpenseDateRangeState): string {
  switch (state.datePreset) {
    case "last7":
      return "Last 7 days";
    case "last30":
      return "Last 30 days";
    case "thisMonth":
      return "This month";
    case "lastMonth":
      return "Last month";
    case "month":
      return state.selectedMonth
        ? formatMonth(`${state.selectedMonth}-01`)
        : "Selected month";
    case "custom":
      return "Custom range";
    case "all":
    default:
      return "All time";
  }
}

export function getDateRangeDetail(
  state: ExpenseDateRangeState,
  subject = "entries",
): string {
  if (state.datePreset === "all" || (!state.startDate && !state.endDate)) {
    return `Across all recorded ${subject}`;
  }

  if (state.startDate && state.endDate) {
    return `${formatDate(state.startDate)} - ${formatDate(state.endDate)}`;
  }

  if (state.startDate) {
    return `From ${formatDate(state.startDate)}`;
  }

  return `Through ${formatDate(state.endDate)}`;
}
