import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import type { Request } from "express";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { AppEnv } from "../../config/configuration";
import type { AuthUser, JwtPayload } from "../auth.types";

/**
 * Extrae el token JWT de:
 *  1. el header `Authorization: Bearer <token>` (clientes normales), o
 *  2. el query param `?token=<token>` (necesario para SSE/EventSource, que
 *     no permite enviar headers personalizados).
 */
function extractToken(req: Request): string | null {
  const fromHeader = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
  if (fromHeader) return fromHeader;
  const fromQuery = req.query?.["token"];
  return typeof fromQuery === "string" ? fromQuery : null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService<AppEnv, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([extractToken]),
      ignoreExpiration: false,
      secretOrKey: config.get("JWT_SECRET", { infer: true }),
    });
  }

  validate(payload: JwtPayload): AuthUser {
    if (!payload?.sub) {
      throw new UnauthorizedException("Token inválido");
    }
    return { id: payload.sub, email: payload.email };
  }
}
