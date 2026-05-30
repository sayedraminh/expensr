"use client";

import Link from "next/link";
import { api } from "@/convex";
import { useAuthenticatedQuery } from "@/hooks/use-authenticated-query";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Landmark, Receipt, TrendingUp } from "lucide-react";

export function RecentExpenses() {
  const expenses = useAuthenticatedQuery(api.expenses.list, {});
  const revenues = useAuthenticatedQuery(api.revenues.list, {});

  if (expenses === undefined || revenues === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-40 flex-1" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
            <div className="space-y-4 lg:border-l lg:pl-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-9 w-9 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const recentExpenses = expenses.slice(0, 8);
  const recentRevenues = revenues.slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        {expenses.length > 0 && (
          <CardAction>
            <Button
              variant="ghost"
              size="sm"
              render={<Link href="/expenses" />}
              nativeButton={false}
            >
              View all
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <section>
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              Recent Expenses
            </div>

            {recentExpenses.length === 0 ? (
              <div className="flex min-h-64 flex-col items-center justify-center py-10 text-center">
                <div className="mb-4 rounded-full bg-muted p-4">
                  <Receipt className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium">No expenses yet</h3>
                <p className="mt-1 mb-4 text-muted-foreground">
                  Connect a bank account to start tracking new spending.
                </p>
                <Button render={<Link href="/accounts" />} nativeButton={false}>
                  <Landmark className="mr-2 h-4 w-4" />
                  Connect Bank
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                {recentExpenses.map((expense) => (
                  <div
                    key={expense._id}
                    className="flex items-center gap-4 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50"
                  >
                    <span className="w-24 shrink-0 text-sm text-muted-foreground">
                      {formatDate(expense.date)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {expense.title}
                    </span>
                    {expense.categoryName && (
                      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{
                            backgroundColor:
                              expense.categoryColor ?? "#9ca3af",
                          }}
                        />
                        {expense.categoryName}
                      </span>
                    )}
                    <span className="w-24 shrink-0 text-right font-mono text-sm font-medium tabular-nums">
                      {formatCurrency(expense.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="border-t pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                Recent Revenue
              </div>
              {revenues.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  render={<Link href="/revenue" />}
                  nativeButton={false}
                >
                  View
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {recentRevenues.length === 0 ? (
              <div className="flex min-h-64 flex-col items-center justify-center text-center text-muted-foreground">
                <div className="mb-4 rounded-full bg-emerald-500/10 p-4">
                  <TrendingUp className="h-7 w-7 text-emerald-400" />
                </div>
                <p>No revenue yet</p>
              </div>
            ) : (
              <div className="space-y-1">
                {recentRevenues.map((revenue) => (
                  <div
                    key={revenue._id}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {revenue.title}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {formatDate(revenue.date)}
                        {revenue.customer ? ` · ${revenue.customer}` : ""}
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-sm font-medium text-emerald-400 tabular-nums">
                      {formatCurrency(revenue.netAmount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </CardContent>
    </Card>
  );
}
