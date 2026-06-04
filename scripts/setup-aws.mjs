/**
 * Provisiona las colas SQS de la ingesta en AWS:
 *   doc-chunking / doc-embeddings + sus DLQ (RedrivePolicy con maxReceiveCount=3).
 *
 * Uso:
 *   node scripts/setup-aws.mjs
 *
 * Credenciales/región: se toman de la cadena por defecto del SDK de AWS
 * (variables de entorno, perfil o rol). `AWS_ENDPOINT` solo se pasa si está
 * definido (útil si en algún momento se apunta a un endpoint alternativo).
 *
 * Idempotente: re-ejecutarlo no falla si las colas ya existen.
 */
import "dotenv/config";
import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  SetQueueAttributesCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const ENDPOINT = process.env.AWS_ENDPOINT;

const CHUNKING_QUEUE =
  process.env.SQS_CHUNKING_QUEUE ?? "dev-assistant-jobs-doc-chunking";
const EMBEDDINGS_QUEUE =
  process.env.SQS_EMBEDDINGS_QUEUE ?? "dev-assistant-jobs-doc-embeddings";

const sqs = new SQSClient({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  ...(ENDPOINT ? { endpoint: ENDPOINT } : {}),
});

async function getQueueArn(queueUrl) {
  const { Attributes } = await sqs.send(
    new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: ["QueueArn"],
    }),
  );
  return Attributes.QueueArn;
}

async function ensureQueue(name, attributes) {
  // CreateQueue es idempotente para el mismo nombre; los atributos se aplican
  // por separado con SetQueueAttributes para evitar conflictos al re-ejecutar.
  const { QueueUrl } = await sqs.send(
    new CreateQueueCommand({ QueueName: name }),
  );
  if (attributes) {
    await sqs.send(
      new SetQueueAttributesCommand({ QueueUrl, Attributes: attributes }),
    );
  }
  return QueueUrl;
}

async function setupQueuePair(mainName) {
  const dlqName = `${mainName}-dlq`;
  const dlqUrl = await ensureQueue(dlqName);
  const dlqArn = await getQueueArn(dlqUrl);
  const mainUrl = await ensureQueue(mainName, {
    RedrivePolicy: JSON.stringify({
      deadLetterTargetArn: dlqArn,
      maxReceiveCount: "3",
    }),
  });
  console.log(`  ✓ ${mainName} (+ ${dlqName})`);
  return mainUrl;
}

async function main() {
  console.log(`→ Creando colas SQS en ${REGION}…`);
  await setupQueuePair(CHUNKING_QUEUE);
  await setupQueuePair(EMBEDDINGS_QUEUE);
  console.log("✅ Colas SQS listas.");
}

main().catch((error) => {
  console.error("❌ Error en el setup de SQS:", error);
  process.exit(1);
});
