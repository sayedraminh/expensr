"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import OpenAI from "openai";
import { requireUserId } from "./authHelpers";

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY environment variable is not set. Configure it in your Convex dashboard."
    );
  }
  return new OpenAI({ apiKey });
}

function parseJsonResponse(text: string): unknown {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Try extracting from markdown code blocks
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      return JSON.parse(codeBlockMatch[1].trim());
    }
    throw new Error("Failed to parse AI response as JSON");
  }
}

export const analyzeCsvMapping = action({
  args: {
    headers: v.array(v.string()),
    sampleRows: v.array(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx);

    const defaultResult = {
      mapping: {
        title: null as string | null,
        amount: null as string | null,
        date: null as string | null,
        category: null as string | null,
        vendor: null as string | null,
        paymentMethod: null as string | null,
        notes: null as string | null,
      },
      confidence: 0,
      suggestions: ["Could not analyze CSV. Please map columns manually."],
    };

    try {
      const client = getClient();

      const prompt = `Analyze these CSV headers and sample data to determine which columns map to these expense fields:
- title: The name/description of the expense
- amount: The monetary amount (numeric)
- date: The date of the expense
- category: The expense category
- vendor: The merchant/vendor name
- paymentMethod: How payment was made (credit card, cash, etc.)
- notes: Any additional notes

CSV Headers: ${JSON.stringify(args.headers)}

Sample rows (first ${args.sampleRows.length}):
${args.sampleRows.map((row) => JSON.stringify(row)).join("\n")}

Return a JSON object with:
- "mapping": object with keys (title, amount, date, category, vendor, paymentMethod, notes), each value is the CSV column header name (string) that best matches, or null if no match
- "confidence": number 0-100 indicating how confident you are in the mapping
- "suggestions": array of strings with any warnings or suggestions for the user`;

      const response = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 1000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return defaultResult;
      }

      const parsed = parseJsonResponse(content) as {
        mapping?: Record<string, string | null>;
        confidence?: number;
        suggestions?: string[];
      };

      return {
        mapping: {
          title: parsed.mapping?.title ?? null,
          amount: parsed.mapping?.amount ?? null,
          date: parsed.mapping?.date ?? null,
          category: parsed.mapping?.category ?? null,
          vendor: parsed.mapping?.vendor ?? null,
          paymentMethod: parsed.mapping?.paymentMethod ?? null,
          notes: parsed.mapping?.notes ?? null,
        },
        confidence:
          typeof parsed.confidence === "number" ? parsed.confidence : 0,
        suggestions: Array.isArray(parsed.suggestions)
          ? parsed.suggestions
          : [],
      };
    } catch (err) {
      console.error("analyzeCsvMapping failed:", err);
      return {
        ...defaultResult,
        suggestions: [
          `AI analysis failed: ${err instanceof Error ? err.message : "Unknown error"}. Please map columns manually.`,
        ],
      };
    }
  },
});

export const suggestCategories = action({
  args: {
    items: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx);

    if (args.items.length === 0) {
      return { suggestions: {} as Record<string, string> };
    }

    try {
      const client = getClient();

      const prompt = `Categorize each of these expense items into exactly one of these categories:
Food & Dining, Transportation, Shopping, Entertainment, Health, Bills & Utilities, Travel, Education, Personal, Other

Items:
${args.items.map((item, i) => `${i + 1}. ${item}`).join("\n")}

Return a JSON object with a single key "suggestions" whose value is an object mapping each item (exact string) to its category name.`;

      const response = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 2000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return { suggestions: {} as Record<string, string> };
      }

      const parsed = parseJsonResponse(content) as {
        suggestions?: Record<string, string>;
      };

      if (
        !parsed.suggestions ||
        typeof parsed.suggestions !== "object"
      ) {
        return { suggestions: {} as Record<string, string> };
      }

      // Validate that all values are from the allowed category list
      const allowedCategories = new Set([
        "Food & Dining",
        "Transportation",
        "Shopping",
        "Entertainment",
        "Health",
        "Bills & Utilities",
        "Travel",
        "Education",
        "Personal",
        "Other",
      ]);

      const validated: Record<string, string> = {};
      for (const [item, category] of Object.entries(parsed.suggestions)) {
        if (typeof category === "string" && allowedCategories.has(category)) {
          validated[item] = category;
        } else {
          validated[item] = "Other";
        }
      }

      return { suggestions: validated };
    } catch (err) {
      console.error("suggestCategories failed:", err);
      // Return "Other" for all items on failure
      const fallback: Record<string, string> = {};
      for (const item of args.items) {
        fallback[item] = "Other";
      }
      return { suggestions: fallback };
    }
  },
});

export const cleanupData = action({
  args: {
    rows: v.array(
      v.object({
        title: v.string(),
        vendor: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx);

    if (args.rows.length === 0) {
      return { cleaned: [] as { title: string; vendor: string }[] };
    }

    try {
      const client = getClient();

      const prompt = `Clean and normalize these expense records. For each entry:
- Fix abbreviations (e.g., "AMZN" -> "Amazon", "WMT" -> "Walmart")
- Fix casing to proper title case
- Clean up vendor names to their common, recognizable form
- Clean up titles to be human-readable descriptions

Input:
${JSON.stringify(args.rows)}

Return a JSON object with a single key "cleaned" containing an array of objects, each with "title" (string) and "vendor" (string) keys. Maintain the same order as the input. If the original vendor is empty or missing, infer it from the title if possible, otherwise use an empty string.`;

      const response = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 4000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return {
          cleaned: args.rows.map((r) => ({
            title: r.title,
            vendor: r.vendor ?? "",
          })),
        };
      }

      const parsed = parseJsonResponse(content) as {
        cleaned?: { title: string; vendor: string }[];
      };

      if (!Array.isArray(parsed.cleaned)) {
        return {
          cleaned: args.rows.map((r) => ({
            title: r.title,
            vendor: r.vendor ?? "",
          })),
        };
      }

      // Validate output length matches input and each item has required fields
      const cleaned = parsed.cleaned.map((item, i) => ({
        title:
          typeof item.title === "string"
            ? item.title
            : args.rows[i]?.title ?? "",
        vendor:
          typeof item.vendor === "string"
            ? item.vendor
            : args.rows[i]?.vendor ?? "",
      }));

      // If AI returned fewer items than input, pad with originals
      while (cleaned.length < args.rows.length) {
        const i = cleaned.length;
        cleaned.push({
          title: args.rows[i].title,
          vendor: args.rows[i].vendor ?? "",
        });
      }

      return { cleaned: cleaned.slice(0, args.rows.length) };
    } catch (err) {
      console.error("cleanupData failed:", err);
      // Return original data on failure
      return {
        cleaned: args.rows.map((r) => ({
          title: r.title,
          vendor: r.vendor ?? "",
        })),
      };
    }
  },
});
