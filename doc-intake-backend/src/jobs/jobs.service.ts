import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Job } from "./job.entity";
import { JobStatus, isLegalTransition } from "./job-status";
import { CreateJobDto } from "./dto/create-job.dto";
import { FileStorageService } from "../storage/file-storage.service";
import { ExtractionService } from "../extraction/extraction.service";
import { ValidationService } from "../validation/validation.service";

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,
    private readonly fileStorage: FileStorageService,
    private readonly extraction: ExtractionService,
    private readonly validation: ValidationService,
  ) {}

  async create(dto: CreateJobDto): Promise<Job> {
    const job = this.jobRepo.create({
      source: dto.source,
      documentRef: dto.documentRef,
      status: JobStatus.RECEIVED,
    });
    const saved = await this.jobRepo.save(job);
    this.logger.log(`Job ${saved.id} created [${saved.status}]`);
    return saved;
  }

  async transition(
    jobId: string,
    to: JobStatus,
    errorReason?: string,
  ): Promise<Job> {
    const job = await this.jobRepo.findOneBy({ id: jobId });
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);

    if (!isLegalTransition(job.status, to)) {
      throw new BadRequestException(
        `Illegal transition: ${job.status} → ${to}`,
      );
    }

    const from = job.status;
    job.status = to;

    if (to === JobStatus.DEAD_LETTER && errorReason) {
      job.errorReason = errorReason;
    }
    if (to === JobStatus.PROCESSING) {
      job.attempts += 1;
    }

    const saved = await this.jobRepo.save(job);
    this.logger.log(`Job ${saved.id}: ${from} → ${to}`);
    return saved;
  }

  private async saveExtraction(
    jobId: string,
    data: Job["extractedData"],
  ): Promise<void> {
    await this.jobRepo.update({ id: jobId }, { extractedData: data });
  }

  private async saveValidation(
    jobId: string,
    result: Job["validation"],
  ): Promise<void> {
    await this.jobRepo.update({ id: jobId }, { validation: result });
  }

  async ingest(dto: CreateJobDto): Promise<Job> {
    const job = await this.create(dto);

    const exists = await this.fileStorage.exists(dto.documentRef);
    if (!exists) {
      const resolved = this.fileStorage.resolve(dto.documentRef);
      return this.transition(
        job.id,
        JobStatus.DEAD_LETTER,
        `Document not found at ${resolved}`,
      );
    }

    await this.transition(job.id, JobStatus.PROCESSING);

    // ── Extraction ──
    let extracted;
    try {
      const absolutePath = this.fileStorage.resolve(dto.documentRef);
      extracted = await this.extraction.extractInvoice(absolutePath);
      await this.saveExtraction(job.id, extracted);
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : "Unknown extraction error";
      this.logger.error(`Job ${job.id} extraction failed: ${reason}`);
      return this.transition(job.id, JobStatus.DEAD_LETTER, reason);
    }

    // ── Validation ──
    const result = this.validation.validate(extracted);
    await this.saveValidation(job.id, result);

    // Route on the result: any flag sends it to a human.
    if (!result.passed) {
      return this.transition(job.id, JobStatus.NEEDS_REVIEW);
    }
    return this.transition(job.id, JobStatus.DONE);
  }

  async findOne(id: string): Promise<Job> {
    const job = await this.jobRepo.findOneBy({ id });
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    return job;
  }

  async findAll(): Promise<Job[]> {
    return this.jobRepo.find({ order: { createdAt: "DESC" } });
  }
  // ── Review support ────────────────────────────────────────
  async findNeedsReview(): Promise<Job[]> {
    return this.jobRepo.find({
      where: { status: JobStatus.NEEDS_REVIEW },
      order: { createdAt: "ASC" }, // oldest first — FIFO queue
    });
  }

  // Apply reviewer corrections to the extracted data and complete the job.
  // corrections is a flat map of dotted field path -> new value,
  // e.g. { "total": 297.00, "invoice_number": "BM-5590" }
  async applyReview(
    id: string,
    corrections: Record<string, unknown>,
    approve: boolean,
  ): Promise<Job> {
    const job = await this.findOne(id);
    if (job.status !== JobStatus.NEEDS_REVIEW) {
      throw new BadRequestException(
        `Job ${id} is ${job.status}, not needs_review`,
      );
    }

    // Apply each correction onto the stored extraction. We update the
    // field's .value and stamp confidence to 1.0 — a human confirmed it.
    const data = job.extractedData as any;
    for (const [path, value] of Object.entries(corrections)) {
      const target = this.resolveFieldPath(data, path);
      if (target && typeof target === "object" && "value" in target) {
        target.value = value;
        target.confidence = 1.0;
        target.corrected = true; // provenance: a human touched this
      }
    }
    await this.saveExtraction(id, data);

    if (approve) {
      return this.transition(id, JobStatus.DONE);
    }
    return job;
  }

  // Walk a dotted path ("line_items.0.amount") to the field object.
  private resolveFieldPath(root: any, path: string): any {
    return path.split(".").reduce((acc, key) => acc?.[key], root);
  }
}
