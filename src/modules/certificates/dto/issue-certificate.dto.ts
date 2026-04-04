import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max } from 'class-validator';

export class IssueCertificateDto {
  @ApiPropertyOptional({
    description: 'Certificate validity in years. Default: 2.',
    default: 2,
    minimum: 1,
    maximum: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  validityYears?: number = 2;
}
