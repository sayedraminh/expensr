"use client";

import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { useAuthenticatedQuery } from "@/hooks/use-authenticated-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface ExpenseFormData {
  _id?: Id<"expenses">;
  title: string;
  amount: number;
  date: string;
  categoryId?: Id<"categories"> | null;
  paymentMethodId?: Id<"paymentMethods"> | null;
  vendor?: string;
  notes?: string;
}

interface ExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: ExpenseFormData | null;
}

export function ExpenseDialog({
  open,
  onOpenChange,
  expense,
}: ExpenseDialogProps) {
  const categories = useAuthenticatedQuery(api.categories.list, {});
  const paymentMethods = useAuthenticatedQuery(api.paymentMethods.list, {});
  const createExpense = useMutation(api.expenses.create);
  const updateExpense = useMutation(api.expenses.update);

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [paymentMethodId, setPaymentMethodId] = useState<string>("");
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!expense?._id;

  useEffect(() => {
    if (open) {
      if (expense) {
        setTitle(expense.title || "");
        setAmount(expense.amount ? String(expense.amount) : "");
        setDate(expense.date || "");
        setCategoryId(expense.categoryId || "");
        setPaymentMethodId(expense.paymentMethodId || "");
        setVendor(expense.vendor || "");
        setNotes(expense.notes || "");
      } else {
        setTitle("");
        setAmount("");
        setDate(new Date().toISOString().split("T")[0]);
        setCategoryId("");
        setPaymentMethodId("");
        setVendor("");
        setNotes("");
      }
      setError(null);
      setSubmitting(false);
    }
  }, [open, expense]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedTitle = title.trim();
    const parsedAmount = parseFloat(amount);

    if (!trimmedTitle) {
      setError("Title is required.");
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Amount must be greater than 0.");
      return;
    }
    if (!date) {
      setError("Date is required.");
      return;
    }

    setSubmitting(true);

    try {
      const fields: Record<string, unknown> = {
        title: trimmedTitle,
        amount: parsedAmount,
        date,
      };

      if (categoryId) {
        fields.categoryId = categoryId as Id<"categories">;
      }
      if (paymentMethodId) {
        fields.paymentMethodId = paymentMethodId as Id<"paymentMethods">;
      }
      if (vendor.trim()) {
        fields.vendor = vendor.trim();
      }
      if (notes.trim()) {
        fields.notes = notes.trim();
      }

      if (isEditing && expense?._id) {
        await updateExpense({
          id: expense._id,
          ...fields,
        } as Parameters<typeof updateExpense>[0]);
      } else {
        await createExpense({
          ...fields,
          source: "manual" as const,
        } as Parameters<typeof createExpense>[0]);
      }

      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Expense" : "Add Expense"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="expense-title">Title</Label>
            <Input
              id="expense-title"
              placeholder="e.g. Coffee, Groceries..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="expense-amount">Amount</Label>
              <Input
                id="expense-amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="font-mono"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="expense-date">Date</Label>
              <Input
                id="expense-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Category</Label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="flex h-8 w-full items-center rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/50 dark:bg-input/30"
              >
                <option value="">None</option>
                {categories?.map((cat) => (
                  <option key={cat._id} value={cat._id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>Payment Method</Label>
              <select
                value={paymentMethodId}
                onChange={(e) => setPaymentMethodId(e.target.value)}
                className="flex h-8 w-full items-center rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/50 dark:bg-input/30"
              >
                <option value="">None</option>
                {paymentMethods?.map((pm) => (
                  <option key={pm._id} value={pm._id}>
                    {pm.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="expense-vendor">Vendor</Label>
            <Input
              id="expense-vendor"
              placeholder="e.g. Starbucks, Amazon..."
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="expense-notes">Notes</Label>
            <Textarea
              id="expense-notes"
              placeholder="Optional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              {isEditing ? "Save Changes" : "Add Expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
