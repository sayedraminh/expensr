"use client";

import { useState, useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex";
import type { FieldMapping } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Loader2,
  AlertCircle,
} from "lucide-react";

interface FieldMapperProps {
  headers: string[];
  sampleRows: string[][];
  mapping: FieldMapping;
  onMappingChange: (mapping: FieldMapping) => void;
  onContinue: () => void;
  onBack: () => void;
}

const TARGET_FIELDS: {
  key: keyof FieldMapping;
  label: string;
  required: boolean;
  description: string;
}[] = [
  {
    key: "title",
    label: "Title / Description",
    required: false,
    description: "Optional. If omitted, vendor or a default title will be used",
  },
  {
    key: "amount",
    label: "Amount",
    required: true,
    description: "The monetary value",
  },
  {
    key: "date",
    label: "Date",
    required: true,
    description: "When the expense occurred",
  },
  {
    key: "category",
    label: "Category",
    required: false,
    description: "Expense category",
  },
  {
    key: "vendor",
    label: "Vendor / Merchant",
    required: false,
    description: "Where the purchase was made",
  },
  {
    key: "paymentMethod",
    label: "Payment Method",
    required: false,
    description: "How the expense was paid",
  },
  {
    key: "notes",
    label: "Notes",
    required: false,
    description: "Additional information",
  },
];


export function FieldMapper({
  headers,
  sampleRows,
  mapping,
  onMappingChange,
  onContinue,
  onBack,
}: FieldMapperProps) {
  const analyzeCsvMapping = useAction(api.aiActions.analyzeCsvMapping);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMappedFields, setAiMappedFields] = useState<Set<string>>(new Set());
  const [aiError, setAiError] = useState<string | null>(null);

  const requiredMissing = TARGET_FIELDS.filter(
    (f) => f.required && !mapping[f.key]
  );
  const canContinue = requiredMissing.length === 0;

  const handleFieldChange = useCallback(
    (field: keyof FieldMapping, value: string) => {
      const newValue = value === "" ? null : value;
      onMappingChange({ ...mapping, [field]: newValue });
      // Remove from AI-mapped set when manually changed
      setAiMappedFields((prev) => {
        const next = new Set(prev);
        next.delete(field);
        return next;
      });
    },
    [mapping, onMappingChange]
  );

  const handleAiSuggestions = useCallback(async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await analyzeCsvMapping({
        headers,
        sampleRows: sampleRows.slice(0, 5),
      });

      const newMapping = { ...mapping };
      const newAiFields = new Set<string>();

      for (const [key, value] of Object.entries(result.mapping)) {
        const fieldKey = key as keyof FieldMapping;
        if (value && headers.includes(value)) {
          newMapping[fieldKey] = value;
          newAiFields.add(fieldKey);
        }
      }

      onMappingChange(newMapping);
      setAiMappedFields(newAiFields);
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : "AI analysis failed. Please map columns manually."
      );
    } finally {
      setAiLoading(false);
    }
  }, [analyzeCsvMapping, headers, sampleRows, mapping, onMappingChange]);

  // Get sample value for a given header
  const getSampleValue = (header: string | null): string => {
    if (!header) return "";
    const colIndex = headers.indexOf(header);
    if (colIndex < 0 || !sampleRows[0]) return "";
    return sampleRows[0][colIndex] ?? "";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Map Fields</CardTitle>
        <CardDescription>
          Match your CSV columns to expense fields
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* AI Suggestions Button */}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleAiSuggestions}
            disabled={aiLoading}
          >
            {aiLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {aiLoading ? "Analyzing..." : "Get AI Suggestions"}
          </Button>
          {aiError && (
            <p className="text-sm text-destructive">{aiError}</p>
          )}
        </div>

        {/* Field Mapping Rows */}
        <div className="space-y-4">
          {TARGET_FIELDS.map((field) => {
            const currentValue = mapping[field.key];
            const sampleVal = getSampleValue(currentValue);

            return (
              <div
                key={field.key}
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="sm:w-48 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{field.label}</span>
                    {field.required && (
                      <span className="text-xs text-destructive">*</span>
                    )}
                    {aiMappedFields.has(field.key) && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                        AI
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {field.description}
                  </p>
                </div>

                <div className="flex-1 flex items-center gap-3">
                  <select
                    value={currentValue ?? ""}
                    onChange={(e) =>
                      handleFieldChange(field.key, e.target.value)
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

                  {sampleVal && (
                    <span className="hidden sm:inline text-xs text-muted-foreground truncate max-w-[160px]">
                      e.g. &quot;{sampleVal}&quot;
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Validation Warning */}
        {requiredMissing.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <p className="text-sm text-destructive">
              Required fields not mapped:{" "}
              {requiredMissing.map((f) => f.label).join(", ")}
            </p>
          </div>
        )}

        {/* Actions */}
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
