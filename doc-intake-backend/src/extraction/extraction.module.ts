import { Global, Module } from "@nestjs/common";
import { ExtractionService } from "./extraction.service";
import { PdfTextService } from "./pdf-text.service";

@Global()
@Module({
  providers: [ExtractionService, PdfTextService],
  exports: [ExtractionService],
})
export class ExtractionModule {}
