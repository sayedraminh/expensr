"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/convex";
import { useAuthenticatedQuery } from "@/hooks/use-authenticated-query";
import { formatCurrency } from "@/lib/format";
import { exportToCSV } from "@/lib/csv";
import {
  getDatePresetLabel,
  getDateRangeDetail,
} from "@/lib/expense-periods";
import {
  DEFAULT_REVENUE_FILTERS,
  RevenueFilters,
  type RevenueFilterState,
} from "@/components/revenue/revenue-filters";
import {
  RevenueTable,
  type RevenueListItem,
} from "@/components/revenue/revenue-table";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight, Download, Store, Upload } from "lucide-react";

type RevenueQueryArgs = {
  search?: string;
  provider?: string;
  startDate?: string;
  endDate?: string;
};

function buildRevenueQueryArgs(filters: RevenueFilterState): RevenueQueryArgs {
  const queryArgs: RevenueQueryArgs = {};
  if (filters.search) queryArgs.search = filters.search;
  if (filters.provider) queryArgs.provider = filters.provider;
  if (filters.startDate) queryArgs.startDate = filters.startDate;
  if (filters.endDate) queryArgs.endDate = filters.endDate;
  return queryArgs;
}

function buildReferenceQueryArgs(
  filters: RevenueFilterState,
): RevenueQueryArgs {
  const queryArgs: RevenueQueryArgs = {};
  if (filters.search) queryArgs.search = filters.search;
  if (filters.provider) queryArgs.provider = filters.provider;
  return queryArgs;
}

export default function RevenuePage() {
  const [filters, setFilters] = useState<RevenueFilterState>(
    DEFAULT_REVENUE_FILTERS,
  );

  const queryArgs = buildRevenueQueryArgs(filters);
  const referenceQueryArgs = buildReferenceQueryArgs(filters);

  const revenues = useAuthenticatedQuery(api.revenues.list, queryArgs);
  const summary = useAuthenticatedQuery(
    api.revenues.filteredSummary,
    queryArgs,
  );
  const referenceRevenues = useAuthenticatedQuery(
    api.revenues.list,
    referenceQueryArgs,
  );
  const referenceDate = referenceRevenues?.[0]?.date;

  const handleExport = () => {
    if (!revenues || revenues.length === 0) return;

    const rows = revenues.map((revenue) => ({
      Date: revenue.date,
      Title: revenue.title,
      Provider: revenue.provider,
      Customer: revenue.customer || "",
      Gross: revenue.amount,
      Fee: revenue.fee ?? "",
      Net: revenue.netAmount,
      Currency: revenue.currency || "USD",
      "Transaction ID": revenue.transactionId || "",
      Notes: revenue.notes || "",
    }));

    exportToCSV(
      rows,
      `revenue-${new Date().toISOString().split("T")[0]}.csv`,
    );
  };

  return (
    <div className="space-y-6" data-animate>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Revenue</h1>
          <p className="mt-1 text-muted-foreground">
            Track imported revenue from subscriptions and payment processors.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={!revenues || revenues.length === 0}
          >
            <Download className="mr-1.5 size-3.5" />
            Export CSV
          </Button>
          <Button
            size="sm"
            render={<Link href="/revenue/import" />}
            nativeButton={false}
          >
            <Upload className="mr-1.5 size-3.5" />
            Import Revenue CSV
          </Button>
        </div>
      </div>

      <RevenueFilters
        filters={filters}
        onFiltersChange={setFilters}
        referenceDate={referenceDate}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
        <Card>
          <CardContent className="flex h-full flex-col justify-between gap-6 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Gross revenue</p>
                {summary === undefined ? (
                  <Skeleton className="mt-2 h-9 w-40" />
                ) : (
                  <p className="mt-2 font-mono text-3xl font-bold">
                    {formatCurrency(summary.totalAmount)}
                  </p>
                )}
              </div>
              <div className="rounded-lg bg-primary/10 p-3">
                <ArrowUpRight className="h-5 w-5 text-primary" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Period
                </p>
                <p className="mt-2 text-base font-medium">
                  {getDatePresetLabel(filters)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {getDateRangeDetail(filters, "revenue entries")}
                </p>
              </div>

              <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Net revenue
                </p>
                {summary === undefined ? (
                  <Skeleton className="mt-2 h-7 w-24" />
                ) : (
                  <p className="mt-2 text-2xl font-semibold">
                    {formatCurrency(summary.totalNet)}
                  </p>
                )}
                <p className="mt-1 text-sm text-muted-foreground">
                  {summary === undefined
                    ? "After processor fees"
                    : `${summary.count.toLocaleString()} matching row${
                        summary.count !== 1 ? "s" : ""
                      } • ${formatCurrency(summary.totalFees)} in fees`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Providers</CardTitle>
            <CardDescription>
              Revenue totals for {getDatePresetLabel(filters).toLowerCase()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary === undefined ? (
              Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3"
                >
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-4 w-20" />
                </div>
              ))
            ) : summary.providerTotals.length > 0 ? (
              summary.providerTotals.map((provider) => (
                <div
                  key={provider.provider}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="rounded-md bg-primary/10 p-1.5">
                        <Store className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <p className="truncate font-medium">{provider.provider}</p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {provider.count} payment
                      {provider.count !== 1 ? "s" : ""} • net{" "}
                      {formatCurrency(provider.totalNet)}
                    </p>
                  </div>
                  <p className="font-mono font-medium">
                    {formatCurrency(provider.totalAmount)}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed py-10 text-center">
                <p className="font-medium">No providers in this range</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try widening the date range or importing a revenue CSV.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <RevenueTable
        revenues={revenues as RevenueListItem[] | undefined}
        filters={filters}
      />
    </div>
  );
}
