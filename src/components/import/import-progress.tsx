"use client";

import { useState, useCallback } from "react";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex";
import type { Id } from "@/convex";
import type { ValidatedRow } from "@/lib/csv";
import { CATEGORY_COLORS, formatCurrency, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface ImportProgressProps {
  validatedRows: ValidatedRow[];
  onBack: () => void;
  onComplete: () => void;
  fileName: string;
}

type ImportState = "idle" | "importing" | "done" | "error";

export function ImportProgress({
  validatedRows,
  onBack,
  onComplete,
  fileName,
}: ImportProgressProps) {
  const router = useRouter();
  const createImportSession = useMutation(api.importSessions.create);
  const updateImportSession = useMutation(api.importSessions.updateProgress);
  const completeImportSession = useMutation(api.importSessions.complete);
  const failImportSession = useMutation(api.importSessions.fail);
  const bulkCreate = useMutation(api.expenses.bulkCreate);
  const getOrCreateCategory = useMutation(api.categories.getOrCreate);
  const getOrCreatePaymentMethod = useMutation(
    api.paymentMethods.getOrCreate
  );

  const [importState, setImportState] = useState<ImportState>("idle");
  const [progress, setProgress] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [showValidRows, setShowValidRows] = useState(true);
  const [showSkipped, setShowSkipped] = useState(false);
  const [excludedValidRows, setExcludedValidRows] = useState<Set<number>>(
    new Set()
  );
  const [includedSkippedRows, setIncludedSkippedRows] = useState<Set<number>>(
    new Set()
  );

  const reviewableValidRows = validatedRows.filter((r) => r.status === "valid");
  const reviewableSkippedRows = validatedRows.filter(
    (r) => r.status === "skipped"
  );
  const validRows = validatedRows.filter(
    (r) =>
      (r.status === "valid" && !excludedValidRows.has(r.rowIndex)) ||
      includedSkippedRows.has(r.rowIndex)
  );
  const skippedRows = reviewableSkippedRows.filter(
    (r) => !includedSkippedRows.has(r.rowIndex)
  );
  const errorRows = validatedRows.filter((r) => r.status === "error");
  const manuallyExcludedCount = excludedValidRows.size;

  const reviewSummary = [
    manuallyExcludedCount > 0
      ? `${manuallyExcludedCount} valid row${
          manuallyExcludedCount !== 1 ? "s" : ""
        } excluded`
      : null,
    includedSkippedRows.size > 0
      ? `${includedSkippedRows.size} skipped row${
          includedSkippedRows.size !== 1 ? "s" : ""
        } included`
      : null,
  ]
    .filter(Boolean)
    .join(" • ");

  const toggleValidRow = useCallback((rowIndex: number) => {
    setExcludedValidRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) {
        next.delete(rowIndex);
      } else {
        next.add(rowIndex);
      }
      return next;
    });
  }, []);

  const toggleSkippedRow = useCallback((rowIndex: number) => {
    setIncludedSkippedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) {
        next.delete(rowIndex);
      } else {
        next.add(rowIndex);
      }
      return next;
    });
  }, []);

  async function handleImport() {
    if (validRows.length === 0) return;

    setImportState("importing");
    setProgress(0);
    setImportError(null);

    let sessionId: Id<"importSessions"> | null = null;

    try {
      // 1. Create import session
      sessionId = await createImportSession({
        fileName,
        totalRows: validatedRows.length,
        entityType: "expense",
      });

      // 2. Resolve categories and payment methods
      const categoryCache = new Map<string, Id<"categories">>();
      const paymentMethodCache = new Map<string, Id<"paymentMethods">>();
      let colorIndex = 0;

      const resolvedExpenses: {
        title: string;
        amount: number;
        date: string;
        categoryId?: Id<"categories">;
        paymentMethodId?: Id<"paymentMethods">;
        notes?: string;
        vendor?: string;
      }[] = [];

      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i];

        let categoryId: Id<"categories"> | undefined;
        if (row.category) {
          const cached = categoryCache.get(row.category.toLowerCase());
          if (cached) {
            categoryId = cached;
          } else {
            const color =
              CATEGORY_COLORS[colorIndex % CATEGORY_COLORS.length];
            colorIndex++;
            categoryId = await getOrCreateCategory({
              name: row.category,
              color,
            });
            categoryCache.set(row.category.toLowerCase(), categoryId);
          }
        }

        let paymentMethodId: Id<"paymentMethods"> | undefined;
        if (row.paymentMethod) {
          const cached = paymentMethodCache.get(
            row.paymentMethod.toLowerCase()
          );
          if (cached) {
            paymentMethodId = cached;
          } else {
            paymentMethodId = await getOrCreatePaymentMethod({
              name: row.paymentMethod,
            });
            paymentMethodCache.set(
              row.paymentMethod.toLowerCase(),
              paymentMethodId
            );
          }
        }

        resolvedExpenses.push({
          title: row.title,
          amount: row.amount,
          date: row.date,
          categoryId,
          paymentMethodId,
          notes: row.notes,
          vendor: row.vendor,
        });

        // Update progress during resolution phase (0-50%)
        setProgress(Math.round(((i + 1) / validRows.length) * 50));
      }

      // 3. Bulk create expenses in batches
      const BATCH_SIZE = 50;
      let totalImported = 0;
      const importErrors = errorRows.map((row) => ({
        row: row.rowIndex + 1,
        message: row.error ?? "Unknown error",
      }));

      for (let i = 0; i < resolvedExpenses.length; i += BATCH_SIZE) {
        const batch = resolvedExpenses.slice(i, i + BATCH_SIZE);
        const result = await bulkCreate({
          expenses: batch,
          importSessionId: sessionId,
        });
        totalImported += result.imported;

        // Update progress during import phase (50-100%)
        const batchProgress =
          50 +
          Math.round(
            ((i + batch.length) / resolvedExpenses.length) * 50
          );
        setProgress(batchProgress);

        importErrors.push(
          ...result.errors.map((error) => ({
            row: batch[error.row - 1]
              ? validRows[i + error.row - 1].rowIndex + 1
              : error.row,
            message: error.message,
          })),
        );
      }

      await updateImportSession({
        id: sessionId,
        importedRows: totalImported,
        skippedRows: skippedRows.length + manuallyExcludedCount,
        errorRows: importErrors.length,
        errors: importErrors.length > 0 ? importErrors : undefined,
      });

      // 4. Complete import session
      await completeImportSession({ id: sessionId });

      setImportedCount(totalImported);
      setProgress(100);
      setImportState("done");
    } catch (err) {
      if (sessionId) {
        try {
          await failImportSession({ id: sessionId });
        } catch {
          // best effort
        }
      }
      setImportError(
        err instanceof Error ? err.message : "An error occurred during import"
      );
      setImportState("error");
    }
  }

  // Import complete state
  if (importState === "done") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-primary/10 p-4 mb-4">
            <CheckCircle2 className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Import Successful</h2>
          <p className="text-muted-foreground mt-2 mb-1">
            <span className="font-mono font-medium text-foreground">
              {importedCount}
            </span>{" "}
            expense{importedCount !== 1 ? "s" : ""} imported from{" "}
            <span className="font-medium text-foreground">{fileName}</span>
          </p>
          {skippedRows.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {skippedRows.length} row{skippedRows.length !== 1 ? "s" : ""} skipped
              because they were not expenses
            </p>
          )}
          {manuallyExcludedCount > 0 && (
            <p className="text-sm text-muted-foreground">
              {manuallyExcludedCount} valid row
              {manuallyExcludedCount !== 1 ? "s" : ""} excluded before import
            </p>
          )}
          {errorRows.length > 0 && (
            <p className="text-sm text-muted-foreground mb-4">
              {errorRows.length} row{errorRows.length !== 1 ? "s" : ""} skipped
              due to errors
            </p>
          )}
          <div className="flex items-center gap-3 mt-4">
            <Button onClick={() => router.push("/expenses")}>
              View Expenses
            </Button>
            <Button variant="outline" onClick={onComplete}>
              Import Another
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review & Import</CardTitle>
        <CardDescription>
          Review validation results before importing
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="flex items-center gap-3 rounded-lg border p-4">
            <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="text-sm font-medium">
                {validRows.length} valid row
                {validRows.length !== 1 ? "s" : ""} ready to import
              </p>
              <p className="text-xs text-muted-foreground">
                {reviewSummary || "These rows passed all validation checks"}
              </p>
            </div>
          </div>

          {skippedRows.length > 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-200">
                  {skippedRows.length} row{skippedRows.length !== 1 ? "s" : ""}{" "}
                  skipped
                </p>
                <p className="text-xs text-muted-foreground">
                  Incoming transactions, transfers, or failed payments
                  won&apos;t be imported unless you include them below
                </p>
              </div>
            </div>
          )}

          {errorRows.length > 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <XCircle className="h-5 w-5 text-destructive shrink-0" />
              <div>
                <p className="text-sm font-medium text-destructive">
                  {errorRows.length} row{errorRows.length !== 1 ? "s" : ""}{" "}
                  with errors
                </p>
                <p className="text-xs text-muted-foreground">
                  These rows will be skipped during import
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Import Details (collapsible) */}
        {reviewableValidRows.length > 0 && (
          <div>
            <button
              onClick={() => setShowValidRows(!showValidRows)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {showValidRows ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              {showValidRows ? "Hide" : "Show"} import details (
              {reviewableValidRows.length})
            </button>

            {showValidRows && (
              <div className="mt-3 max-h-[320px] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Row #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Transaction</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="w-[120px] text-right">
                        Action
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reviewableValidRows.map((row) => {
                      const isExcluded = excludedValidRows.has(row.rowIndex);

                      return (
                        <TableRow
                          key={row.rowIndex}
                          className={isExcluded ? "opacity-60" : undefined}
                        >
                          <TableCell className="font-mono font-tabular text-sm">
                            {row.rowIndex + 1}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {formatDate(row.date)}
                          </TableCell>
                          <TableCell className="max-w-[260px]">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium">
                                {row.title}
                              </span>
                              {isExcluded && (
                                <Badge
                                  variant="secondary"
                                  className="h-5 px-1.5 text-[10px]"
                                >
                                  Excluded
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatCurrency(row.amount)}
                          </TableCell>
                          <TableCell className="max-w-[180px] truncate text-sm text-muted-foreground">
                            {row.vendor || "—"}
                          </TableCell>
                          <TableCell className="max-w-[160px] truncate text-sm text-muted-foreground">
                            {row.category || "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant={isExcluded ? "secondary" : "outline"}
                              size="sm"
                              onClick={() => toggleValidRow(row.rowIndex)}
                            >
                              {isExcluded ? "Include" : "Exclude"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {/* Skipped Details (collapsible) */}
        {reviewableSkippedRows.length > 0 && (
          <div>
            <button
              onClick={() => setShowSkipped(!showSkipped)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {showSkipped ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              {showSkipped ? "Hide" : "Show"} skipped details (
              {reviewableSkippedRows.length})
            </button>

            {showSkipped && (
              <div className="mt-3 max-h-[250px] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Row #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Transaction</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="w-[120px] text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reviewableSkippedRows.map((row) => {
                      const isIncluded = includedSkippedRows.has(row.rowIndex);

                      return (
                        <TableRow key={row.rowIndex}>
                          <TableCell className="font-mono font-tabular text-sm">
                            {row.rowIndex + 1}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {row.date ? formatDate(row.date) : "—"}
                          </TableCell>
                          <TableCell className="max-w-[260px]">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium">
                                {row.title}
                              </span>
                              {isIncluded && (
                                <Badge
                                  variant="secondary"
                                  className="h-5 px-1.5 text-[10px]"
                                >
                                  Included
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatCurrency(row.amount)}
                          </TableCell>
                          <TableCell className="max-w-[180px] truncate text-sm text-muted-foreground">
                            {row.vendor || "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {row.skipReason}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant={isIncluded ? "outline" : "secondary"}
                              size="sm"
                              onClick={() => toggleSkippedRow(row.rowIndex)}
                            >
                              {isIncluded ? "Skip Again" : "Include"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {/* Error Details (collapsible) */}
        {errorRows.length > 0 && (
          <div>
            <button
              onClick={() => setShowErrors(!showErrors)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {showErrors ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              {showErrors ? "Hide" : "Show"} error details
            </button>

            {showErrors && (
              <div className="mt-3 max-h-[250px] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Row #</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {errorRows.map((row) => (
                      <TableRow key={row.rowIndex}>
                        <TableCell className="font-mono font-tabular text-sm">
                          {row.rowIndex + 1}
                        </TableCell>
                        <TableCell className="text-sm text-destructive">
                          {row.error}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {/* Progress Bar (during import) */}
        {(importState === "importing") && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm font-medium">
                Importing expenses...
              </span>
              <span className="text-sm text-muted-foreground font-mono ml-auto">
                {progress}%
              </span>
            </div>
            <Progress value={progress} />
          </div>
        )}

        {/* Import Error */}
        {importState === "error" && importError && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-4">
            <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-destructive">
                Import failed
              </p>
              <p className="text-sm text-destructive/80 mt-1">
                {importError}
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            onClick={onBack}
            disabled={importState === "importing"}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          {importState === "idle" && (
            <Button
              onClick={handleImport}
              disabled={validRows.length === 0}
            >
              Import {validRows.length} Expense
              {validRows.length !== 1 ? "s" : ""}
            </Button>
          )}

          {importState === "error" && (
            <Button onClick={handleImport}>Retry Import</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
