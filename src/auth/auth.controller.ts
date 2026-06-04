import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./current-user.decorator";
import type { AuthUser } from "./auth.types";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { LocalAuthGuard } from "./guards/local-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  register(@Body() dto: RegisterDto): Promise<{ accessToken: string }> {
    return this.auth.register(dto.email, dto.password);
  }

  /**
   * LocalAuthGuard valida email/password (vía LocalStrategy) y adjunta el
   * usuario a la request; aquí solo firmamos el token. El @Body LoginDto
   * documenta/valida la forma del payload.
   */
  @UseGuards(LocalAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post("login")
  login(
    @CurrentUser() user: AuthUser,
    @Body() _dto: LoginDto,
  ): { accessToken: string } {
    return this.auth.login(user);
  }
}
