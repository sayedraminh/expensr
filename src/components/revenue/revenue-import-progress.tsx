"use client";

import { useCallback, useState } from "react";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex";
import type { Id } from "@/convex";
import type { ValidatedRevenueRow } from "@/lib/revenue-csv";
import { formatCurrency, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  XCircle,
} from "lucide-react";

interface RevenueImportProgressProps {
  validatedRows: ValidatedRevenueRow[];
  onBack: () => void;
  onComplete: () => void;
  fileName: string;
}

type ImportState = "idle" | "importing" | "done" | "error";

export function RevenueImportProgress({
  validatedRows,
  onBack,
  onComplete,
  fileName,
}: RevenueImportProgressProps) {
  const router = useRouter();
  const createImportSession = useMutation(api.importSessions.create);
  const updateImportSession = useMutation(api.importSessions.updateProgress);
  const completeImportSession = useMutation(api.importSessions.complete);
  const failImportSession = useMutation(api.importSessions.fail);
  const bulkCreate = useMutation(api.revenues.bulkCreate);

  const [importState, setImportState] = useState<ImportState>("idle");
  const [progress, setProgress] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [showValidRows, setShowValidRows] = useState(true);
  const [showSkipped, setShowSkipped] = useState(false);
  const [excludedValidRows, setExcludedValidRows] = useState<Set<number>>(
    new Set(),
  );
  const [includedSkippedRows, setIncludedSkippedRows] = useState<Set<number>>(
    new Set(),
  );

  const reviewableValidRows = validatedRows.filter((row) => row.status === "valid");
  const reviewableSkippedRows = validatedRows.filter(
    (row) => row.status === "skipped",
  );
  const validRows = validatedRows.filter(
    (row) =>
      (row.status === "valid" && !excludedValidRows.has(row.rowIndex)) ||
      includedSkippedRows.has(row.rowIndex),
  );
  const skippedRows = reviewableSkippedRows.filter(
    (row) => !includedSkippedRows.has(row.rowIndex),
  );
  const errorRows = validatedRows.filter((row) => row.status === "error");
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
    setExcludedValidRows((previous) => {
      const next = new Set(previous);
      if (next.has(rowIndex)) {
        next.delete(rowIndex);
      } else {
        next.add(rowIndex);
      }
      return next;
    });
  }, []);

  const toggleSkippedRow = useCallback((rowIndex: number) => {
    setIncludedSkippedRows((previous) => {
      const next = new Set(previous);
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
      sessionId = await createImportSession({
        fileName,
        totalRows: validatedRows.length,
        entityType: "revenue",
      });

      const rowsToImport = validRows.map((row) => ({
        title: row.title,
        amount: row.amount,
        date: row.date,
        provider: row.provider,
        customer: row.customer,
        fee: row.fee,
        netAmount: row.netAmount,
        currency: row.currency,
        transactionId: row.transactionId,
        notes: row.notes,
      }));

      const BATCH_SIZE = 50;
      let totalImported = 0;
      const importErrors = errorRows.map((row) => ({
        row: row.rowIndex + 1,
        message: row.error ?? "Unknown error",
      }));

      for (let i = 0; i < rowsToImport.length; i += BATCH_SIZE) {
        const batch = rowsToImport.slice(i, i + BATCH_SIZE);
        const result = await bulkCreate({
          revenues: batch,
          importSessionId: sessionId,
        });

        totalImported += result.imported;
        setProgress(
          Math.round(((i + batch.length) / rowsToImport.length) * 100),
        );

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

      await completeImportSession({ id: sessionId });

      setImportedCount(totalImported);
      setProgress(100);
      setImportState("done");
    } catch (error) {
      if (sessionId) {
        try {
          await failImportSession({ id: sessionId });
        } catch {
          // best effort only
        }
      }

      setImportError(
        error instanceof Error ? error.message : "Revenue import failed",
      );
      setImportState("error");
    }
  }

  if (importState === "done") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-4 rounded-full bg-primary/10 p-4">
            <CheckCircle2 className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Revenue Import Successful</h2>
          <p className="mb-1 mt-2 text-muted-foreground">
            <span className="font-mono font-medium text-foreground">
              {importedCount}
            </span>{" "}
            revenue row{importedCount !== 1 ? "s" : ""} imported from{" "}
            <span className="font-medium text-foreground">{fileName}</span>
          </p>
          {skippedRows.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {skippedRows.length} row{skippedRows.length !== 1 ? "s" : ""} skipped
              after review
            </p>
          )}
          {manuallyExcludedCount > 0 && (
            <p className="text-sm text-muted-foreground">
              {manuallyExcludedCount} valid row
              {manuallyExcludedCount !== 1 ? "s" : ""} excluded before import
            </p>
          )}
          {errorRows.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {errorRows.length} row{errorRows.length !== 1 ? "s" : ""} skipped
              due to validation errors
            </p>
          )}
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={() => router.push("/revenue")}>View Revenue</Button>
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
          Review the revenue rows before saving them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="flex items-center gap-3 rounded-lg border p-4">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium">
                {validRows.length} row{validRows.length !== 1 ? "s" : ""} ready
                to import
              </p>
              <p className="text-xs text-muted-foreground">
                {reviewSummary || "These rows passed revenue validation"}
              </p>
            </div>
          </div>

          {skippedRows.length > 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-200">
                  {skippedRows.length} row{skippedRows.length !== 1 ? "s" : ""}{" "}
                  skipped
                </p>
                <p className="text-xs text-muted-foreground">
                  Failed, refunded, or zero-value rows stay out unless you include
                  them below
                </p>
              </div>
            </div>
          )}

          {errorRows.length > 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <XCircle className="h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p className="text-sm font-medium text-destructive">
                  {errorRows.length} row{errorRows.length !== 1 ? "s" : ""} with
                  errors
                </p>
                <p className="text-xs text-muted-foreground">
                  These rows cannot be imported until the mapping is fixed
                </p>
              </div>
            </div>
          )}
        </div>

        {reviewableValidRows.length > 0 && (
          <div>
            <button
              onClick={() => setShowValidRows(!showValidRows)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
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
                      <TableHead>Title</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">Fee</TableHead>
                      <TableHead className="text-right">Net</TableHead>
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
                          <TableCell className="max-w-[220px]">
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
                          <TableCell className="text-sm">{row.provider}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                            {row.customer || "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatCurrency(row.amount, row.currency || "USD")}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-muted-foreground">
                            {row.fee !== undefined
                              ? formatCurrency(
                                  row.fee,
                                  row.currency || "USD",
                                )
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatCurrency(
                              row.netAmount,
                              row.currency || "USD",
                            )}
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

        {reviewableSkippedRows.length > 0 && (
          <div>
            <button
              onClick={() => setShowSkipped(!showSkipped)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
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
              <div className="mt-3 max-h-[320px] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Row #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="w-[120px] text-right">
                        Action
                      </TableHead>
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
                          <TableCell className="max-w-[220px]">
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
                          <TableCell className="text-sm">{row.provider}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatCurrency(row.amount, row.currency || "USD")}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatCurrency(
                              row.netAmount,
                              row.currency || "USD",
                            )}
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

        {errorRows.length > 0 && (
          <div>
            <button
              onClick={() => setShowErrors(!showErrors)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {showErrors ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              {showErrors ? "Hide" : "Show"} error details
            </button>

            {showErrors && (
              <div className="mt-3 max-h-[240px] overflow-auto rounded-md border">
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

        {importState === "importing" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm font-medium">Importing revenue...</span>
              <span className="ml-auto font-mono text-sm text-muted-foreground">
                {progress}%
              </span>
            </div>
            <Progress value={progress} />
          </div>
        )}

        {importState === "error" && importError && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="text-sm font-medium text-destructive">
                Revenue import failed
              </p>
              <p className="mt-1 text-sm text-destructive/80">{importError}</p>
            </div>
          </div>
        )}

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
            <Button onClick={handleImport} disabled={validRows.length === 0}>
              Import {validRows.length} Revenue Row
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
