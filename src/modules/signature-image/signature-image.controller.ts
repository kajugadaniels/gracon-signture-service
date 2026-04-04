import {
  Controller,
  Post,
  Get,
  Delete,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
} from '@nestjs/swagger';
import { SignatureImageService } from './signature-image.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Signature Image')
@ApiBearerAuth()
@Controller('signature/image')
export class SignatureImageController {
  constructor(private readonly service: SignatureImageService) {}

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', { storage: undefined })) // memory storage
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload handwritten signature image (PNG or SVG, max 2MB)',
  })
  @ApiResponse({ status: 201, description: 'Image uploaded and stored in S3' })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  upload(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.upload(user.userId, file);
  }

  @Get()
  @ApiOperation({
    summary: 'Get current signature image as a 1-hour presigned S3 URL',
  })
  @ApiResponse({ status: 200, description: 'Presigned URL returned' })
  @ApiResponse({ status: 404, description: 'No active signature image' })
  get(@CurrentUser() user: RequestUser) {
    return this.service.get(user.userId);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete current signature image' })
  @ApiResponse({ status: 200, description: 'Image deactivated' })
  delete(@CurrentUser() user: RequestUser) {
    return this.service.delete(user.userId);
  }
}
