import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as AWS from 'aws-sdk';

@Injectable()
export class S3Service {
  private readonly s3: AWS.S3;
  private readonly bucket: string;
  private readonly logger = new Logger(S3Service.name);

  constructor(private readonly config: ConfigService) {
    this.s3 = new AWS.S3({
      region: config.get<string>('AWS_REGION'),
      accessKeyId: config.get<string>('AWS_ACCESS_KEY_ID'),
      secretAccessKey: config.get<string>('AWS_SECRET_ACCESS_KEY'),
    });
    this.bucket = config.get<string>('AWS_S3_BUCKET_NAME');
  }

  async upload(key: string, buffer: Buffer, mimeType: string): Promise<void> {
    try {
      await this.s3
        .putObject({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
          // Private — never publicly accessible
          ACL: 'private',
          ServerSideEncryption: 'AES256',
        })
        .promise();
    } catch (err) {
      this.logger.error(`S3 upload failed for key ${key}`, err);
      throw new InternalServerErrorException(
        'File upload failed. Please try again.',
      );
    }
  }

  async getPresignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    return this.s3.getSignedUrlPromise('getObject', {
      Bucket: this.bucket,
      Key: key,
      Expires: expiresInSeconds,
    });
  }

  async delete(key: string): Promise<void> {
    try {
      await this.s3.deleteObject({ Bucket: this.bucket, Key: key }).promise();
    } catch (err) {
      this.logger.error(`S3 delete failed for key ${key}`, err);
    }
  }
}
