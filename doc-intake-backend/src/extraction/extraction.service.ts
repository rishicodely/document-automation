import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import {
  InvoiceExtractionSchema,
  InvoiceExtraction,
} from "./extraction.schema";
import { PdfTextService } from "./pdf-text.service";

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly maxRetries: number;

  constructor(
    config: ConfigService,
    private readonly pdfText: PdfTextService,
  ) {
    this.client = new OpenAI({
      apiKey: config.getOrThrow<string>("OPENAI_API_KEY"),
      maxRetries: 0, // we handle retries ourselves so we can log + backoff explicitly
    });
    this.model = config.get<string>("OPENAI_MODEL", "gpt-4o-2024-08-06");
    this.maxRetries = config.get<number>("EXTRACTION_MAX_RETRIES", 3);
  }

  async extractInvoice(absolutePath: string): Promise<InvoiceExtraction> {
    const { fullText, pageCount } = await this.pdfText.extract(absolutePath);

    const parsed = await this.callWithRetry(fullText, pageCount);

    this.logger.log(
      `Extracted invoice ${parsed.invoice_number.value} ` +
        `(${parsed.line_items.length} line items)`,
    );
    return parsed;
  }

  // Retry wrapper: exponential backoff on transient errors only.
  // Permanent errors (bad request, schema refusal) fail immediately —
  // retrying them just wastes time and money.
  private async callWithRetry(
    fullText: string,
    pageCount: number,
  ): Promise<InvoiceExtraction> {
    let lastErr: unknown;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.callOpenAI(fullText, pageCount);
      } catch (err) {
        lastErr = err;

        if (!this.isRetryable(err) || attempt === this.maxRetries) {
          break;
        }

        // Exponential backoff: 1s, 2s, 4s… with a little jitter.
        const delayMs = 2 ** (attempt - 1) * 1000 + Math.random() * 250;
        this.logger.warn(
          `Extraction attempt ${attempt} failed (${this.describe(err)}), ` +
            `retrying in ${Math.round(delayMs)}ms`,
        );
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    throw new InternalServerErrorException(
      `Extraction failed after ${this.maxRetries} attempt(s): ${this.describe(lastErr)}`,
    );
  }

  private async callOpenAI(
    fullText: string,
    pageCount: number,
  ): Promise<InvoiceExtraction> {
    const completion = await this.client.chat.completions.parse({
      model: this.model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: [
            "You are an invoice data extraction engine.",
            "Extract the requested fields from the invoice text.",
            "",
            "CONFIDENCE — calibrate honestly, do not default to a round number:",
            "- Use 0.97–1.0 ONLY when the value is explicitly labelled and unambiguous in the text.",
            "- Use 0.80–0.95 when the value is clear but you inferred formatting (e.g. reformatting a date, stripping a currency symbol).",
            "- Use 0.50–0.79 when the label is ambiguous, the value is split across lines, or you chose between candidates.",
            "- Use below 0.50 when the field is absent or you are guessing.",
            "Two different fields should rarely share the exact same confidence unless they are genuinely equally certain.",
            "",
            "SOURCE — source.text must be the EXACT substring from the document that the value came from. Do not paraphrase or reformat it.",
            "source.page is the 1-based page number. The document has",
            `${pageCount} page(s).`,
            "",
            "If a field is genuinely absent, still return it with your best guess and a confidence below 0.3 rather than inventing data.",
          ].join("\n"),
        },
        {
          role: "user",
          content: `Invoice text:\n\n${fullText}`,
        },
      ],
      response_format: zodResponseFormat(
        InvoiceExtractionSchema,
        "invoice_extraction",
      ),
    });

    const parsed = completion.choices[0]?.message?.parsed;
    if (!parsed) {
      const refusal = completion.choices[0]?.message?.refusal;
      // A refusal is permanent — mark it non-retryable by throwing a plain error
      // that isRetryable() will reject.
      throw new PermanentExtractionError(
        refusal
          ? `Model refused: ${refusal}`
          : "Extraction returned no parsed result",
      );
    }
    return parsed;
  }

  // Transient = worth retrying: rate limits, timeouts, 5xx, network blips.
  private isRetryable(err: unknown): boolean {
    if (err instanceof PermanentExtractionError) return false;
    if (err instanceof OpenAI.APIError) {
      const status = err.status ?? 0;
      return status === 429 || status >= 500;
    }
    // Network errors (no status) — retry.
    return true;
  }

  private describe(err: unknown): string {
    if (err instanceof OpenAI.APIError) return `${err.status} ${err.name}`;
    if (err instanceof Error) return err.message;
    return String(err);
  }
}

// Sentinel for errors that must not be retried.
class PermanentExtractionError extends Error {}
