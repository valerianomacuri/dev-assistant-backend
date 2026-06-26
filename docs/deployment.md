# Despliegue del backend

La infraestructura (CloudFormation: ECS/Fargate, RDS, ALB, ECR, OIDC) vive en el
repo aparte **dev-assistant-infra**. Este documento cubre lo que vive en el repo
del backend: la imagen Docker, el CI/CD y las migraciones de base de datos.

## Imagen Docker

`Dockerfile` es multi-stage sobre `node:22-slim` (Debian, no alpine: `bcrypt` es
nativo y compila de forma fiable con glibc):

1. **deps**: instala dependencias con pnpm (+ toolchain `python3 make g++` para
   compilar `bcrypt`).
2. **build**: `pnpm build` y luego `pnpm prune --prod` para dejar solo deps de
   producción.
3. **runtime**: copia `node_modules` y `dist`, corre como usuario `node`,
   `CMD ["node","dist/main.js"]`, expone el 3000.

Build local:

```bash
docker build -t dev-assistant-backend:dev .
```

## CI/CD (GitHub Actions)

`.github/workflows/deploy-backend.yml` se dispara en `push` a `main` (o manual).
Pasos: autenticación con AWS vía **OIDC** (sin llaves), build + push a **ECR**
(tags `latest` y el SHA del commit), y `update-service` en **ECS** esperando a
que el servicio quede estable.

### Secretos y variables de GitHub (repo del backend)

En **Settings → Secrets and variables → Actions**:

- **Secret**: `AWS_ROLE_ARN` → output `DeployRoleArn` del stack `cicd`.
- **Variables**: `AWS_REGION` (`us-east-1`), `ECR_REPOSITORY`
  (`dev-assistant-backend`), `ECS_CLUSTER` (`dev-assistant`), `ECS_SERVICE`
  (`dev-assistant-backend`), `ECS_TASK_FAMILY` (`dev-assistant-backend`),
  `CONTAINER_NAME` (`app`).

## Secretos en runtime

El contenedor recibe los secretos inyectados por ECS (no van en la imagen). Los
4 son SecureString de **SSM Parameter Store** bajo `/dev-assistant/*`, creados a
mano una vez (ver README de `dev-assistant-infra`):

- `DATABASE_URL` — `/dev-assistant/DATABASE_URL`, con el endpoint del RDS (creado
  por consola) y la contraseña del usuario master.
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `JWT_SECRET`.

Variables no sensibles (`NODE_ENV=production`, `PORT`, `CORS_ORIGINS`,
`AWS_REGION`, modelos, etc.) se definen en la task definition.

## Migraciones de base de datos

En la nube **no** se usa `synchronize`. El comportamiento depende de `NODE_ENV`
(ver [src/app.module.ts](../src/app.module.ts)):

- **Local** (`NODE_ENV` ≠ `production`): `synchronize: true` (comodidad de dev).
- **Nube** (`NODE_ENV=production`): `synchronize: false` + `migrationsRun: true`.
  Al arrancar el contenedor en Fargate se aplican las migraciones pendientes
  automáticamente (con `desiredCount: 1` no hay condiciones de carrera).

El CLI usa [src/database/data-source.ts](../src/database/data-source.ts).

### Generar la primera migración (requerido antes del primer deploy)

Con un Postgres local vacío y `DATABASE_URL` apuntando a él:

```bash
docker compose up -d db
pnpm migration:generate src/database/migrations/Init
```

Revisa el archivo generado en `src/database/migrations/`, commitéalo y despliega.
Sin esta migración, en producción no se crearía el esquema relacional.

### Comandos

```bash
pnpm migration:generate src/database/migrations/<Nombre>   # tras cambiar entidades
pnpm migration:run                                          # aplicar pendientes
pnpm migration:revert                                       # revertir la última
```

### pgvector / tabla `chunks`

**No** se gestionan con migraciones de TypeORM. La extensión `vector` y la tabla
`chunks` las crea LangChain (`PGVectorStore.initialize`, ver
[src/rag/vector-store.service.ts](../src/rag/vector-store.service.ts)) en el
primer uso del RAG, usando las credenciales master de RDS. No requieren ningún
paso manual.
