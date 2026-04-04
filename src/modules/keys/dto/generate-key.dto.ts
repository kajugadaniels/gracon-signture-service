import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateKeyDto {
  @ApiProperty({
    enum: ['RSA_2048', 'ED25519'],
    description:
      'Key algorithm. RSA_2048 for maximum compatibility, ED25519 for modern systems.',
  })
  @IsIn(['RSA_2048', 'ED25519'])
  algorithm: 'RSA_2048' | 'ED25519';
}
