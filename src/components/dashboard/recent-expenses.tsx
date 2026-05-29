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
import { Receipt, ArrowRight, Upload } from "lucide-react";

export function RecentExpenses() {
  const expenses = useAuthenticatedQuery(api.expenses.list, {});

  if (expenses === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Expenses</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    );
  }

  const recent = expenses.slice(0, 8);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Expenses</CardTitle>
        {expenses.length > 0 && (
          <CardAction>
            <Button variant="ghost" size="sm" render={<Link href="/expenses" />} nativeButton={false}>
              View all
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Receipt className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-medium text-lg">No expenses yet</h3>
            <p className="text-muted-foreground mt-1 mb-4">
              Import a CSV file to get started tracking your spending.
            </p>
            <Button render={<Link href="/import" />} nativeButton={false}>
              <Upload className="mr-2 h-4 w-4" />
              Import CSV
            </Button>
          </div>
        ) : (
          <div className="space-y-1">
            {recent.map((expense) => (
              <div
                key={expense._id}
                className="flex items-center gap-4 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50"
              >
                <span className="text-sm text-muted-foreground w-24 shrink-0">
                  {formatDate(expense.date)}
                </span>
                <span className="text-sm font-medium truncate flex-1">
                  {expense.title}
                </span>
                {expense.categoryName && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{
                        backgroundColor: expense.categoryColor ?? "#9ca3af",
                      }}
                    />
                    {expense.categoryName}
                  </span>
                )}
                <span className="text-sm font-mono font-medium font-tabular text-right w-24 shrink-0">
                  {formatCurrency(expense.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
