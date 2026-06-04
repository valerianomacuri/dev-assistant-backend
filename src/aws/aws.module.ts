import { LambdaClient } from "@aws-sdk/client-lambda";
import { SQSClient } from "@aws-sdk/client-sqs";
import { Global, Module, type Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../config/configuration";

/** Tokens de inyección de los clientes AWS compartidos. */
export const SQS_CLIENT = "SQS_CLIENT";
export const LAMBDA_CLIENT = "LAMBDA_CLIENT";

/**
 * Construye la configuración común para los clientes AWS SDK v3.
 * En AWS real basta con la región: el endpoint se resuelve solo y las
 * credenciales se toman de la cadena por defecto (rol IAM / env / perfil).
 * `AWS_ENDPOINT` y las credenciales explícitas solo se pasan si están definidos.
 */
function awsClientConfig(config: ConfigService<AppEnv, true>) {
  const endpoint = config.get("AWS_ENDPOINT", { infer: true });
  const accessKeyId = config.get("AWS_ACCESS_KEY_ID", { infer: true });
  const secretAccessKey = config.get("AWS_SECRET_ACCESS_KEY", { infer: true });
  return {
    region: config.get("AWS_REGION", { infer: true }),
    ...(endpoint ? { endpoint } : {}),
    ...(accessKeyId && secretAccessKey
      ? { credentials: { accessKeyId, secretAccessKey } }
      : {}),
  };
}

const sqsProvider: Provider = {
  provide: SQS_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService<AppEnv, true>) =>
    new SQSClient(awsClientConfig(config)),
};

const lambdaProvider: Provider = {
  provide: LAMBDA_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService<AppEnv, true>) =>
    new LambdaClient(awsClientConfig(config)),
};

/**
 * Clientes AWS (SQS + Lambda). Global para que tanto
 * la ingesta de documentos (SQS) como las stats (Lambda) los inyecten sin
 * reimportar el módulo.
 */
@Global()
@Module({
  providers: [sqsProvider, lambdaProvider],
  exports: [SQS_CLIENT, LAMBDA_CLIENT],
})
export class AwsModule {}
