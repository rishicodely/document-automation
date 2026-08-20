import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod.js";
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

  constructor(
    config: ConfigService,
    private readonly pdfText: PdfTextService,
  ) {
    this.client = new OpenAI({
      apiKey: config.getOrThrow<string>("OPENAI_API_KEY"),
    });
    this.model = config.get<string>("OPENAI_MODEL", "gpt-4o-2024-08-06");
  }

  async extractInvoice(absolutePath: string): Promise<InvoiceExtraction> {
    const { fullText, pageCount } = await this.pdfText.extract(absolutePath);

    const completion = await this.client.chat.completions.parse({
      model: this.model,
      temperature: 0, // deterministic extraction — we want the same answer every time
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
      // A refusal or a truncated response lands here.
      const refusal = completion.choices[0]?.message?.refusal;
      throw new InternalServerErrorException(
        refusal
          ? `Model refused: ${refusal}`
          : "Extraction returned no parsed result",
      );
    }

    this.logger.log(
      `Extracted invoice ${parsed.invoice_number.value} ` +
        `(${parsed.line_items.length} line items)`,
    );
    return parsed;
  }
}
