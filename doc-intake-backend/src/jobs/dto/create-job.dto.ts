import { IsNotEmpty, IsString } from 'class-validator';

export class CreateJobDto {
  @IsString()
  @IsNotEmpty()
  documentRef: string; // path or URL where the file lives

  @IsString()
  @IsNotEmpty()
  source: string; // 'email' | 'upload' | 'api' — free-form for now
}
