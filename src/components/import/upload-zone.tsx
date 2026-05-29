"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadZoneProps {
  onFileSelected: (file: File) => void;
}

export function UploadZone({ onFileSelected }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndSubmit = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        return;
      }
      onFileSelected(file);
    },
    [onFileSelected]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        validateAndSubmit(file);
      }
    },
    [validateAndSubmit]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        validateAndSubmit(file);
      }
      // Reset input so the same file can be selected again
      e.target.value = "";
    },
    [validateAndSubmit]
  );

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "relative flex min-h-[300px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all duration-200",
        isDragging
          ? "border-primary bg-primary/5 scale-[1.01]"
          : "border-muted-foreground/25 hover:border-muted-foreground/40 hover:bg-muted/30"
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="flex flex-col items-center gap-4 px-6 text-center">
        <div
          className={cn(
            "rounded-full p-4 transition-colors",
            isDragging ? "bg-primary/10" : "bg-muted"
          )}
        >
          {isDragging ? (
            <FileSpreadsheet className="h-10 w-10 text-primary" />
          ) : (
            <Upload className="h-10 w-10 text-muted-foreground" />
          )}
        </div>

        <div className="space-y-1.5">
          <p
            className={cn(
              "text-lg font-medium",
              isDragging ? "text-primary" : "text-foreground"
            )}
          >
            {isDragging ? "Drop your file here" : "Drag & drop your CSV file"}
          </p>
          <p className="text-sm text-muted-foreground">
            or click to browse
          </p>
        </div>

        <p className="text-xs text-muted-foreground/70">.csv files only</p>
      </div>
    </div>
  );
}
