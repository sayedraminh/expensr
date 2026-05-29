"use client";

import { api } from "@/convex";
import { useAuthenticatedQuery } from "@/hooks/use-authenticated-query";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";
import type { BarShapeProps } from "recharts";
import { BarChart3, TrendingUp } from "lucide-react";

const categoryChartConfig = {
  total: { label: "Total", color: "var(--chart-1)" },
} satisfies ChartConfig;

const monthlyChartConfig = {
  amount: { label: "Amount", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function SpendingChart() {
  const stats = useAuthenticatedQuery(api.expenses.getStats, {});

  if (stats === undefined) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const categoryData = stats.categoryTotals.slice(0, 8);
  const monthlyData = stats.monthlyTotals;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Spending by Category */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            Spending by Category
          </CardTitle>
        </CardHeader>
        <CardContent>
          {categoryData.length === 0 ? (
            <div className="flex h-[300px] items-center justify-center text-muted-foreground">
              <p>No data yet</p>
            </div>
          ) : (
            <ChartContainer
              config={categoryChartConfig}
              className="h-[300px] w-full"
            >
              <BarChart
                data={categoryData}
                layout="vertical"
                margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
              >
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={100}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <XAxis
                  type="number"
                  tickFormatter={(v: number) => formatCurrency(v)}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) =>
                        formatCurrency(value as number)
                      }
                    />
                  }
                />
                <Bar
                  dataKey="total"
                  radius={[0, 4, 4, 0]}
                  fill="var(--color-total)"
                  shape={(props: BarShapeProps) => {
                    const { x, y, width, height, payload } = props;
                    const color =
                      typeof payload?.color === "string"
                        ? payload.color
                        : "var(--color-total)";
                    return (
                      <rect
                        x={x}
                        y={y}
                        width={width}
                        height={height}
                        rx={4}
                        fill={color}
                        opacity={0.85}
                      />
                    );
                  }}
                />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Monthly Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            Monthly Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyData.length === 0 ? (
            <div className="flex h-[300px] items-center justify-center text-muted-foreground">
              <p>No data yet</p>
            </div>
          ) : (
            <ChartContainer
              config={monthlyChartConfig}
              className="h-[300px] w-full"
            >
              <AreaChart
                data={monthlyData}
                margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient
                    id="monthlyGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="var(--color-amount)"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-amount)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value: string) => {
                    const [y, m] = value.split("-");
                    const date = new Date(Number(y), Number(m) - 1);
                    return date.toLocaleDateString("en-US", {
                      month: "short",
                    });
                  }}
                />
                <YAxis
                  tickFormatter={(v: number) => formatCurrency(v)}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) =>
                        formatCurrency(value as number)
                      }
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="var(--color-amount)"
                  strokeWidth={2}
                  fill="url(#monthlyGradient)"
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
