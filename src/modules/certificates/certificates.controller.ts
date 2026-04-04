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
import { CertificatesService } from './certificates.service';
import { IssueCertificateDto } from './dto/issue-certificate.dto';
import { RevokeCertificateDto } from './dto/revoke-certificate.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Certificates')
@ApiBearerAuth()
@Controller('signature/certificates')
export class CertificatesController {
  constructor(private readonly service: CertificatesService) {}

  @Post('issue')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Issue an X.509 personal certificate from verified identity + active key pair',
  })
  @ApiResponse({ status: 201, description: 'Certificate issued and stored' })
  @ApiResponse({
    status: 400,
    description: 'No active key pair or no verified identity',
  })
  @ApiResponse({
    status: 409,
    description: 'Active certificate already exists',
  })
  issue(@CurrentUser() user: RequestUser, @Body() dto: IssueCertificateDto) {
    return this.service.issue(user.userId, dto);
  }

  @Get('current')
  @ApiOperation({ summary: 'Get current active certificate in PEM format' })
  @ApiResponse({
    status: 200,
    description: 'Certificate returned with validity info',
  })
  @ApiResponse({ status: 404, description: 'No active certificate' })
  getCurrent(@CurrentUser() user: RequestUser) {
    return this.service.getCurrent(user.userId);
  }

  @Post('revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke current certificate — permanent and irreversible',
  })
  @ApiResponse({ status: 200, description: 'Certificate revoked' })
  @ApiResponse({ status: 404, description: 'No active certificate to revoke' })
  revoke(@CurrentUser() user: RequestUser, @Body() dto: RevokeCertificateDto) {
    return this.service.revoke(user.userId, dto);
  }
}
