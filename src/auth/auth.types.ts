/** Payload firmado dentro del JWT. */
export interface JwtPayload {
  sub: string; // user id
  email: string;
}

/** Usuario autenticado que se adjunta a `request.user`. */
export interface AuthUser {
  id: string;
  email: string;
}
