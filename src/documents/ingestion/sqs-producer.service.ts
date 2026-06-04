import { GetQueueUrlCommand, SendMessageCommand } from "@aws-sdk/client-sqs";
import type { SQSClient } from "@aws-sdk/client-sqs";
import { Inject, Injectable } from "@nestjs/common";
import { SQS_CLIENT } from "../../aws/aws.module";

/**
 * Publica mensajes en colas SQS. Cachea la URL resuelta por nombre para no
 * llamar a `GetQueueUrl` en cada envío.
 */
@Injectable()
export class SqsProducerService {
  private readonly urlCache = new Map<string, string>();

  constructor(@Inject(SQS_CLIENT) private readonly sqs: SQSClient) {}

  async send(queueName: string, body: unknown): Promise<void> {
    const queueUrl = await this.resolveUrl(queueName);
    await this.sqs.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(body),
      }),
    );
  }

  private async resolveUrl(queueName: string): Promise<string> {
    const cached = this.urlCache.get(queueName);
    if (cached) return cached;
    const { QueueUrl } = await this.sqs.send(
      new GetQueueUrlCommand({ QueueName: queueName }),
    );
    if (!QueueUrl) {
      throw new Error(`Cola SQS no encontrada: ${queueName}`);
    }
    this.urlCache.set(queueName, QueueUrl);
    return QueueUrl;
  }
}
