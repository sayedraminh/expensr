"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useUser } from "@clerk/nextjs";
import { api } from "@/convex";
import { useAuthenticatedQuery } from "@/hooks/use-authenticated-query";
import { formatCurrency, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  ArrowRight,
  BanknoteArrowUp,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Landmark,
  Receipt,
  Search,
  ShieldCheck,
  TrendingUp,
  Upload,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
} from "recharts";

type MovementItem = {
  name: string;
  amount: number;
  count: number;
};

type ExpenseRow = {
  _id: string;
  title: string;
  amount: number;
  date: string;
  source: "manual" | "import" | "plaid";
  vendor?: string;
  categoryName?: string | null;
  categoryColor?: string | null;
};

type RevenueRow = {
  _id: string;
  title: string;
  netAmount: number;
  date: string;
  provider: string;
  customer?: string;
  source: "manual" | "import" | "stripe";
};

type TrendPoint = {
  month: string;
  moneyIn: number;
  moneyOut: number;
  net: number;
};

type BarPoint = {
  month: string;
  amount: number;
};

const netChartConfig = {
  net: { label: "Net", color: "var(--chart-2)" },
} satisfies ChartConfig;

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getRecentMonthKeys(count: number, baseDate = new Date()) {
  const keys: string[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1);
    keys.push(getMonthKey(d));
  }

  return keys;
}

function getCurrentMonthLabel(date = new Date()) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function getMonthDateRange(month: string) {
  const [yearValue, monthValue] = month.split("-").map(Number);
  const lastDay = new Date(yearValue, monthValue, 0).getDate();

  return {
    startDate: `${month}-01`,
    endDate: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

function formatMonthLabel(month: string) {
  const [year, monthIndex] = month.split("-");
  const date = new Date(Number(year), Number(monthIndex) - 1);

  return date.toLocaleDateString("en-US", { month: "short" });
}

function compactCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

function initialFor(value: string) {
  return value.trim().charAt(0).toUpperCase() || "$";
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-9">
      <div className="space-y-3">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-[360px] rounded-2xl" />
        <Skeleton className="h-[360px] rounded-2xl" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-[390px] rounded-2xl" />
        <Skeleton className="h-[390px] rounded-2xl" />
      </div>
      <Skeleton className="h-[520px] rounded-2xl" />
    </div>
  );
}

function MoneyMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "in" | "out";
}) {
  return (
    <div className="min-w-0">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div
        className={
          tone === "in"
            ? "mt-1 truncate text-lg font-medium tabular-nums text-emerald-300"
            : tone === "out"
              ? "mt-1 truncate text-lg font-medium tabular-nums text-rose-300"
              : "mt-1 truncate text-lg font-medium tabular-nums"
        }
      >
        {value}
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  detail,
  value,
  tone,
}: {
  label: string;
  detail?: string;
  value: string;
  tone?: "in" | "out";
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-4">
      <div className="min-w-0">
        <div className="font-medium">{label}</div>
        {detail && (
          <div className="mt-1 truncate text-sm text-muted-foreground">
            {detail}
          </div>
        )}
      </div>
      <div
        className={
          tone === "in"
            ? "shrink-0 text-right font-medium tabular-nums text-emerald-300"
            : tone === "out"
              ? "shrink-0 text-right font-medium tabular-nums text-rose-300"
              : "shrink-0 text-right font-medium tabular-nums"
        }
      >
        {value}
      </div>
    </div>
  );
}

function MiniBarChart({ data, tone }: { data: BarPoint[]; tone: "in" | "out" }) {
  const chartConfig = {
    amount: {
      label: "Amount",
      color: tone === "in" ? "var(--chart-3)" : "var(--chart-4)",
    },
  } satisfies ChartConfig;

  return (
    <ChartContainer
      config={chartConfig}
      className="h-16 w-40"
      initialDimension={{ width: 160, height: 64 }}
    >
      <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <ChartTooltip
          content={
            <ChartTooltipContent
              hideLabel
              formatter={(value) => formatCurrency(value as number)}
            />
          }
        />
        <Bar
          dataKey="amount"
          fill="var(--color-amount)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  );
}

function OverviewTrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <ChartContainer
      config={netChartConfig}
      className="h-44 w-full"
      initialDimension={{ width: 640, height: 176 }}
    >
      <AreaChart data={data} margin={{ top: 12, right: 4, bottom: 0, left: 4 }}>
        <defs>
          <linearGradient id="dashboardNetFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-net)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--color-net)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          vertical={false}
          strokeDasharray="4 8"
          className="stroke-border/60"
        />
        <XAxis
          dataKey="month"
          axisLine={false}
          tickLine={false}
          tickMargin={10}
          tickFormatter={formatMonthLabel}
          className="text-xs"
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(label) => formatMonthLabel(String(label))}
              formatter={(value) => formatCurrency(value as number)}
            />
          }
        />
        <Area
          type="monotone"
          dataKey="net"
          stroke="var(--color-net)"
          strokeWidth={2}
          fill="url(#dashboardNetFill)"
          dot={false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ChartContainer>
  );
}

