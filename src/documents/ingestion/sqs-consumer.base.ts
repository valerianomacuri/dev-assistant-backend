import {
  DeleteMessageCommand,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
} from "@aws-sdk/client-sqs";
import type { SQSClient } from "@aws-sdk/client-sqs";
import {
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

/**
 * Base de un consumidor SQS por long-polling, ejecutado dentro del propio
 * proceso NestJS. Arranca el bucle en `onModuleInit` y lo detiene en
 * `onModuleDestroy`.
 *
 * Contrato de borrado: si `handle()` retorna sin lanzar, el mensaje se borra.
 * Si lanza, NO se borra → SQS lo reintenta tras el visibility timeout y, tras
 * `maxReceiveCount`, lo deriva a la DLQ. Por eso los fallos "permanentes"
 * (archivo corrupto, etc.) deben manejarse DENTRO de `handle()` (marcar el
 * documento como `failed` y retornar normal), reservando el throw para fallos
 * transitorios de infraestructura.
 */
export abstract class SqsConsumer<T> implements OnModuleInit, OnModuleDestroy {
  protected readonly logger: Logger;
  private queueUrl?: string;
  private running = false;

  protected constructor(
    private readonly sqs: SQSClient,
    private readonly queueName: string,
    loggerContext: string,
  ) {
    this.logger = new Logger(loggerContext);
  }

  /** Procesa un mensaje ya parseado. Ver contrato de borrado en la clase. */
  protected abstract handle(message: T): Promise<void>;

  onModuleInit(): void {
    this.running = true;
    // No await: el bucle vive en background mientras la app esté arriba.
    void this.loop();
  }

  onModuleDestroy(): void {
    this.running = false;
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        const url = await this.ensureQueueUrl();
        const { Messages } = await this.sqs.send(
          new ReceiveMessageCommand({
            QueueUrl: url,
            MaxNumberOfMessages: 1,
            WaitTimeSeconds: 20, // long-polling
          }),
        );
        for (const msg of Messages ?? []) {
          await this.process(url, msg.Body, msg.ReceiptHandle);
        }
      } catch (error) {
        // Error de infra (cola aún no creada, problema de red transitorio, etc.):
        // espera y reintenta sin tumbar el proceso.
        this.logger.warn(
          `Error en el bucle de ${this.queueName}: ${String(error)}`,
        );
        await sleep(2000);
      }
    }
  }

  private async process(
    queueUrl: string,
    body: string | undefined,
    receiptHandle: string | undefined,
  ): Promise<void> {
    if (!body || !receiptHandle) return;
    let parsed: T;
    try {
      parsed = JSON.parse(body) as T;
    } catch {
      this.logger.error(`Mensaje no-JSON descartado en ${this.queueName}`);
      await this.delete(queueUrl, receiptHandle); // veneno: bórralo
      return;
    }
    try {
      await this.handle(parsed);
      await this.delete(queueUrl, receiptHandle);
    } catch (error) {
      // Transitorio: NO se borra → reintento vía visibility timeout → DLQ.
      this.logger.error(
        `Fallo procesando mensaje de ${this.queueName} (se reintentará): ${String(error)}`,
      );
    }
  }

  private async delete(
    queueUrl: string,
    receiptHandle: string,
  ): Promise<void> {
    await this.sqs.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );
  }

  private async ensureQueueUrl(): Promise<string> {
    if (this.queueUrl) return this.queueUrl;
    const { QueueUrl } = await this.sqs.send(
      new GetQueueUrlCommand({ QueueName: this.queueName }),
    );
    if (!QueueUrl) throw new Error(`Cola SQS no encontrada: ${this.queueName}`);
    this.queueUrl = QueueUrl;
    return QueueUrl;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
