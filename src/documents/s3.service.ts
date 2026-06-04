import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Injectable, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../config/configuration";

/**
 * Cliente S3 (compatible con MinIO en dev y AWS S3 en prod).
 * El mismo código sirve para ambos cambiando endpoint/credenciales/forcePathStyle.
 */
@Injectable()
export class S3Service implements OnModuleInit {
  private client!: S3Client;
  private bucket!: string;

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  onModuleInit(): void {
    this.bucket = this.config.get("S3_BUCKET", { infer: true });
    this.client = new S3Client({
      endpoint: this.config.get("S3_ENDPOINT", { infer: true }),
      region: this.config.get("S3_REGION", { infer: true }),
      forcePathStyle: this.config.get("S3_FORCE_PATH_STYLE", { infer: true }),
      credentials: {
        accessKeyId: this.config.get("S3_ACCESS_KEY", { infer: true }),
        secretAccessKey: this.config.get("S3_SECRET_KEY", { infer: true }),
      },
    });
  }

  async upload(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}
