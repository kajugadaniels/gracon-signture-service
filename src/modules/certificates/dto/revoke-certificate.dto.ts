import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RevokeCertificateDto {
  @ApiProperty({
    description: 'Reason for revocation — required for audit trail',
  })
  @IsString()
  @MinLength(10, {
    message:
      'Please provide a meaningful revocation reason (min 10 characters).',
  })
  reason: string;
}
