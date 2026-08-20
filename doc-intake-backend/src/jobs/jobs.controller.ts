import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Res,
  NotFoundException,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { JobsService } from "./jobs.service";
import { CreateJobDto } from "./dto/create-job.dto";
import { FileStorageService } from "../storage/file-storage.service";

@Controller("jobs")
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly fileStorage: FileStorageService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateJobDto) {
    return this.jobsService.ingest(dto);
  }

  @Post("upload")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor("file"))
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file provided");
    return this.jobsService.ingest({
      documentRef: file.filename,
      source: "upload",
    });
  }

  @Get()
  async findAll() {
    return this.jobsService.findAll();
  }

  // Jobs awaiting human review — the review app's list view.
  @Get("review-queue")
  async reviewQueue() {
    return this.jobsService.findNeedsReview();
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    return this.jobsService.findOne(id);
  }

  // Stream the raw PDF so the review app can render it.
  @Get(":id/document")
  async getDocument(@Param("id") id: string, @Res() res: Response) {
    const job = await this.jobsService.findOne(id);
    const absolutePath = this.fileStorage.resolve(job.documentRef);
    if (!(await this.fileStorage.exists(job.documentRef))) {
      throw new NotFoundException("Document file not found on disk");
    }
    res.setHeader("Content-Type", "application/pdf");
    res.sendFile(absolutePath);
  }

  // Reviewer submits corrected fields and approves the job.
  @Patch(":id/review")
  async submitReview(
    @Param("id") id: string,
    @Body() body: { corrections?: Record<string, unknown>; approve?: boolean },
  ) {
    return this.jobsService.applyReview(
      id,
      body.corrections ?? {},
      body.approve ?? true,
    );
  }
}
