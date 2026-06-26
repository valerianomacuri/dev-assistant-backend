import { randomUUID } from "node:crypto";
import type { ConfigService } from "@nestjs/config";
import { stdTimeFunctions } from "pino";
import type { Params } from "nestjs-pino";
import type { AppEnv } from "./configuration";

/**
 * Construye la configuración de `nestjs-pino` (pino + pino-http).
 *
 * Diseñada para CloudWatch: en producción se emite **JSON de una sola línea**
 * a stdout, de modo que CloudWatch Logs Insights parsea automáticamente los
 * campos (`level`, `context`, `time`, `req.id`, `responseTime`, ...).
 * En desarrollo se usa `pino-pretty` para una salida legible y coloreada.
 */
export function buildPinoParams(config: ConfigService<AppEnv, true>): Params {
  const isProd = config.get("NODE_ENV", { infer: true }) === "production";

  return {
    pinoHttp: {
      // Nivel como string ("info", "error", ...) en vez de número: permite
      // filtrar por `level` en CloudWatch Logs Insights.
      formatters: {
        level: (label) => ({ level: label }),
      },
      messageKey: "message",
      timestamp: stdTimeFunctions.isoTime,

      // Oculta cabeceras sensibles en los logs de request.
      redact: {
        paths: ["req.headers.authorization", "req.headers.cookie"],
        censor: "[Redacted]",
      },

      // Correlación de peticiones: reutiliza un header entrante o genera un UUID.
      genReqId: (req, res) => {
        const existing = req.headers["x-request-id"];
        const id =
          (Array.isArray(existing) ? existing[0] : existing) ?? randomUUID();
        res.setHeader("x-request-id", id);
        return id;
      },

      // Auto-logging de cada request, excluyendo health checks para no
      // llenar CloudWatch de ruido.
      autoLogging: {
        ignore: (req) => req.url === "/health" || req.url === "/health/",
      },

      // Solo en desarrollo: salida bonita. En producción `transport` es
      // undefined → pino escribe JSON crudo a stdout (lo que CloudWatch quiere).
      transport: isProd
        ? undefined
        : {
            target: "pino-pretty",
            options: {
              colorize: true,
              singleLine: true,
              translateTime: "SYS:standard",
            },
          },
    },
  };
}
