import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { JobStatus } from "./job-status";
import { InvoiceExtraction } from "../extraction/extraction.schema";
import { ValidationResult } from "../validation/validation.types";

@Entity("jobs")
export class Job {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({
    type: "enum",
    enum: JobStatus,
    default: JobStatus.RECEIVED,
  })
  status: JobStatus;

  @Column({ comment: "Where the document came from: email, upload, api" })
  source: string;

  @Column({ name: "document_ref", comment: "Path or URL to the stored file" })
  documentRef: string;

  @Column({ default: 0 })
  attempts: number;

  @Column({ name: "error_reason", type: "text", nullable: true })
  errorReason: string | null;

  @Column({ name: "extracted_data", type: "jsonb", nullable: true })
  extractedData: InvoiceExtraction | null;

  // The validation result: pass/fail plus the list of field flags.
  // Null until validation runs. The review UI reads flags from here.
  @Column({ name: "validation", type: "jsonb", nullable: true })
  validation: ValidationResult | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
