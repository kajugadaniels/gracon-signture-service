import { IsString, IsHexadecimal, Length, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SignDocumentDto {
  @ApiProperty({
    description: 'SHA-256 hex hash of the document (64 hex characters)',
  })
  @IsHexadecimal()
  @Length(64, 64, {
    message: 'documentHash must be exactly 64 hex characters (SHA-256).',
  })
  documentHash: string;

  @ApiProperty({
    description: 'Human-readable document name for the audit trail',
  })
  @IsString()
  @MaxLength(255)
  documentName: string;
}
