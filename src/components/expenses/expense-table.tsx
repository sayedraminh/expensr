"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex";
import type { Doc, Id } from "@/convex";
import { formatCurrency, formatDate } from "@/lib/format";
import type { FilterState } from "@/components/expenses/expense-filters";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Receipt,
  Upload,
  Plus,
} from "lucide-react";
import Link from "next/link";

interface ExpenseTableProps {
  expenses: ExpenseListItem[] | undefined;
  filters: FilterState;
  onEdit: (expense: ExpenseListItem) => void;
  onAdd: () => void;
}

export type ExpenseListItem = Doc<"expenses"> & {
  categoryName: string | null;
  categoryColor: string | null;
  paymentMethodName: string | null;
};

export function ExpenseTable({
  expenses,
  filters,
  onEdit,
  onAdd,
}: ExpenseTableProps) {
  const removeExpense = useMutation(api.expenses.remove);

  const hasActiveFilters =
    filters.search !== "" ||
    filters.categoryId !== "" ||
    filters.paymentMethodId !== "" ||
    filters.startDate !== "" ||
    filters.endDate !== "";

  const handleDelete = async (id: Id<"expenses">) => {
    if (!window.confirm("Are you sure you want to delete this expense?")) {
      return;
    }
    await removeExpense({ id });
  };

  // Loading state
  if (expenses === undefined) {
    return (
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Skeleton className="h-4 w-24" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-32" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-20" />
                </TableCell>
                <TableCell>
                  <Skeleton className="ml-auto h-4 w-16" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-24" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-20" />
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

  // Empty state — no expenses at all
  if (expenses.length === 0 && !hasActiveFilters) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
        <div className="rounded-full bg-muted p-4">
          <Receipt className="size-8 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-lg font-medium">No expenses yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Import a CSV file or add expenses manually.
        </p>
        <div className="mt-6 flex gap-3">
          <Button variant="outline" render={<Link href="/import" />} nativeButton={false}>
            <Upload className="mr-1.5 size-3.5" />
            Import CSV
          </Button>
          <Button onClick={onAdd}>
            <Plus className="mr-1.5 size-3.5" />
            Add Expense
          </Button>
        </div>
      </div>
    );
  }

  // Empty state — filters active but no results
  if (expenses.length === 0 && hasActiveFilters) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
        <div className="rounded-full bg-muted p-4">
          <Receipt className="size-8 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-lg font-medium">No expenses match your filters</h3>
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
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead>Payment</TableHead>
            <TableHead className="w-[50px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {expenses.map((expense) => (
            <TableRow key={expense._id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {formatDate(expense.date)}
              </TableCell>
              <TableCell className="font-medium">{expense.title}</TableCell>
              <TableCell>
                {expense.categoryName ? (
                  <span className="inline-flex items-center gap-1.5 text-sm">
                    <span
                      className="inline-block size-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: expense.categoryColor || "#9ca3af",
                      }}
                    />
                    {expense.categoryName}
                  </span>
                ) : (
                  <span className="text-muted-foreground">&mdash;</span>
                )}
              </TableCell>
              <TableCell className="text-right font-mono font-medium">
                {formatCurrency(expense.amount)}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {expense.vendor || (
                  <span className="text-muted-foreground">&mdash;</span>
                )}
              </TableCell>
              <TableCell className="text-sm">
                {expense.paymentMethodName || (
                  <span className="text-muted-foreground">&mdash;</span>
                )}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button variant="ghost" size="icon-xs" />
                    }
                  >
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">Actions</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => onEdit(expense)}
                    >
                      <Pencil className="mr-1.5 size-3.5" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() =>
                        handleDelete(expense._id as Id<"expenses">)
                      }
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
