"use client";

import { api } from "@/convex";
import { useAuthenticatedQuery } from "@/hooks/use-authenticated-query";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, DollarSign, TrendingUp, Calendar } from "lucide-react";

export function SummaryCards() {
  const stats = useAuthenticatedQuery(api.expenses.getStats, {});

  if (stats === undefined) {
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
      label: "Total Expenses",
      value: stats.total.toLocaleString(),
      icon: Receipt,
    },
    {
      label: "Total Spent",
      value: formatCurrency(stats.totalAmount),
      icon: DollarSign,
    },
    {
      label: "Average",
      value: formatCurrency(stats.avgAmount),
      icon: TrendingUp,
    },
    {
      label: "This Month",
      value: formatCurrency(stats.thisMonthTotal),
      icon: Calendar,
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
                <p className="text-2xl font-bold font-mono mt-1">
                  {card.value}
                </p>
              </div>
              <div className="rounded-lg bg-primary/10 p-3">
                <card.icon className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
