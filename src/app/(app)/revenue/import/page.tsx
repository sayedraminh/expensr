"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { parseCSVFile } from "@/lib/csv";
import {
  autoMapRevenueHeaders,
  detectRevenueProvider,
  validateRevenueRow,
  type RevenueFieldMapping,
  type ValidatedRevenueRow,
} from "@/lib/revenue-csv";
import { UploadZone } from "@/components/import/upload-zone";
import { CsvPreview } from "@/components/import/csv-preview";
import { RevenueFieldMapper } from "@/components/revenue/revenue-field-mapper";
import { RevenueImportProgress } from "@/components/revenue/revenue-import-progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  CheckCircle2,
  ClipboardCheck,
  Eye,
  MapPin,
  PartyPopper,
  Upload,
} from "lucide-react";

type Step = "upload" | "preview" | "mapping" | "review" | "complete";

const steps: { key: Step; label: string; icon: React.ElementType }[] = [
  { key: "upload", label: "Upload", icon: Upload },
  { key: "preview", label: "Preview", icon: Eye },
  { key: "mapping", label: "Map Fields", icon: MapPin },
  { key: "review", label: "Import", icon: ClipboardCheck },
];

const DEFAULT_MAPPING: RevenueFieldMapping = {
  title: null,
  amount: null,
  date: null,
  provider: null,
  customer: null,
  fee: null,
  currency: null,
  transactionId: null,
  notes: null,
};

export default function RevenueImportPage() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<Awaited<
    ReturnType<typeof parseCSVFile>
  > | null>(null);
  const [mapping, setMapping] = useState<RevenueFieldMapping>(DEFAULT_MAPPING);
  const [validatedRows, setValidatedRows] = useState<ValidatedRevenueRow[]>([]);
  const [defaultProvider, setDefaultProvider] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  const handleFileSelected = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    setParseError(null);

    try {
      const result = await parseCSVFile(selectedFile);
      setParsed(result);
      setMapping(autoMapRevenueHeaders(result.headers));
      setDefaultProvider(detectRevenueProvider(selectedFile.name, result.headers));
      setStep("preview");
    } catch (error) {
      setParseError(
        error instanceof Error ? error.message : "Failed to parse CSV file",
      );
    }
  }, []);

  const handlePreviewContinue = useCallback(() => {
    setStep("mapping");
  }, []);

  const handleMappingContinue = useCallback(() => {
    if (!parsed) return;

    const rows = parsed.rows.map((row, index) =>
      validateRevenueRow(
        row,
        parsed.headers,
        mapping,
        index,
        defaultProvider.trim() || "Imported revenue",
      ),
    );
    setValidatedRows(rows);
    setStep("review");
  }, [defaultProvider, mapping, parsed]);

  const handleComplete = useCallback(() => {
    setStep("complete");
  }, []);

  const handleReset = useCallback(() => {
    setFile(null);
    setParsed(null);
    setMapping(DEFAULT_MAPPING);
    setValidatedRows([]);
    setDefaultProvider("");
    setParseError(null);
    setStep("upload");
  }, []);

  const currentStepIndex = steps.findIndex((current) => current.key === step);

  return (
    <div className="space-y-8" data-animate>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import Revenue CSV</h1>
        <p className="mt-1 text-muted-foreground">
          Import revenue from RevenueCat, Stripe, Lemon Squeezy, PayPal, and
          similar CSV exports.
        </p>
      </div>

      {step !== "complete" && (
        <nav className="flex items-center gap-2">
          {steps.map((stepItem, index) => {
            const isActive = stepItem.key === step;
            const isCompleted = index < currentStepIndex;

            return (
              <div key={stepItem.key} className="flex items-center gap-2">
                {index > 0 && (
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
                      <stepItem.icon className="h-4 w-4" />
                    )}
                  </div>
                  <span
                    className={`hidden text-sm sm:inline ${
                      isActive
                        ? "font-medium text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {stepItem.label}
                  </span>
                </div>
              </div>
            );
          })}
        </nav>
      )}

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
        <RevenueFieldMapper
          headers={parsed.headers}
          sampleRows={parsed.rows.slice(0, 5)}
          mapping={mapping}
          defaultProvider={defaultProvider}
          onMappingChange={setMapping}
          onDefaultProviderChange={setDefaultProvider}
          onContinue={handleMappingContinue}
          onBack={() => setStep("preview")}
        />
      )}

      {step === "review" && file && (
        <RevenueImportProgress
          validatedRows={validatedRows}
          onBack={() => setStep("mapping")}
          onComplete={handleComplete}
          fileName={file.name}
        />
      )}

      {step === "complete" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 rounded-full bg-primary/10 p-4">
              <PartyPopper className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-xl font-semibold">Revenue Import Complete!</h2>
            <p className="mb-6 mt-2 text-muted-foreground">
              Your revenue entries have been imported successfully.
            </p>
            <div className="flex items-center gap-3">
              <Button render={<Link href="/revenue" />} nativeButton={false}>
                View Revenue
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
