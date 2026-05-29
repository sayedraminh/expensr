"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { api } from "@/convex";
import { useAuthenticatedQuery } from "@/hooks/use-authenticated-query";
import {
  getCurrentMonthValue,
  getDatePresetValues,
  getReferenceDate,
  type ExpenseDatePreset,
} from "@/lib/expense-periods";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CalendarDays, Search, X } from "lucide-react";

export interface RevenueFilterState {
  search: string;
  provider: string;
  datePreset: ExpenseDatePreset;
  selectedMonth: string;
  startDate: string;
  endDate: string;
}

export const DEFAULT_REVENUE_FILTERS: RevenueFilterState = {
  search: "",
  provider: "",
  datePreset: "all",
  selectedMonth: "",
  startDate: "",
  endDate: "",
};

const DATE_PRESETS: { value: ExpenseDatePreset; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "last7", label: "Last 7 days" },
  { value: "last30", label: "Last 30 days" },
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Last month" },
  { value: "month", label: "Selected month" },
  { value: "custom", label: "Custom" },
];

interface RevenueFiltersProps {
  filters: RevenueFilterState;
  onFiltersChange: Dispatch<SetStateAction<RevenueFilterState>>;
  referenceDate?: string;
}

export function RevenueFilters({
  filters,
  onFiltersChange,
  referenceDate,
}: RevenueFiltersProps) {
  const providers = useAuthenticatedQuery(api.revenues.listProviders, {});
  const [searchInput, setSearchInput] = useState(filters.search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onFiltersChange((current) => ({ ...current, search: value }));
      }, 300);
    },
    [onFiltersChange],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleDatePresetChange = useCallback(
    (preset: ExpenseDatePreset) => {
      onFiltersChange((current) => {
        const nextDates = getDatePresetValues(preset, {
          referenceDate,
          selectedMonth:
            current.selectedMonth ||
            getCurrentMonthValue(getReferenceDate(referenceDate)),
          startDate: current.startDate,
          endDate: current.endDate,
        });

        return {
          ...current,
          ...nextDates,
        };
      });
    },
    [onFiltersChange, referenceDate],
  );

  const handleMonthChange = useCallback(
    (month: string) => {
      const nextDates = getDatePresetValues("month", {
        referenceDate,
        selectedMonth: month,
      });

      onFiltersChange((current) => ({
        ...current,
        ...nextDates,
      }));
    },
    [onFiltersChange, referenceDate],
  );

  const handleCustomStartDateChange = useCallback(
    (value: string) => {
      onFiltersChange((current) => ({
        ...current,
        datePreset: "custom",
        selectedMonth: "",
        startDate: value,
      }));
    },
    [onFiltersChange],
  );

  const handleCustomEndDateChange = useCallback(
    (value: string) => {
      onFiltersChange((current) => ({
        ...current,
        datePreset: "custom",
        selectedMonth: "",
        endDate: value,
      }));
    },
    [onFiltersChange],
  );

  const handleClearDateFilter = useCallback(() => {
    onFiltersChange((current) => ({
      ...current,
      ...getDatePresetValues("all"),
    }));
  }, [onFiltersChange]);

  const hasActiveFilters =
    filters.search !== "" ||
    filters.provider !== "" ||
    filters.startDate !== "" ||
    filters.endDate !== "";
  const hasDateFilter =
    filters.datePreset !== "all" ||
    filters.startDate !== "" ||
    filters.endDate !== "";

  const handleClear = () => {
    setSearchInput("");
    onFiltersChange(DEFAULT_REVENUE_FILTERS);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search revenue..."
              value={searchInput}
              onChange={(event) => handleSearchChange(event.target.value)}
              className="pl-8"
            />
          </div>

          <select
            value={filters.provider}
            onChange={(event) =>
              onFiltersChange((current) => ({
                ...current,
                provider: event.target.value,
              }))
            }
            className="flex h-8 w-[180px] items-center rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/50 dark:bg-input/30"
          >
            <option value="">All Providers</option>
            {providers?.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        </div>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={handleClear}>
            <X className="mr-1 size-3.5" />
            Clear Filters
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex h-10 items-center overflow-hidden rounded-xl border border-input bg-background/60">
          <div className="flex items-center gap-2 px-3 text-sm text-muted-foreground">
            <CalendarDays className="size-4" />
            <span>Revenue Date</span>
          </div>
          <div className="h-5 w-px bg-border" />
          <select
            value={filters.datePreset}
            onChange={(event) =>
              handleDatePresetChange(event.target.value as ExpenseDatePreset)
            }
            className="h-full min-w-[180px] bg-transparent px-3 text-sm outline-none"
          >
            {DATE_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
          {hasDateFilter && (
            <>
              <div className="h-5 w-px bg-border" />
              <button
                type="button"
                onClick={handleClearDateFilter}
                className="flex h-full items-center justify-center px-3 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Clear date filter"
              >
                <X className="size-4" />
              </button>
            </>
          )}
        </div>

        {filters.datePreset === "month" && (
          <Input
            type="month"
            value={
              filters.selectedMonth ||
              getCurrentMonthValue(getReferenceDate(referenceDate))
            }
            onChange={(event) => handleMonthChange(event.target.value)}
            className="w-[180px]"
          />
        )}

        {filters.datePreset === "custom" && (
          <>
            <Input
              type="date"
              value={filters.startDate}
              onChange={(event) =>
                handleCustomStartDateChange(event.target.value)
              }
              className="w-[160px]"
              placeholder="Start date"
            />
            <Input
              type="date"
              value={filters.endDate}
              onChange={(event) => handleCustomEndDateChange(event.target.value)}
              className="w-[160px]"
              placeholder="End date"
            />
          </>
        )}
      </div>
    </div>
  );
}
