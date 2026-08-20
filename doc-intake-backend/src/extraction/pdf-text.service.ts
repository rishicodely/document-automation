import {
  Injectable,
  Logger,
  UnprocessableEntityException,
} from "@nestjs/common";
import * as fs from "fs";

export interface PdfText {
  fullText: string;
  pageCount: number;
  // Per-page text, so source refs can map a value to the page it came from.
  pages: string[];
}

@Injectable()
export class PdfTextService {
  private readonly logger = new Logger(PdfTextService.name);

  async extract(absolutePath: string): Promise<PdfText> {
    // pdfjs-dist is ESM-only; a dynamic import keeps it working under
    // our CommonJS build without switching the whole project to ESM.
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

    const data = new Uint8Array(await fs.promises.readFile(absolutePath));
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

    const fullText = pages.join("\n").trim();

    // A text PDF yields real text; a scan yields almost nothing.
    // That's our signal to reject here rather than send noise to the LLM.
    // (OCR for scans is parked; this is where it'd slot in later.)
    if (fullText.length < 20) {
      throw new UnprocessableEntityException(
        "PDF contains little or no extractable text (likely a scan — OCR not yet supported)",
      );
    }

    this.logger.log(
      `Extracted ${fullText.length} chars from ${doc.numPages} page(s)`,
    );
    return { fullText, pageCount: doc.numPages, pages };
  }
}
