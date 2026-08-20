import { InvoiceExtraction } from "../extraction/extraction.schema";
import { FieldFlag } from "./validation.types";

// A field as it appears in the extraction: { value, confidence, source }
type Field = { value: unknown; confidence: number };

// ── Confidence check ──────────────────────────────────────────
// Any scalar field below the threshold gets flagged for a human look.
export function checkConfidence(
  data: InvoiceExtraction,
  threshold: number,
): FieldFlag[] {
  const flags: FieldFlag[] = [];

  const scalarFields: [string, Field][] = [
    ["invoice_number", data.invoice_number],
    ["invoice_date", data.invoice_date],
    ["vendor_name", data.vendor_name],
    ["subtotal", data.subtotal],
    ["tax", data.tax],
    ["total", data.total],
  ];

  for (const [name, field] of scalarFields) {
    if (field.confidence < threshold) {
      flags.push({
        field: name,
        severity: "warning",
        code: "LOW_CONFIDENCE",
        message: `Low extraction confidence (${field.confidence.toFixed(2)}) — verify this value`,
      });
    }
  }

  // Line-item fields too.
  data.line_items.forEach((li, i) => {
    (["description", "quantity", "unit_price", "amount"] as const).forEach(
      (key) => {
        if (li[key].confidence < threshold) {
          flags.push({
            field: `line_items.${i}.${key}`,
            severity: "warning",
            code: "LOW_CONFIDENCE",
            message: `Low confidence (${li[key].confidence.toFixed(2)}) on line ${i + 1} ${key}`,
          });
        }
      },
    );
  });

  return flags;
}

// ── Format checks ─────────────────────────────────────────────
export function checkFormats(data: InvoiceExtraction): FieldFlag[] {
  const flags: FieldFlag[] = [];

  if (
    !data.invoice_number.value ||
    `${data.invoice_number.value}`.trim() === ""
  ) {
    flags.push({
      field: "invoice_number",
      severity: "error",
      code: "MISSING_INVOICE_NUMBER",
      message: "Invoice number is empty",
    });
  }

  // Date must parse to a real calendar date.
  const dateVal = `${data.invoice_date.value}`;
  if (dateVal && Number.isNaN(Date.parse(dateVal))) {
    flags.push({
      field: "invoice_date",
      severity: "error",
      code: "BAD_DATE_FORMAT",
      message: `Date "${dateVal}" could not be parsed`,
    });
  }

  // Amounts must be non-negative numbers.
  const amountFields: [string, number][] = [
    ["subtotal", data.subtotal.value],
    ["tax", data.tax.value],
    ["total", data.total.value],
  ];
  for (const [name, val] of amountFields) {
    if (typeof val !== "number" || Number.isNaN(val) || val < 0) {
      flags.push({
        field: name,
        severity: "error",
        code: "INVALID_AMOUNT",
        message: `${name} is not a valid non-negative amount (${val})`,
      });
    }
  }

  return flags;
}

// ── Math checks ───────────────────────────────────────────────
// The core trust check: does the arithmetic hold?
export function checkMath(
  data: InvoiceExtraction,
  tolerance: number,
): FieldFlag[] {
  const flags: FieldFlag[] = [];

  const close = (a: number, b: number) => Math.abs(a - b) <= tolerance;

  // 1. Line items should sum to the subtotal.
  const lineSum = data.line_items.reduce(
    (acc, li) => acc + (li.amount.value ?? 0),
    0,
  );
  if (data.line_items.length > 0 && !close(lineSum, data.subtotal.value)) {
    flags.push({
      field: "subtotal",
      severity: "error",
      code: "MATH_SUBTOTAL_MISMATCH",
      message: `Line items sum to ${lineSum.toFixed(2)} but subtotal is ${data.subtotal.value.toFixed(2)}`,
    });
  }

  // 2. subtotal + tax should equal total.
  const expectedTotal = data.subtotal.value + data.tax.value;
  if (!close(expectedTotal, data.total.value)) {
    flags.push({
      field: "total",
      severity: "error",
      code: "MATH_TOTAL_MISMATCH",
      message: `Subtotal + tax = ${expectedTotal.toFixed(2)} but total is ${data.total.value.toFixed(2)}`,
    });
  }

  // 3. Each line: quantity × unit_price should equal amount.
  data.line_items.forEach((li, i) => {
    const expected = li.quantity.value * li.unit_price.value;
    if (!close(expected, li.amount.value)) {
      flags.push({
        field: `line_items.${i}.amount`,
        severity: "error",
        code: "MATH_LINE_MISMATCH",
        message: `Line ${i + 1}: ${li.quantity.value} × ${li.unit_price.value} = ${expected.toFixed(2)}, but amount is ${li.amount.value.toFixed(2)}`,
      });
    }
  });

  return flags;
}
