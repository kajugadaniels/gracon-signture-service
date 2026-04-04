import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../../modules/auth/guards/verified-user.guard';

// Apply to any endpoint that must be accessible without authentication
// Used on: POST /api/v1/signing/verify
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
