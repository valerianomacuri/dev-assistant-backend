import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Injectable, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../config/configuration";

/**
 * Cliente S3 para AWS S3. En AWS real basta con la región: el endpoint se
 * resuelve solo y las credenciales se toman de la cadena por defecto del SDK
 * (rol IAM / env / perfil). `S3_ENDPOINT` y las credenciales explícitas solo se
 * pasan si están definidos (p.ej. para apuntar a un endpoint S3-compatible).
 */
@Injectable()
export class S3Service implements OnModuleInit {
  private client!: S3Client;
  private bucket!: string;

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  onModuleInit(): void {
    this.bucket = this.config.get("S3_BUCKET", { infer: true });
    const endpoint = this.config.get("S3_ENDPOINT", { infer: true });
    const accessKeyId = this.config.get("S3_ACCESS_KEY", { infer: true });
    const secretAccessKey = this.config.get("S3_SECRET_KEY", { infer: true });
    this.client = new S3Client({
      region: this.config.get("S3_REGION", { infer: true }),
      forcePathStyle: this.config.get("S3_FORCE_PATH_STYLE", { infer: true }),
      ...(endpoint ? { endpoint } : {}),
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
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

  /** Descarga un objeto y lo devuelve como Buffer. */
  async download(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) {
      throw new Error(`Objeto S3 vacío o inexistente: ${key}`);
    }
    return Buffer.from(bytes);
  }

  /** Sube un objeto JSON (patrón claim-check para handoff entre colas). */
  async uploadJson(key: string, value: unknown): Promise<void> {
    await this.upload(
      key,
      Buffer.from(JSON.stringify(value), "utf-8"),
      "application/json",
    );
  }
}
