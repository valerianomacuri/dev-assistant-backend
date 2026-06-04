import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { UsersService } from "../users/users.service";
import type { AuthUser, JwtPayload } from "./auth.types";

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async register(
    email: string,
    password: string,
  ): Promise<{ accessToken: string }> {
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new ConflictException("Ya existe un usuario con ese email");
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await this.users.create(email, passwordHash);
    return this.sign({ id: user.id, email: user.email });
  }

  /** Usada por LocalStrategy: valida credenciales y devuelve el usuario. */
  async validateCredentials(
    email: string,
    password: string,
  ): Promise<AuthUser> {
    const user = await this.users.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException("Credenciales inválidas");
    }
    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException("Credenciales inválidas");
    }
    return { id: user.id, email: user.email };
  }

  login(user: AuthUser): { accessToken: string } {
    return this.sign(user);
  }

  private sign(user: AuthUser): { accessToken: string } {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return { accessToken: this.jwt.sign(payload) };
  }
}
