import { Controller, Get } from "@nestjs/common";

/**
 * Endpoint de salud para el health check del Target Group del ALB.
 *
 * Es deliberadamente mínimo y NO consulta la base de datos: si RDS tiene un
 * blip momentáneo no queremos que el ALB marque la tarea como unhealthy y la
 * recicle. Responde 200 mientras el proceso Node esté vivo y aceptando HTTP.
 */
@Controller("health")
export class HealthController {
  @Get()
  check(): { status: string } {
    return { status: "ok" };
  }
}