function OverviewCard({
  totalRevenue,
  totalExpenses,
  currentMonthIn,
  currentMonthOut,
  trendData,
}: {
  totalRevenue: number;
  totalExpenses: number;
  currentMonthIn: number;
  currentMonthOut: number;
  trendData: TrendPoint[];
}) {
  const netPosition = totalRevenue - totalExpenses;

  return (
    <Card className="rounded-2xl bg-card/80 py-0 shadow-none">
      <CardHeader className="px-7 pt-7">
        <div className="flex items-start justify-between gap-6">
          <div>
            <CardTitle className="flex items-center gap-2 text-base text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Net position
            </CardTitle>
            <div className="mt-4 text-5xl font-medium tracking-tight tabular-nums">
              {formatCurrency(netPosition)}
            </div>
          </div>
          <div className="rounded-full border px-3 py-1 text-sm text-muted-foreground">
            All time
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-7 pb-5">
        <OverviewTrendChart data={trendData} />
      </CardContent>
      <CardFooter className="grid gap-5 border-t bg-transparent px-7 py-5 sm:grid-cols-3">
        <MoneyMetric
          label="Money in"
          value={formatCurrency(totalRevenue)}
          tone="in"
        />
        <MoneyMetric
          label="Money out"
          value={`-${formatCurrency(totalExpenses)}`}
          tone="out"
        />
        <MoneyMetric
          label={getCurrentMonthLabel()}
          value={`${compactCurrency(currentMonthIn)} in / ${compactCurrency(
            currentMonthOut,
          )} out`}
        />
      </CardFooter>
    </Card>
  );
}

