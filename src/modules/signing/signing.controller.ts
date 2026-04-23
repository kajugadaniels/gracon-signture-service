import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SigningService } from './signing.service';
import { SignDocumentDto } from './dto/sign-document.dto';
import { VerifySignatureDto } from './dto/verify-signature.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { RequestUser } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Signing')
@Controller('signature/signing')
export class SigningController {
  constructor(private readonly service: SigningService) {}

  @Post('sign')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @Throttle({ strict: { limit: 10, ttl: 600_000 } })
  @ApiOperation({
    summary:
      'Cryptographically sign a document hash using your active certificate',
  })
  @ApiResponse({
    status: 201,
    description: 'Signature produced and audit record written',
  })
  @ApiResponse({
    status: 400,
    description: 'No active certificate or expired certificate',
  })
  sign(@CurrentUser() user: RequestUser, @Body() dto: SignDocumentDto) {
    return this.service.sign(user.userId, dto);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @Public() // No auth — third parties must be able to verify without an account
  @ApiOperation({
    summary: 'Verify a signature — public endpoint, no authentication required',
  })
  @ApiResponse({
    status: 200,
    description: 'Verification result with signer details if valid',
  })
  verify(@Body() dto: VerifySignatureDto, @Req() req: Request) {
    return this.service.verify(dto, req.ip);
  }

  @Get('history')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get paginated signing history for the current user',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of signed documents',
  })
  getHistory(
    @CurrentUser() user: RequestUser,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.service.getHistory(user.userId, +page, +limit);
  }
}
