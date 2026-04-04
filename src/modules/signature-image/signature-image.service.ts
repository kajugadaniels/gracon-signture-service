import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../common/prisma/prisma.service';
import { S3Service } from '../../common/s3/s3.service';

const ALLOWED_MIME_TYPES = ['image/png', 'image/svg+xml'];
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

@Injectable()
export class SignatureImageService {
  private readonly logger = new Logger(SignatureImageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  async upload(userId: string, file: Express.Multer.File) {
    // Validate mime type
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Only PNG and SVG files are accepted.');
    }

    // Validate size
    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException('File must be smaller than 2MB.');
    }

    const ext = file.mimetype === 'image/svg+xml' ? 'svg' : 'png';
    const s3Key = `signature-images/${userId}/${uuidv4()}.${ext}`;

    // Upload to S3 first — if this fails we don't touch the DB
    await this.s3.upload(s3Key, file.buffer, file.mimetype);

    // Soft-delete any existing active image
    await this.prisma.personalSignatureImage.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });

    // Create new active record
    const image = await this.prisma.personalSignatureImage.create({
      data: {
        userId,
        s3Key,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        isActive: true,
      },
    });

    return {
      id: image.id,
      mimeType: image.mimeType,
      sizeBytes: image.sizeBytes,
      createdAt: image.createdAt,
    };
  }

  async get(userId: string) {
    const image = await this.prisma.personalSignatureImage.findFirst({
      where: { userId, isActive: true },
    });

    if (!image) {
      throw new NotFoundException(
        'No active signature image found. Upload one first.',
      );
    }

    // Presigned URL — 1 hour expiry, raw S3 key never returned
    const url = await this.s3.getPresignedUrl(image.s3Key, 3600);

    return {
      id: image.id,
      url,
      mimeType: image.mimeType,
      sizeBytes: image.sizeBytes,
      expiresIn: 3600,
      createdAt: image.createdAt,
    };
  }

  async delete(userId: string) {
    const image = await this.prisma.personalSignatureImage.findFirst({
      where: { userId, isActive: true },
    });

    if (!image) {
      throw new NotFoundException('No active signature image found.');
    }

    // Soft delete — record stays, isActive = false
    await this.prisma.personalSignatureImage.update({
      where: { id: image.id },
      data: { isActive: false },
    });

    return { message: 'Signature image removed successfully.' };
  }
}