function FocusCard({
  expenseCount,
  revenueCount,
  avgExpense,
  thisMonthSpend,
}: {
  expenseCount: number;
  revenueCount: number;
  avgExpense: number;
  thisMonthSpend: number;
}) {
  return (
    <Card className="rounded-2xl bg-card/80 py-0 shadow-none">
      <CardHeader className="px-7 pt-7">
        <CardTitle className="text-base text-muted-foreground">
          Expense control
        </CardTitle>
        <div className="mt-2 text-3xl font-medium tracking-tight">
          Spending stays first
        </div>
      </CardHeader>
      <CardContent className="px-7 pb-7">
        <div className="mt-6 divide-y divide-border">
          <SummaryRow
            label="This month spend"
            detail="Current month expense activity"
            value={formatCurrency(thisMonthSpend)}
            tone="out"
          />
          <SummaryRow
            label="Average expense"
            detail={`${expenseCount.toLocaleString()} expense rows`}
            value={formatCurrency(avgExpense)}
          />
          <SummaryRow
            label="Revenue rows"
            detail="Available for context"
            value={revenueCount.toLocaleString()}
            tone="in"
          />
          <SummaryRow
            label="Primary view"
            detail="Dashboard stays expense-led"
            value="Expenses"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function MovementCard({
  title,
  amount,
  items,
  averageLabel,
  averageAmount,
  bars,
  tone,
  href,
}: {
  title: string;
  amount: number;
  items: MovementItem[];
  averageLabel: string;
  averageAmount: number;
  bars: BarPoint[];
  tone: "in" | "out";
  href: string;
}) {
  const isIn = tone === "in";

  return (
    <Card className="overflow-hidden rounded-2xl bg-card/80 py-0 shadow-none">
      <CardHeader className="px-7 pt-7">
        <CardTitle className="text-xl font-medium">{title}</CardTitle>
        <div
          className={
            isIn
              ? "text-3xl font-medium tabular-nums text-emerald-300"
              : "text-3xl font-medium tabular-nums"
          }
        >
          {isIn ? formatCurrency(amount) : `-${formatCurrency(amount)}`}
        </div>
      </CardHeader>
      <CardContent className="min-h-[300px] px-7 pb-7">
        <Separator className="mb-7" />
        <div className="mb-5 text-lg font-medium text-muted-foreground">
          {isIn ? "Top sources" : "Top spend"}
        </div>
        {items.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
            No {isIn ? "revenue" : "expense"} activity this month
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <div key={item.name} className="flex items-center gap-4">
                <div
                  className={
                    isIn
                      ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-sm font-medium text-emerald-200"
                      : "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-medium text-primary"
                  }
                >
                  {initialFor(item.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-lg">{item.name}</div>
                </div>
                <div className="shrink-0 text-right font-medium tabular-nums">
                  {isIn
                    ? formatCurrency(item.amount)
                    : `-${formatCurrency(item.amount)}`}
                </div>
              </div>
            ))}
            <Button
              variant="ghost"
              className="-ml-2 mt-2 text-muted-foreground"
              render={<Link href={href} />}
              nativeButton={false}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                <ArrowRight className="h-4 w-4" />
              </span>
              View all
            </Button>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex items-end justify-between gap-4 border-t bg-transparent px-7 py-5">
        <div>
          <div className="text-lg text-muted-foreground">{averageLabel}</div>
          <div className="mt-2 text-xl font-medium tabular-nums">
            {isIn
              ? formatCurrency(averageAmount)
              : `-${formatCurrency(averageAmount)}`}
          </div>
        </div>
        <MiniBarChart data={bars} tone={tone} />
      </CardFooter>
    </Card>
  );
}

function ActivityAvatar({
  label,
  tone,
}: {
  label: string;
  tone: "expense" | "revenue";
}) {
  return (
    <div
      className={
        tone === "revenue"
          ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-sm font-medium text-emerald-200"
          : "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-medium text-primary"
      }
    >
      {initialFor(label)}
    </div>
  );
}

function ExpenseRows({ rows }: { rows: ExpenseRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center text-center">
        <div className="mb-4 rounded-full bg-muted p-4">
          <Receipt className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="font-medium">No expenses yet</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Connect a bank account or import expenses to fill this table.
        </div>
        <div className="mt-4 flex gap-2">
          <Button render={<Link href="/accounts" />} nativeButton={false}>
            <Landmark className="mr-2 h-4 w-4" />
            Connect Bank
          </Button>
          <Button
            variant="outline"
            render={<Link href="/import" />}
            nativeButton={false}
          >
            <Upload className="mr-2 h-4 w-4" />
            Import CSV
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-[74px_minmax(0,1fr)_96px] gap-4 border-b px-1 pb-3 text-sm text-muted-foreground md:grid-cols-[90px_minmax(0,1.6fr)_minmax(120px,0.9fr)_120px]">
        <span>Date</span>
        <span>To / from</span>
        <span className="hidden md:block">Category</span>
        <span className="text-right">Amount</span>
      </div>
      <div className="divide-y divide-border">
        {rows.map((expense) => {
          const label = expense.vendor || expense.title;

          return (
            <div
              key={expense._id}
              className="grid grid-cols-[74px_minmax(0,1fr)_96px] items-center gap-4 px-1 py-4 md:grid-cols-[90px_minmax(0,1.6fr)_minmax(120px,0.9fr)_120px]"
            >
              <div className="text-sm text-muted-foreground">
                {formatDate(expense.date, "MMM d")}
              </div>
              <div className="flex min-w-0 items-center gap-3">
                <ActivityAvatar label={label} tone="expense" />
                <div className="min-w-0">
                  <div className="truncate text-base">{label}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {expense.source}
                  </div>
                </div>
              </div>
              <div className="hidden min-w-0 items-center gap-2 text-sm text-muted-foreground md:flex">
                {expense.categoryColor && (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: expense.categoryColor }}
                  />
                )}
                <span className="truncate">
                  {expense.categoryName ?? "Uncategorized"}
                </span>
              </div>
              <div className="text-right font-medium tabular-nums">
                -{formatCurrency(expense.amount)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RevenueRows({ rows }: { rows: RevenueRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center text-center">
        <div className="mb-4 rounded-full bg-emerald-500/10 p-4">
          <TrendingUp className="h-8 w-8 text-emerald-300" />
        </div>
        <div className="font-medium">No revenue yet</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Connect Stripe or import revenue to fill this table.
        </div>
        <Button
          className="mt-4"
          render={<Link href="/revenue" />}
          nativeButton={false}
        >
          <BanknoteArrowUp className="mr-2 h-4 w-4" />
          Open Revenue
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-[74px_minmax(0,1fr)_96px] gap-4 border-b px-1 pb-3 text-sm text-muted-foreground md:grid-cols-[90px_minmax(0,1.6fr)_minmax(120px,0.9fr)_120px]">
        <span>Date</span>
        <span>From</span>
        <span className="hidden md:block">Provider</span>
        <span className="text-right">Net</span>
      </div>
      <div className="divide-y divide-border">
        {rows.map((revenue) => {
          const label = revenue.customer || revenue.title;

          return (
            <div
              key={revenue._id}
              className="grid grid-cols-[74px_minmax(0,1fr)_96px] items-center gap-4 px-1 py-4 md:grid-cols-[90px_minmax(0,1.6fr)_minmax(120px,0.9fr)_120px]"
            >
              <div className="text-sm text-muted-foreground">
                {formatDate(revenue.date, "MMM d")}
              </div>
              <div className="flex min-w-0 items-center gap-3">
                <ActivityAvatar label={label} tone="revenue" />
                <div className="min-w-0">
                  <div className="truncate text-base">{label}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {revenue.source}
                  </div>
                </div>
              </div>
              <div className="hidden truncate text-sm text-muted-foreground md:block">
                {revenue.provider}
              </div>
              <div className="text-right font-medium tabular-nums text-emerald-300">
                {formatCurrency(revenue.netAmount)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HomeDashboard() {
  const { user } = useUser();
  const now = new Date();
  const currentMonth = getMonthKey(now);
  const currentMonthLabel = getCurrentMonthLabel(now);
  const recentMonthKeys = getRecentMonthKeys(6, now);
  const currentMonthRange = getMonthDateRange(currentMonth);
  const expenseStats = useAuthenticatedQuery(api.expenses.getStats, {});
  const revenueStats = useAuthenticatedQuery(api.revenues.getStats, {});
  const currentExpenseSummary = useAuthenticatedQuery(
    api.expenses.filteredSummary,
    currentMonthRange,
  );
  const currentRevenueSummary = useAuthenticatedQuery(
    api.revenues.filteredSummary,
    currentMonthRange,
  );
  const expenses = useAuthenticatedQuery(api.expenses.list, { limit: 8 });
  const revenues = useAuthenticatedQuery(api.revenues.list, { limit: 8 });

  const viewModel = useMemo(() => {
    if (
      expenseStats === undefined ||
      revenueStats === undefined ||
      currentExpenseSummary === undefined ||
      currentRevenueSummary === undefined ||
      expenses === undefined ||
      revenues === undefined
    ) {
      return null;
    }

    const typedExpenses = expenses as ExpenseRow[];
    const typedRevenues = revenues as RevenueRow[];

    const expenseMonthly = new Map(
      expenseStats.monthlyTotals.map((month) => [month.month, month.amount]),
    );
    const revenueMonthly = new Map(
      revenueStats.monthlyTotals.map((month) => [month.month, month.netAmount]),
    );
    const expenseBars = recentMonthKeys
      .slice(-3)
      .map((month) => ({
        month,
        amount: expenseMonthly.get(month) ?? 0,
      }));
    const revenueBars = recentMonthKeys
      .slice(-3)
      .map((month) => ({
        month,
        amount: revenueMonthly.get(month) ?? 0,
      }));
    const trendData = recentMonthKeys.map((month) => {
      const moneyIn = revenueMonthly.get(month) ?? 0;
      const moneyOut = expenseMonthly.get(month) ?? 0;

      return {
        month,
        moneyIn,
        moneyOut,
        net: moneyIn - moneyOut,
      };
    });

    return {
      typedExpenses,
      typedRevenues,
      currentMonthIn: currentRevenueSummary.totalNet,
      currentMonthOut: currentExpenseSummary.totalAmount,
      topSources: currentRevenueSummary.providerTotals.map((provider) => ({
        name: provider.provider,
        amount: provider.totalNet,
        count: provider.count,
      })),
      topSpend: currentExpenseSummary.vendorTotals.map((vendor) => ({
        name: vendor.vendor,
        amount: vendor.totalAmount,
        count: vendor.count,
      })),
      expenseBars,
      revenueBars,
      trendData,
      avgRevenue3Months: average(revenueBars.map((bar) => bar.amount)),
      avgExpense3Months: average(expenseBars.map((bar) => bar.amount)),
    };
  }, [
    currentExpenseSummary,
    currentRevenueSummary,
    expenseStats,
    expenses,
    recentMonthKeys,
    revenueStats,
    revenues,
  ]);

  if (
    expenseStats === undefined ||
    revenueStats === undefined ||
    currentExpenseSummary === undefined ||
    currentRevenueSummary === undefined ||
    expenses === undefined ||
    revenues === undefined ||
    viewModel === null
  ) {
    return <DashboardSkeleton />;
  }

  const displayName =
    user?.fullName ||
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    "there";

  return (
    <div data-animate className="space-y-10">
      <header>
        <h1 className="text-3xl font-medium tracking-tight md:text-4xl">
          Welcome, {displayName}
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Expense-focused cash flow with revenue context.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <OverviewCard
          totalRevenue={revenueStats.totalNet}
          totalExpenses={expenseStats.totalAmount}
          currentMonthIn={viewModel.currentMonthIn}
          currentMonthOut={viewModel.currentMonthOut}
          trendData={viewModel.trendData}
        />
        <FocusCard
          expenseCount={expenseStats.total}
          revenueCount={revenueStats.total}
          avgExpense={expenseStats.avgAmount}
          thisMonthSpend={viewModel.currentMonthOut}
        />
      </div>

      <section className="space-y-5">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-medium tracking-tight">
            Money movement
          </h2>
          <div className="flex items-center gap-2 text-muted-foreground">
            <ChevronLeft className="h-4 w-4" />
            <CalendarDays className="h-4 w-4" />
            {currentMonthLabel}
            <ChevronRight className="h-4 w-4" />
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <MovementCard
            title="Money in"
            amount={viewModel.currentMonthIn}
            items={viewModel.topSources}
            averageLabel="Last 3 months average"
            averageAmount={viewModel.avgRevenue3Months}
            bars={viewModel.revenueBars}
            tone="in"
            href="/revenue"
          />
          <MovementCard
            title="Money out"
            amount={viewModel.currentMonthOut}
            items={viewModel.topSpend}
            averageLabel="Last 3 months average"
            averageAmount={viewModel.avgExpense3Months}
            bars={viewModel.expenseBars}
            tone="out"
            href="/expenses"
          />
        </div>
      </section>

      <Card className="rounded-2xl bg-card/80 py-0 shadow-none">
        <Tabs defaultValue="expenses" className="gap-0">
          <CardHeader className="px-7 pt-7">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-2xl font-medium tracking-tight">
                  Activity
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Recent expense and revenue rows
                </p>
              </div>
              <TabsList className="h-10 rounded-full bg-muted p-1">
                <TabsTrigger value="expenses" className="rounded-full px-4">
                  Expenses
                </TabsTrigger>
                <TabsTrigger value="revenue" className="rounded-full px-4">
                  Revenue
                </TabsTrigger>
              </TabsList>
            </div>
          </CardHeader>
          <CardContent className="px-7 pb-7">
            <TabsContent value="expenses" className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Search className="h-4 w-4" />
                  Last {Math.min(viewModel.typedExpenses.length, 8)} expense
                  rows
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  render={<Link href="/expenses" />}
                  nativeButton={false}
                >
                  View all
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
              <ExpenseRows rows={viewModel.typedExpenses.slice(0, 8)} />
            </TabsContent>

            <TabsContent value="revenue" className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CircleDollarSign className="h-4 w-4" />
                  Last {Math.min(viewModel.typedRevenues.length, 8)} revenue
                  rows
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  render={<Link href="/revenue" />}
                  nativeButton={false}
                >
                  View all
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
              <RevenueRows rows={viewModel.typedRevenues.slice(0, 8)} />
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}
