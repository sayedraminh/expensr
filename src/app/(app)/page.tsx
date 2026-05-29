"use client";

import { SummaryCards } from "@/components/dashboard/summary-cards";
import { SpendingChart } from "@/components/dashboard/spending-chart";
import { RecentExpenses } from "@/components/dashboard/recent-expenses";

export default function DashboardPage() {
  return (
    <div data-animate className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Overview of your spending activity
        </p>
      </div>

      <SummaryCards />
      <SpendingChart />
      <RecentExpenses />
    </div>
  );
}
