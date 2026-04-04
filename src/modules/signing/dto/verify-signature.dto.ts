import { IsString, IsHexadecimal, Length, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifySignatureDto {
  @ApiProperty({
    description: 'SHA-256 hex hash of the document being verified',
  })
  @IsHexadecimal()
  @Length(64, 64)
  documentHash: string;

  @ApiProperty({
    description:
      'Base64-encoded signature bytes returned from POST /signing/sign',
  })
  @IsString()
  signatureBytes: string;

  @ApiProperty({ description: 'userId of the person who signed the document' })
  @IsUUID()
  userId: string;
}
