"use client";

import { useState, useCallback } from "react";
import { parseCSVFile, autoMapHeaders, validateRow } from "@/lib/csv";
import type { FieldMapping, ParsedCSV, ValidatedRow } from "@/lib/csv";
import { UploadZone } from "@/components/import/upload-zone";
import { CsvPreview } from "@/components/import/csv-preview";
import { FieldMapper } from "@/components/import/field-mapper";
import { ImportProgress } from "@/components/import/import-progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Upload, Eye, MapPin, ClipboardCheck, PartyPopper } from "lucide-react";
import Link from "next/link";

type Step = "upload" | "preview" | "mapping" | "review" | "complete";

const steps: { key: Step; label: string; icon: React.ElementType }[] = [
  { key: "upload", label: "Upload", icon: Upload },
  { key: "preview", label: "Preview", icon: Eye },
  { key: "mapping", label: "Map Fields", icon: MapPin },
  { key: "review", label: "Import", icon: ClipboardCheck },
];

export default function ImportPage() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedCSV | null>(null);
  const [mapping, setMapping] = useState<FieldMapping>({
    title: null,
    amount: null,
    date: null,
    category: null,
    vendor: null,
    paymentMethod: null,
    notes: null,
  });
  const [validatedRows, setValidatedRows] = useState<ValidatedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  const handleFileSelected = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    setParseError(null);
    try {
      const result = await parseCSVFile(selectedFile);
      setParsed(result);
      const autoMapping = autoMapHeaders(result.headers);
      setMapping(autoMapping);
      setStep("preview");
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : "Failed to parse CSV file"
      );
    }
  }, []);

  const handlePreviewContinue = useCallback(() => {
    setStep("mapping");
  }, []);

  const handleMappingContinue = useCallback(() => {
    if (!parsed) return;
    const rows = parsed.rows.map((row, index) =>
      validateRow(row, parsed.headers, mapping, index)
    );
    setValidatedRows(rows);
    setStep("review");
  }, [parsed, mapping]);

  const handleComplete = useCallback(() => {
    setStep("complete");
  }, []);

  const handleReset = useCallback(() => {
    setFile(null);
    setParsed(null);
    setMapping({
      title: null,
      amount: null,
      date: null,
      category: null,
      vendor: null,
      paymentMethod: null,
      notes: null,
    });
    setValidatedRows([]);
    setParseError(null);
    setStep("upload");
  }, []);

  const currentStepIndex = steps.findIndex((s) => s.key === step);

  return (
    <div data-animate className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import CSV</h1>
        <p className="text-muted-foreground mt-1">
          Import expenses from a CSV file
        </p>
      </div>

      {/* Step Indicator */}
      {step !== "complete" && (
        <nav className="flex items-center gap-2">
          {steps.map((s, i) => {
            const isActive = s.key === step;
            const isCompleted = i < currentStepIndex;

            return (
              <div key={s.key} className="flex items-center gap-2">
                {i > 0 && (
                  <div
                    className={`h-px w-8 transition-colors ${
                      isCompleted ? "bg-primary" : "bg-border"
                    }`}
                  />
                )}
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : isCompleted
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <s.icon className="h-4 w-4" />
                    )}
                  </div>
                  <span
                    className={`text-sm hidden sm:inline ${
                      isActive
                        ? "font-medium text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
              </div>
            );
          })}
        </nav>
      )}

      {/* Step Content */}
      {step === "upload" && (
        <div className="space-y-4">
          <UploadZone onFileSelected={handleFileSelected} />
          {parseError && (
            <Card className="border-destructive/50">
              <CardContent className="p-4">
                <p className="text-sm text-destructive">{parseError}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {step === "preview" && parsed && (
        <CsvPreview
          parsed={parsed}
          onContinue={handlePreviewContinue}
          onBack={handleReset}
        />
      )}

      {step === "mapping" && parsed && (
        <FieldMapper
          headers={parsed.headers}
          sampleRows={parsed.rows.slice(0, 5)}
          mapping={mapping}
          onMappingChange={setMapping}
          onContinue={handleMappingContinue}
          onBack={() => setStep("preview")}
        />
      )}

      {step === "review" && file && (
        <ImportProgress
          validatedRows={validatedRows}
          onBack={() => setStep("mapping")}
          onComplete={handleComplete}
          fileName={file.name}
        />
      )}

      {step === "complete" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-primary/10 p-4 mb-4">
              <PartyPopper className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-xl font-semibold">Import Complete!</h2>
            <p className="text-muted-foreground mt-2 mb-6">
              Your expenses have been successfully imported.
            </p>
            <div className="flex items-center gap-3">
              <Button render={<Link href="/expenses" />} nativeButton={false}>
                View Expenses
              </Button>
              <Button variant="outline" onClick={handleReset}>
                Import Another
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
