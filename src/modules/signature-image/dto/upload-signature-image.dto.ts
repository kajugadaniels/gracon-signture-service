import { ApiProperty } from '@nestjs/swagger';

export class UploadSignatureImageDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'PNG or SVG file — max 2MB',
  })
  file: Express.Multer.File;
}
