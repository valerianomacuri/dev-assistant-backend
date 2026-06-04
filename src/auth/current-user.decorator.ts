import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { AuthUser } from "./auth.types";

/**
 * Inyecta el usuario autenticado (`request.user`, poblado por las estrategias
 * Passport) en los handlers de los controladores.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user as AuthUser;
  },
);
