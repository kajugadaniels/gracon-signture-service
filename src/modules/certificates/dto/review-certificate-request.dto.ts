import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class ReviewCertificateRequestDto {
  @ApiProperty({
    example: '2e4e8f2b-1d55-4a1a-bf79-8d9f2e91d4be',
  })
  @IsUUID()
  adminId: string;

  @ApiProperty({
    example:
      'Identity verification and key ownership were reviewed by platform administration.',
    minLength: 20,
    maxLength: 500,
  })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(20)
  @MaxLength(500)
  reason: string;
}
