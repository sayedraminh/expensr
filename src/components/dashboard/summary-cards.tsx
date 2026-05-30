"use client";

import { api } from "@/convex";
import { useAuthenticatedQuery } from "@/hooks/use-authenticated-query";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, DollarSign, Receipt, TrendingUp } from "lucide-react";

export function SummaryCards() {
  const expenseStats = useAuthenticatedQuery(api.expenses.getStats, {});
  const revenueStats = useAuthenticatedQuery(api.revenues.getStats, {});

  if (expenseStats === undefined || revenueStats === undefined) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-7 w-32" />
                </div>
                <Skeleton className="h-11 w-11 rounded-lg" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: "Total Spent",
      value: formatCurrency(expenseStats.totalAmount),
      description: `${expenseStats.total.toLocaleString()} expense rows`,
      emphasis: "primary",
      icon: Receipt,
    },
    {
      label: "This Month Spend",
      value: formatCurrency(expenseStats.thisMonthTotal),
      description: "Current month expenses",
      emphasis: "primary",
      icon: Calendar,
    },
    {
      label: "Average Expense",
      value: formatCurrency(expenseStats.avgAmount),
      description: "Per expense row",
      emphasis: "primary",
      icon: DollarSign,
    },
    {
      label: "Gross Revenue",
      value: formatCurrency(revenueStats.totalAmount),
      description: `Net ${formatCurrency(revenueStats.totalNet)}`,
      emphasis: "secondary",
      icon: TrendingUp,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{card.label}</p>
                <p className="mt-1 font-mono text-2xl font-bold">
                  {card.value}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {card.description}
                </p>
              </div>
              <div
                className={
                  card.emphasis === "secondary"
                    ? "rounded-lg bg-emerald-500/10 p-3"
                    : "rounded-lg bg-primary/10 p-3"
                }
              >
                <card.icon
                  className={
                    card.emphasis === "secondary"
                      ? "h-5 w-5 text-emerald-400"
                      : "h-5 w-5 text-primary"
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
