import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { KeysService } from './keys.service';
import { GenerateKeyDto } from './dto/generate-key.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Keys')
@ApiBearerAuth()
@Controller('signature/keys')
export class KeysController {
  constructor(private readonly service: KeysService) {}

  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ strict: { limit: 3, ttl: 600_000 } })
  @ApiOperation({
    summary: 'Generate a new cryptographic key pair (RSA-2048 or Ed25519)',
  })
  @ApiResponse({
    status: 201,
    description:
      'Key pair generated — public key returned, private key never exposed',
  })
  @ApiResponse({
    status: 409,
    description: 'Active key pair already exists — use /rotate',
  })
  generate(@CurrentUser() user: RequestUser, @Body() dto: GenerateKeyDto) {
    return this.service.generate(user.userId, dto);
  }

  @Get('public')
  @ApiOperation({ summary: 'Get current active public key in PEM format' })
  @ApiResponse({ status: 200, description: 'Public key returned' })
  @ApiResponse({ status: 404, description: 'No active key pair' })
  getPublicKey(@CurrentUser() user: RequestUser) {
    return this.service.getPublicKey(user.userId);
  }

  @Post('rotate')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ strict: { limit: 2, ttl: 600_000 } })
  @ApiOperation({
    summary:
      'Rotate key pair — marks old inactive, revokes existing certificate',
  })
  @ApiResponse({
    status: 201,
    description: 'New key pair generated, old certificate revoked',
  })
  rotate(@CurrentUser() user: RequestUser, @Body() dto: GenerateKeyDto) {
    return this.service.rotate(user.userId, dto);
  }
}
