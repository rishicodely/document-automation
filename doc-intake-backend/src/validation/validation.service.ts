import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InvoiceExtraction } from "../extraction/extraction.schema";
import { ValidationResult } from "./validation.types";
import { checkConfidence, checkFormats, checkMath } from "./checks";

@Injectable()
export class ValidationService {
  private readonly logger = new Logger(ValidationService.name);
  private readonly confidenceThreshold: number;
  private readonly moneyTolerance: number;

  constructor(config: ConfigService) {
    this.confidenceThreshold = config.get<number>("CONFIDENCE_THRESHOLD", 0.7);
    this.moneyTolerance = config.get<number>("MONEY_TOLERANCE", 0.01);
  }

  validate(data: InvoiceExtraction): ValidationResult {
    const flags = [
      ...checkFormats(data),
      ...checkMath(data, this.moneyTolerance),
      ...checkConfidence(data, this.confidenceThreshold),
    ];

    const passed = flags.length === 0;
    this.logger.log(
      `Validation ${passed ? "PASSED" : "FAILED"} — ${flags.length} flag(s)`,
    );
    return { passed, flags };
  }
}
