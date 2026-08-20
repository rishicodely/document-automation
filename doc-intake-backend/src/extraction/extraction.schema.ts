import { z } from "zod";

// A source reference: where in the document a value was found.
// Powers the "highlight in the doc" behavior in the review UI.
export const SourceRefSchema = z.object({
  page: z.number().int().describe("1-based page number the value was found on"),
  text: z
    .string()
    .describe("The exact snippet from the document containing this value"),
});

// One extracted field: the value, how confident the model is, and where it came from.
const FieldSchema = <T extends z.ZodTypeAny>(valueType: T) =>
  z.object({
    value: valueType,
    confidence: z
      .number()
      .min(0)
      .max(1)
      .describe("Model self-reported certainty, 0 to 1"),
    source: SourceRefSchema,
  });

export const LineItemSchema = z.object({
  description: FieldSchema(z.string()),
  quantity: FieldSchema(z.number()),
  unit_price: FieldSchema(z.number()),
  amount: FieldSchema(z.number()),
});

export const InvoiceExtractionSchema = z.object({
  invoice_number: FieldSchema(z.string()),
  invoice_date: FieldSchema(z.string()).describe(
    "ISO 8601 date if determinable",
  ),
  vendor_name: FieldSchema(z.string()),
  line_items: z.array(LineItemSchema),
  subtotal: FieldSchema(z.number()),
  tax: FieldSchema(z.number()),
  total: FieldSchema(z.number()),
});

export type InvoiceExtraction = z.infer<typeof InvoiceExtractionSchema>;
