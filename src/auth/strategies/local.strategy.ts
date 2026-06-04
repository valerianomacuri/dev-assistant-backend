import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-local";
import { AuthService } from "../auth.service";
import type { AuthUser } from "../auth.types";

/**
 * Valida email/password en el endpoint de login.
 * `usernameField: "email"` porque passport-local usa "username" por defecto.
 */
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly auth: AuthService) {
    super({ usernameField: "email", passwordField: "password" });
  }

  validate(email: string, password: string): Promise<AuthUser> {
    return this.auth.validateCredentials(email, password);
  }
}
