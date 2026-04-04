import { Module } from '@nestjs/common';
import { SigningController } from './signing.controller';
import { SigningService } from './signing.service';
import { KeysModule } from '../keys/keys.module';

@Module({
  imports: [KeysModule],
  controllers: [SigningController],
  providers: [SigningService],
})
export class SigningModule {}
