import {
  Injectable,
  Logger,
  UnprocessableEntityException,
} from "@nestjs/common";
import * as fs from "fs";

export interface PdfText {
  fullText: string;
  pageCount: number;
  pages: string[];
}

@Injectable()
export class PdfTextService {
  private readonly logger = new Logger(PdfTextService.name);

  async extract(absolutePath: string): Promise<PdfText> {
    const buffer = await fs.promises.readFile(absolutePath);

    // Primary: pdfjs-dist (handles the widest range of PDFs, gives per-page text).
    let result: PdfText | null = null;
    try {
      result = await this.extractWithPdfjs(buffer);
    } catch (err) {
      this.logger.warn(
        `pdfjs failed (${err instanceof Error ? err.message : err}), trying fallback parser`,
      );
    }

    // Fallback: pdf-parse. Less capable, no per-page split, but catches the
    // occasional file pdfjs trips on. Better a degraded parse than a dead job.
    if (!result) {
      try {
        result = await this.extractWithPdfParse(buffer);
        this.logger.log("Fallback parser (pdf-parse) succeeded");
      } catch (err) {
        this.logger.error(
          `Both parsers failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    if (!result) {
      throw new UnprocessableEntityException(
        "Could not extract text from PDF with any available parser",
      );
    }

    // Scan guard applies regardless of which parser produced the text.
    if (result.fullText.length < 20) {
      throw new UnprocessableEntityException(
        "PDF contains little or no extractable text (likely a scan — OCR not yet supported)",
      );
    }

    this.logger.log(
      `Extracted ${result.fullText.length} chars from ${result.pageCount} page(s)`,
    );
    return result;
  }

  private async extractWithPdfjs(buffer: Buffer): Promise<PdfText> {
    const importDynamic = new Function("m", "return import(m)");
    const pdfjs = await importDynamic("pdfjs-dist/legacy/build/pdf.mjs");
    const data = new Uint8Array(buffer);
    const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;

    const pages: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      pages.push(pageText);
    }

    return {
      fullText: pages.join("\n").trim(),
      pageCount: doc.numPages,
      pages,
    };
  }

  private async extractWithPdfParse(buffer: Buffer): Promise<PdfText> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require("pdf-parse/lib/pdf-parse.js");
    const data = await pdfParse(buffer);
    const fullText = (data.text ?? "").trim();
    // pdf-parse doesn't split pages, so we treat the whole thing as one block.
    return {
      fullText,
      pageCount: data.numpages ?? 1,
      pages: [fullText],
    };
  }
}
