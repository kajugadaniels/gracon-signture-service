import { Global, Module } from '@nestjs/common';
import { ForeignIdentityClient } from './foreign-identity.client';

@Global()
@Module({
  providers: [ForeignIdentityClient],
  exports: [ForeignIdentityClient],
})
export class ForeignIdentityModule {}
