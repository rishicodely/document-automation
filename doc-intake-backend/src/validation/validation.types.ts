export type FlagSeverity = "error" | "warning";

export interface FieldFlag {
  field: string; // dotted path, e.g. "total" or "line_items.0.amount"
  severity: FlagSeverity;
  code: string; // machine code, e.g. "MATH_TOTAL_MISMATCH"
  message: string; // human-readable, shown in the review UI
}

export interface ValidationResult {
  passed: boolean; // true = no flags, safe to auto-complete
  flags: FieldFlag[];
}
