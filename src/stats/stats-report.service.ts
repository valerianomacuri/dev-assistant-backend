import { InvokeCommand, type LambdaClient } from "@aws-sdk/client-lambda";
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { LAMBDA_CLIENT } from "../aws/aws.module";
import type { AuthUser } from "../auth/auth.types";
import type { AppEnv } from "../config/configuration";
import { StatsService } from "./stats.service";

/**
 * Genera el PDF del reporte de estadísticas delegando el render a una Lambda
 * (Python + WeasyPrint) en AWS. El backend solo aporta los datos; la
 * Lambda es pura presentación y devuelve el PDF en base64.
 */
@Injectable()
export class StatsReportService {
  private readonly logger = new Logger(StatsReportService.name);
  private readonly functionName: string;

  constructor(
    @Inject(LAMBDA_CLIENT) private readonly lambda: LambdaClient,
    private readonly stats: StatsService,
    config: ConfigService<AppEnv, true>,
  ) {
    this.functionName = config.get("LAMBDA_STATS_REPORT", { infer: true });
  }

  /** Arma el payload, invoca la Lambda y devuelve el PDF como Buffer. */
  async generateReport(user: AuthUser): Promise<Buffer> {
    const [summary, conversations] = await Promise.all([
      this.stats.summary(user.id),
      this.stats.byConversation(user.id),
    ]);

    const payload = {
      user: { email: user.email },
      generatedAt: new Date().toISOString(),
      summary,
      conversations,
    };

    const res = await this.lambda.send(
      new InvokeCommand({
        FunctionName: this.functionName,
        Payload: Buffer.from(JSON.stringify(payload), "utf-8"),
      }),
    );

    const text = res.Payload
      ? new TextDecoder().decode(res.Payload)
      : "";

    if (res.FunctionError) {
      this.logger.error(`Lambda ${this.functionName} falló: ${text}`);
      throw new InternalServerErrorException(
        "No se pudo generar el PDF del reporte.",
      );
    }

    let parsed: { pdfBase64?: string };
    try {
      parsed = JSON.parse(text) as { pdfBase64?: string };
    } catch {
      throw new InternalServerErrorException(
        "Respuesta inválida de la Lambda de reporte.",
      );
    }

    if (!parsed.pdfBase64) {
      throw new InternalServerErrorException(
        "La Lambda no devolvió el PDF esperado.",
      );
    }

    return Buffer.from(parsed.pdfBase64, "base64");
  }
}
