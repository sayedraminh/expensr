"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { useAuthenticatedQuery } from "@/hooks/use-authenticated-query";
import { CATEGORY_COLORS, getNextColor } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, Trash2, Plus, Loader2, Tag } from "lucide-react";

interface CategoryFormState {
  id: Id<"categories"> | null;
  name: string;
  color: string;
}

export function CategoryManager() {
  const categories = useAuthenticatedQuery(api.categories.list, {});
  const createCategory = useMutation(api.categories.create);
  const updateCategory = useMutation(api.categories.update);
  const removeCategory = useMutation(api.categories.remove);

  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState<CategoryFormState>({
    id: null,
    name: "",
    color: CATEGORY_COLORS[0],
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState<{
    id: Id<"categories">;
    name: string;
  } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openAdd = () => {
    const usedColors = categories?.map((c) => c.color) || [];
    setForm({
      id: null,
      name: "",
      color: getNextColor(usedColors),
    });
    setFormError(null);
    setShowDialog(true);
  };

  const openEdit = (cat: { _id: Id<"categories">; name: string; color: string }) => {
    setForm({
      id: cat._id,
      name: cat.name,
      color: cat.color,
    });
    setFormError(null);
    setShowDialog(true);
  };

  const openDelete = (cat: { _id: Id<"categories">; name: string }) => {
    setDeletingCategory({ id: cat._id, name: cat.name });
    setDeleteError(null);
    setShowDeleteDialog(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setFormError("Name is required.");
      return;
    }

    setSubmitting(true);
    try {
      if (form.id) {
        await updateCategory({
          id: form.id,
          name: trimmedName,
          color: form.color,
        });
      } else {
        await createCategory({
          name: trimmedName,
          color: form.color,
        });
      }
      setShowDialog(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingCategory) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await removeCategory({ id: deletingCategory.id });
      setShowDeleteDialog(false);
    } catch (err) {
      setDeleteError(
        err instanceof Error
          ? err.message
          : "Cannot delete category. It may be referenced by expenses.",
      );
    } finally {
      setDeleting(false);
    }
  };

  // Loading state
  if (categories === undefined) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="flex items-center gap-3 p-4">
              <Skeleton className="size-4 rounded-full" />
              <Skeleton className="h-4 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Empty state
  if (categories.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <div className="rounded-full bg-muted p-4">
            <Tag className="size-8 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-lg font-medium">No categories yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first category to organize expenses.
          </p>
          <Button className="mt-6" onClick={openAdd}>
            <Plus className="mr-1.5 size-3.5" />
            Create Category
          </Button>
        </div>

        {/* Add/Edit Dialog */}
        <CategoryFormDialog
          open={showDialog}
          onOpenChange={setShowDialog}
          form={form}
          onFormChange={setForm}
          onSubmit={handleSubmit}
          submitting={submitting}
          error={formError}
        />
      </>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((cat) => (
          <Card key={cat._id}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div
                  className="size-4 shrink-0 rounded-full"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="font-medium">{cat.name}</span>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => openEdit(cat)}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => openDelete(cat)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Add category card */}
        <button
          onClick={openAdd}
          className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-muted-foreground/25 p-4 text-sm text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
        >
          <Plus className="size-4" />
          Add Category
        </button>
      </div>

      {/* Add/Edit Dialog */}
      <CategoryFormDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        form={form}
        onFormChange={setForm}
        onSubmit={handleSubmit}
        submitting={submitting}
        error={formError}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Category</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deletingCategory?.name}&rdquo;?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {deleteError && (
            <p className="text-sm text-destructive">{deleteError}</p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Extracted form dialog component
function CategoryFormDialog({
  open,
  onOpenChange,
  form,
  onFormChange,
  onSubmit,
  submitting,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: CategoryFormState;
  onFormChange: (form: CategoryFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
  error: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {form.id ? "Edit Category" : "Add Category"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="cat-name">Name</Label>
            <Input
              id="cat-name"
              placeholder="e.g. Food, Transport..."
              value={form.name}
              onChange={(e) =>
                onFormChange({ ...form, name: e.target.value })
              }
              required
            />
          </div>

          <div className="grid gap-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => onFormChange({ ...form, color })}
                  className="size-7 rounded-full transition-all"
                  style={{
                    backgroundColor: color,
                    boxShadow:
                      form.color === color
                        ? `0 0 0 2px var(--color-background), 0 0 0 4px ${color}`
                        : "none",
                  }}
                >
                  <span className="sr-only">{color}</span>
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting && (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              )}
              {form.id ? "Save Changes" : "Create Category"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
