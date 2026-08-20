import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Single owner of the uploads directory.
 * Anything that reads/writes files goes through here — the LLM
 * extraction on Day 3 will use resolve() to get the absolute path
 * from a documentRef stored in the DB.
 */
@Injectable()
export class FileStorageService implements OnModuleInit {
  private readonly logger = new Logger(FileStorageService.name);
  readonly uploadsDir: string;

  constructor(config: ConfigService) {
    this.uploadsDir = path.resolve(
      config.get<string>('UPLOADS_DIR', './uploads'),
    );
  }

  onModuleInit() {
    fs.mkdirSync(this.uploadsDir, { recursive: true });
    this.logger.log(`Uploads dir: ${this.uploadsDir}`);
  }

  /**
   * Turn a documentRef (a filename or a relative path) into an
   * absolute path on disk. Absolute paths are returned as-is.
   */
  resolve(documentRef: string): string {
    if (path.isAbsolute(documentRef)) return documentRef;
    return path.join(this.uploadsDir, documentRef);
  }

  /**
   * Cheap existence check. Used by ingest to fail fast when
   * the caller gave us a path that isn't there.
   */
  async exists(documentRef: string): Promise<boolean> {
    try {
      await fs.promises.access(this.resolve(documentRef));
      return true;
    } catch {
      return false;
    }
  }
}
