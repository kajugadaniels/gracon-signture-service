import { plainToInstance } from 'class-transformer';
import {
  IsString, IsNotEmpty, IsNumber, IsIn,
  Min, Max, MinLength, validateSync,
} from 'class-validator';
import { Transform } from 'class-transformer';

class EnvironmentVariables {
  @IsIn(['development', 'production', 'test'])
  APP_ENV: string;

  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1024)
  @Max(65535)
  APP_PORT: number;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  // Shared with api/auth/ — validates tokens issued there
  @IsString()
  @MinLength(32, {
    message: 'JWT_SECRET must be at least 32 chars and match api/auth/',
  })
  JWT_SECRET: string;

  @IsString()
  @MinLength(32, {
    message:
      'SIGNATURE_ENCRYPTION_SECRET must be at least 32 chars. ' +
      'Generate: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"',
  })
  SIGNATURE_ENCRYPTION_SECRET: string;

  @IsString()
  @IsNotEmpty()
  AWS_REGION: string;

  @IsString()
  @IsNotEmpty()
  AWS_ACCESS_KEY_ID: string;

  @IsString()
  @IsNotEmpty()
  AWS_SECRET_ACCESS_KEY: string;

  @IsString()
  @IsNotEmpty()
  AWS_S3_BUCKET_NAME: string;

  @IsString()
  @IsNotEmpty()
  FRONTEND_URL: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const messages = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('\n');
    throw new Error(`[Signature Service] Environment validation failed:\n${messages}`);
  }

  return validated;
}