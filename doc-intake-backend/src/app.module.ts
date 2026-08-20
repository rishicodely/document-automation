import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JobsModule } from "./jobs/jobs.module";
import { StorageModule } from "./storage/storage.module";
import { ExtractionModule } from "./extraction/extraction.module";
import { ValidationModule } from "./validation/validation.module";
import { Job } from "./jobs/job.entity";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: "postgres",
        host: cfg.get("DB_HOST", "localhost"),
        port: cfg.get<number>("DB_PORT", 5432),
        username: cfg.get("DB_USER", "postgres"),
        password: cfg.get("DB_PASS", "postgres"),
        database: cfg.get("DB_NAME", "doc_intake"),
        entities: [Job],
        synchronize: true,
      }),
    }),
    StorageModule,
    ExtractionModule,
    ValidationModule,
    JobsModule,
  ],
})
export class AppModule {}
