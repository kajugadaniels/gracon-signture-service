import { Module } from '@nestjs/common';
import { CertificatesController } from './certificates.controller';
import { InternalCertificatesController } from './internal-certificates.controller';
import { CertificatesService } from './certificates.service';
import { AuthModule } from '../auth/auth.module';
import { KeysModule } from '../keys/keys.module';

@Module({
  imports: [AuthModule, KeysModule],
  controllers: [CertificatesController, InternalCertificatesController],
  providers: [CertificatesService],
  exports: [CertificatesService],
})
export class CertificatesModule {}
