"use client";

import type { ParsedCSV } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, ArrowRight, FileSpreadsheet } from "lucide-react";

interface CsvPreviewProps {
  parsed: ParsedCSV;
  onContinue: () => void;
  onBack: () => void;
}

export function CsvPreview({ parsed, onContinue, onBack }: CsvPreviewProps) {
  const previewRows = parsed.rows.slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
          CSV Preview
        </CardTitle>
        <CardDescription>
          {parsed.rows.length} row{parsed.rows.length !== 1 ? "s" : ""} detected
          {" / "}
          {parsed.headers.length} column
          {parsed.headers.length !== 1 ? "s" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-h-[400px] overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center text-xs text-muted-foreground">
                  #
                </TableHead>
                {parsed.headers.map((header, i) => (
                  <TableHead key={i} className="font-semibold">
                    {header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewRows.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  <TableCell className="w-12 text-center text-xs text-muted-foreground font-tabular">
                    {rowIndex + 1}
                  </TableCell>
                  {parsed.headers.map((_, colIndex) => (
                    <TableCell key={colIndex} className="max-w-[200px] truncate">
                      {row[colIndex] ?? ""}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {parsed.rows.length > 10 && (
          <p className="text-sm text-muted-foreground text-center">
            Showing first 10 of {parsed.rows.length} rows
          </p>
        )}

        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button onClick={onContinue}>
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
