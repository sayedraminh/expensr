"use client";

import { CategoryManager } from "@/components/categories/category-manager";

export default function CategoriesPage() {
  return (
    <div className="space-y-6" data-animate>
      <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
      <CategoryManager />
    </div>
  );
}
