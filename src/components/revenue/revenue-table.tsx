"use client";

import Link from "next/link";
import { useMutation } from "convex/react";
import { api } from "@/convex";
import type { Doc, Id } from "@/convex";
import { formatCurrency, formatDate } from "@/lib/format";
import type { RevenueFilterState } from "@/components/revenue/revenue-filters";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DollarSign,
  MoreHorizontal,
  Trash2,
  Upload,
} from "lucide-react";

interface RevenueTableProps {
  revenues: RevenueListItem[] | undefined;
  filters: RevenueFilterState;
}

export type RevenueListItem = Doc<"revenues">;

export function RevenueTable({ revenues, filters }: RevenueTableProps) {
  const removeRevenue = useMutation(api.revenues.remove);

  const hasActiveFilters =
    filters.search !== "" ||
    filters.provider !== "" ||
    filters.startDate !== "" ||
    filters.endDate !== "";

  const handleDelete = async (id: Id<"revenues">) => {
    if (!window.confirm("Are you sure you want to delete this revenue row?")) {
      return;
    }

    await removeRevenue({ id });
  };

  if (revenues === undefined) {
    return (
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Fee</TableHead>
              <TableHead className="text-right">Net</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Skeleton className="h-4 w-24" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-36" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-20" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-28" />
                </TableCell>
                <TableCell>
                  <Skeleton className="ml-auto h-4 w-16" />
                </TableCell>
                <TableCell>
                  <Skeleton className="ml-auto h-4 w-14" />
                </TableCell>
                <TableCell>
                  <Skeleton className="ml-auto h-4 w-16" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-8" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (revenues.length === 0 && !hasActiveFilters) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
        <div className="rounded-full bg-muted p-4">
          <DollarSign className="size-8 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-lg font-medium">No revenue yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect Stripe or import RevenueCat, Lemon Squeezy, and PayPal CSV
          exports.
        </p>
        <div className="mt-6 flex gap-3">
          <Button
            variant="outline"
            render={<Link href="/revenue/import" />}
            nativeButton={false}
          >
            <Upload className="mr-1.5 size-3.5" />
            Import Revenue CSV
          </Button>
        </div>
      </div>
    );
  }

  if (revenues.length === 0 && hasActiveFilters) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
        <div className="rounded-full bg-muted p-4">
          <DollarSign className="size-8 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-lg font-medium">No revenue matches your filters</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Try adjusting or clearing your filters.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead className="text-right">Gross</TableHead>
            <TableHead className="text-right">Fee</TableHead>
            <TableHead className="text-right">Net</TableHead>
            <TableHead className="w-[50px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {revenues.map((revenue) => (
            <TableRow key={revenue._id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {formatDate(revenue.date)}
              </TableCell>
              <TableCell className="font-medium">{revenue.title}</TableCell>
              <TableCell>{revenue.provider}</TableCell>
              <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground">
                {revenue.customer || <span>&mdash;</span>}
              </TableCell>
              <TableCell className="text-right font-mono font-medium">
                {formatCurrency(revenue.amount, revenue.currency || "USD")}
              </TableCell>
              <TableCell className="text-right font-mono text-sm text-muted-foreground">
                {revenue.fee !== undefined
                  ? formatCurrency(revenue.fee, revenue.currency || "USD")
                  : "—"}
              </TableCell>
              <TableCell className="text-right font-mono font-medium">
                {formatCurrency(revenue.netAmount, revenue.currency || "USD")}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="ghost" size="icon-xs" />}
                  >
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">Actions</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => handleDelete(revenue._id as Id<"revenues">)}
                    >
                      <Trash2 className="mr-1.5 size-3.5" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
