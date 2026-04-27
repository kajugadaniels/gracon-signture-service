import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ServiceBasicAuthService } from '../auth/service-basic-auth.service';
import { CertificatesService } from './certificates.service';
import { ReviewCertificateRequestDto } from './dto/review-certificate-request.dto';

@Public()
@ApiExcludeController()
@Controller('internal/certificate-requests')
export class InternalCertificatesController {
  constructor(
    private readonly certificatesService: CertificatesService,
    private readonly serviceBasicAuth: ServiceBasicAuthService,
  ) {}

  @Post(':requestId/approve')
  @HttpCode(HttpStatus.OK)
  approveRequest(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() dto: ReviewCertificateRequestDto,
    @Headers('authorization') authorization?: string,
  ) {
    this.serviceBasicAuth.authenticate(authorization);

    return this.certificatesService.approveRequest(
      requestId,
      dto.adminId,
      dto.reason,
    );
  }

  @Post(':requestId/reject')
  @HttpCode(HttpStatus.OK)
  rejectRequest(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() dto: ReviewCertificateRequestDto,
    @Headers('authorization') authorization?: string,
  ) {
    this.serviceBasicAuth.authenticate(authorization);

    return this.certificatesService.rejectRequest(
      requestId,
      dto.adminId,
      dto.reason,
    );
  }
}
