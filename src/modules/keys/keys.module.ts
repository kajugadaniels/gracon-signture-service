import { Module } from '@nestjs/common';
import { KeysController } from './keys.controller';
import { KeysService } from './keys.service';

@Module({
  controllers: [KeysController],
  providers: [KeysService],
  exports: [KeysService], // exported — used by CertificatesModule and SigningModule
})
export class KeysModule {}
