"use client";

import { useCallback } from "react";
import type { RevenueFieldMapping } from "@/lib/revenue-csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertCircle, ArrowLeft, ArrowRight } from "lucide-react";

interface RevenueFieldMapperProps {
  headers: string[];
  sampleRows: string[][];
  mapping: RevenueFieldMapping;
  defaultProvider: string;
  onMappingChange: (mapping: RevenueFieldMapping) => void;
  onDefaultProviderChange: (value: string) => void;
  onContinue: () => void;
  onBack: () => void;
}

const TARGET_FIELDS: {
  key: keyof RevenueFieldMapping;
  label: string;
  required: boolean;
  description: string;
}[] = [
  {
    key: "title",
    label: "Title / Description",
    required: false,
    description: "Optional. Description, plan, or a fallback revenue label.",
  },
  {
    key: "amount",
    label: "Revenue Amount",
    required: true,
    description: "Gross revenue amount to import.",
  },
  {
    key: "date",
    label: "Date",
    required: true,
    description: "Report date or transaction date.",
  },
  {
    key: "provider",
    label: "Provider Column",
    required: false,
    description: "Optional if you set a default provider below.",
  },
  {
    key: "customer",
    label: "Customer",
    required: false,
    description: "Customer email, ID, or description.",
  },
  {
    key: "fee",
    label: "Fee",
    required: false,
    description: "Processor fee for net revenue reporting.",
  },
  {
    key: "currency",
    label: "Currency",
    required: false,
    description: "Currency code, such as USD or EUR.",
  },
  {
    key: "transactionId",
    label: "Transaction ID",
    required: false,
    description: "Payment ID, invoice ID, or charge ID.",
  },
  {
    key: "notes",
    label: "Notes",
    required: false,
    description: "Optional notes or seller message.",
  },
];

export function RevenueFieldMapper({
  headers,
  sampleRows,
  mapping,
  defaultProvider,
  onMappingChange,
  onDefaultProviderChange,
  onContinue,
  onBack,
}: RevenueFieldMapperProps) {
  const requiredMissing = TARGET_FIELDS.filter(
    (field) => field.required && !mapping[field.key],
  );
  const providerMissing = !mapping.provider && defaultProvider.trim() === "";
  const canContinue = requiredMissing.length === 0 && !providerMissing;

  const handleFieldChange = useCallback(
    (field: keyof RevenueFieldMapping, value: string) => {
      onMappingChange({
        ...mapping,
        [field]: value === "" ? null : value,
      });
    },
    [mapping, onMappingChange],
  );

  const getSampleValue = (header: string | null) => {
    if (!header) return "";
    const columnIndex = headers.indexOf(header);
    if (columnIndex < 0 || !sampleRows[0]) return "";
    return sampleRows[0][columnIndex] ?? "";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Map Revenue Fields</CardTitle>
        <CardDescription>
          Match your CSV columns to revenue fields. Use the default provider when
          the CSV doesn&apos;t include a provider column.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-2 sm:max-w-sm">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Default Provider</span>
            {!mapping.provider && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                Used when no provider column is mapped
              </Badge>
            )}
          </div>
          <Input
            value={defaultProvider}
            onChange={(event) => onDefaultProviderChange(event.target.value)}
            placeholder="RevenueCat, Stripe, PayPal..."
          />
        </div>

        <div className="space-y-4">
          {TARGET_FIELDS.map((field) => {
            const currentValue = mapping[field.key];
            const sampleValue = getSampleValue(currentValue);

            return (
              <div
                key={field.key}
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="shrink-0 sm:w-48">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{field.label}</span>
                    {field.required && (
                      <span className="text-xs text-destructive">*</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {field.description}
                  </p>
                </div>

                <div className="flex flex-1 items-center gap-3">
                  <select
                    value={currentValue ?? ""}
                    onChange={(event) =>
                      handleFieldChange(field.key, event.target.value)
                    }
                    className="flex h-8 w-full items-center rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/50 dark:bg-input/30"
                  >
                    <option value="">-- Not Mapped --</option>
                    {headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>

                  {sampleValue && (
                    <span className="hidden max-w-[180px] truncate text-xs text-muted-foreground sm:inline">
                      e.g. &quot;{sampleValue}&quot;
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {(requiredMissing.length > 0 || providerMissing) && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-sm text-destructive">
              Missing required inputs:{" "}
              {[
                ...requiredMissing.map((field) => field.label),
                providerMissing ? "Default Provider or Provider Column" : null,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button onClick={onContinue} disabled={!canContinue}>
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
