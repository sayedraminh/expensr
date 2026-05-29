"use client";

import { useState } from "react";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { useAuthenticatedQuery } from "@/hooks/use-authenticated-query";
import { formatCurrency, formatDate } from "@/lib/format";
import { exportToCSV } from "@/lib/csv";
import {
  getDatePresetLabel,
  getDateRangeDetail,
} from "@/lib/expense-periods";
import {
  ExpenseTable,
  type ExpenseListItem,
} from "@/components/expenses/expense-table";
import { ExpenseDialog } from "@/components/expenses/expense-dialog";
import {
  ExpenseFilters,
  DEFAULT_FILTERS,
  type FilterState,
} from "@/components/expenses/expense-filters";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Plus, Receipt, Store } from "lucide-react";

type ExpenseQueryArgs = {
  search?: string;
  categoryId?: Id<"categories">;
  paymentMethodId?: Id<"paymentMethods">;
  startDate?: string;
  endDate?: string;
};

function buildExpenseQueryArgs(filters: FilterState): ExpenseQueryArgs {
  const queryArgs: ExpenseQueryArgs = {};
  if (filters.search) queryArgs.search = filters.search;
  if (filters.categoryId)
    queryArgs.categoryId = filters.categoryId as Id<"categories">;
  if (filters.paymentMethodId)
    queryArgs.paymentMethodId =
      filters.paymentMethodId as Id<"paymentMethods">;
  if (filters.startDate) queryArgs.startDate = filters.startDate;
  if (filters.endDate) queryArgs.endDate = filters.endDate;

  return queryArgs;
}

function buildReferenceQueryArgs(filters: FilterState): ExpenseQueryArgs {
  const queryArgs: ExpenseQueryArgs = {};
  if (filters.search) queryArgs.search = filters.search;
  if (filters.categoryId)
    queryArgs.categoryId = filters.categoryId as Id<"categories">;
  if (filters.paymentMethodId)
    queryArgs.paymentMethodId =
      filters.paymentMethodId as Id<"paymentMethods">;

  return queryArgs;
}

export default function ExpensesPage() {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [showDialog, setShowDialog] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseListItem | null>(
    null,
  );

  const queryArgs = buildExpenseQueryArgs(filters);
  const referenceQueryArgs = buildReferenceQueryArgs(filters);

  const expenses = useAuthenticatedQuery(api.expenses.list, queryArgs);
  const summary = useAuthenticatedQuery(
    api.expenses.filteredSummary,
    queryArgs,
  );
  const referenceExpenses = useAuthenticatedQuery(
    api.expenses.list,
    referenceQueryArgs,
  );
  const referenceDate = referenceExpenses?.[0]?.date;

  const handleExport = () => {
    if (!expenses || expenses.length === 0) return;

    const rows = expenses.map((exp) => ({
      Date: formatDate(exp.date),
      Title: exp.title,
      Category: exp.categoryName || "",
      Amount: formatCurrency(exp.amount),
      Vendor: exp.vendor || "",
      "Payment Method": exp.paymentMethodName || "",
      Notes: exp.notes || "",
    }));

    exportToCSV(rows, `expenses-${new Date().toISOString().split("T")[0]}.csv`);
  };

  const handleEdit = (expense: ExpenseListItem) => {
    setEditingExpense(expense);
    setShowDialog(true);
  };

  const handleAdd = () => {
    setEditingExpense(null);
    setShowDialog(true);
  };

  const handleDialogChange = (open: boolean) => {
    setShowDialog(open);
    if (!open) setEditingExpense(null);
  };

  return (
    <div className="space-y-6" data-animate>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={!expenses || expenses.length === 0}
          >
            <Download className="mr-1.5 size-3.5" />
            Export CSV
          </Button>
          <Button size="sm" onClick={handleAdd}>
            <Plus className="mr-1.5 size-3.5" />
            Add Expense
          </Button>
        </div>
      </div>

      <ExpenseFilters
        filters={filters}
        onFiltersChange={setFilters}
        referenceDate={referenceDate}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
        <Card>
          <CardContent className="flex h-full flex-col justify-between gap-6 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Total spend</p>
                {summary === undefined ? (
                  <Skeleton className="mt-2 h-9 w-40" />
                ) : (
                  <p className="mt-2 font-mono text-3xl font-bold">
                    {formatCurrency(summary.totalAmount)}
                  </p>
                )}
              </div>
              <div className="rounded-lg bg-primary/10 p-3">
                <Receipt className="h-5 w-5 text-primary" />
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
                  {getDateRangeDetail(filters, "expenses")}
                </p>
              </div>

              <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Matching expenses
                </p>
                {summary === undefined ? (
                  <Skeleton className="mt-2 h-7 w-16" />
                ) : (
                  <p className="mt-2 text-2xl font-semibold">
                    {summary.count.toLocaleString()}
                  </p>
                )}
                <p className="mt-1 text-sm text-muted-foreground">
                  Based on the current filters and date range
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Vendors</CardTitle>
            <CardDescription>
              Vendor totals for {getDatePresetLabel(filters)}
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
            ) : summary.vendorTotals.length > 0 ? (
              summary.vendorTotals.map((vendor) => (
                <div
                  key={vendor.vendor}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="rounded-md bg-primary/10 p-1.5">
                        <Store className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <p className="truncate font-medium">{vendor.vendor}</p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {vendor.count} expense{vendor.count !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <p className="font-mono font-medium">
                    {formatCurrency(vendor.totalAmount)}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed py-10 text-center">
                <p className="font-medium">No vendors in this range</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try widening the date range or clearing filters.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ExpenseTable
        expenses={expenses}
        filters={filters}
        onEdit={handleEdit}
        onAdd={handleAdd}
      />

      <ExpenseDialog
        open={showDialog}
        onOpenChange={handleDialogChange}
        expense={
          editingExpense
            ? {
                _id: editingExpense._id as Id<"expenses">,
                title: editingExpense.title as string,
                amount: editingExpense.amount as number,
                date: editingExpense.date as string,
                categoryId:
                  (editingExpense.categoryId as Id<"categories">) || null,
                paymentMethodId:
                  (editingExpense.paymentMethodId as Id<"paymentMethods">) ||
                  null,
                vendor: (editingExpense.vendor as string) || "",
                notes: (editingExpense.notes as string) || "",
              }
            : null
        }
      />
    </div>
  );
}
