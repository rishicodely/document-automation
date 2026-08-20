import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { diskStorage } from 'multer';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { Job } from './job.entity';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Job]),
    // Multer writes uploaded files into UPLOADS_DIR with a
    // UUID-prefixed name to avoid collisions and to keep the
    // original name unpredictable on disk.
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        storage: diskStorage({
          destination: path.resolve(
            config.get<string>('UPLOADS_DIR', './uploads'),
          ),
          filename: (_req, file, cb) => {
            const ext = path.extname(file.originalname);
            cb(null, `${randomUUID()}${ext}`);
          },
        }),
        limits: {
          fileSize: 20 * 1024 * 1024, // 20 MB — enough for a big PDF
        },
      }),
    }),
  ],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
