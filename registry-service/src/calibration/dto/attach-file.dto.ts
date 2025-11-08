import { IsEnum, IsInt, IsOptional, IsPositive, IsString, Matches, MaxLength } from 'class-validator';

import { AttachmentKind } from '../certificate-attachment.entity';

export class AttachFileDto {
  @IsEnum(AttachmentKind)
  kind: AttachmentKind;

  @IsString()
  @MaxLength(200)
  filename: string;

  @IsString()
  @MaxLength(120)
  mediaType: string;

  @IsInt()
  @IsPositive()
  byteSize: number;

  @IsString()
  @Matches(/^[0-9a-f]{64}$/, { message: 'sha256 must be sixty four lower case hex characters' })
  sha256: string;

  @IsString()
  @MaxLength(400)
  storageKey: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  note?: string;
}

export interface AttachmentView {
  readonly id: number;
  readonly certificateId: number;
  readonly kind: AttachmentKind;
  readonly filename: string;
  readonly mediaType: string;
  readonly byteSize: number;
  readonly readableSize: string;
  readonly sha256: string;
  readonly shortChecksum: string;
  readonly storageKey: string;
  readonly uploadedBy: string;
  readonly uploadedAt: string;
  readonly note: string | null;
}
