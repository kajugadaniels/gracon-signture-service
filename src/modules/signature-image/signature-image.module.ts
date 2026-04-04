import { Module } from '@nestjs/common';
import { SignatureImageController } from './signature-image.controller';
import { SignatureImageService } from './signature-image.service';

@Module({
  controllers: [SignatureImageController],
  providers: [SignatureImageService],
})
export class SignatureImageModule {}
