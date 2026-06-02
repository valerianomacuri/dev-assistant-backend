# TaskFlow API

TaskFlow es una API REST moderna para gestión de tareas y proyectos en equipo. Diseñada para ser simple, rápida y segura, permite a los developers integrar gestión de tareas en cualquier aplicación.

## Features principales

- **Gestión de tareas** — CRUD completo con prioridades, fechas límite, etiquetas y estados
- **Proyectos** — Organiza tareas en proyectos con miembros y permisos
- **Colaboración** — Asigna tareas, comenta, y recibe notificaciones en tiempo real
- **Webhooks** — Integra TaskFlow con cualquier sistema externo
- **SDKs oficiales** — JavaScript/TypeScript y Python disponibles
- **Rate limiting** — 100 requests/minuto por usuario autenticado
- **Paginación cursor-based** — Manejo eficiente de colecciones grandes

## Tech Stack

- **Runtime:** Node.js 20 LTS
- **Framework:** Express 4.x
- **Base de datos:** PostgreSQL 15 (con extensión pg_vector para búsqueda semántica)
- **Cache:** Redis 7
- **Auth:** JWT (RS256) + Refresh tokens
- **Docs:** OpenAPI 3.1 (auto-generado)
- **Testing:** Jest + Supertest
- **CI/CD:** GitHub Actions

## Requisitos previos

- Node.js >= 20.0.0
- PostgreSQL >= 15
- Redis >= 7
- npm >= 10

## Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/taskflow/api.git
cd api
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

```bash
cp .env.template .env
```

Edita `.env` con tus valores (ver sección Variables de entorno más abajo).

### 4. Inicializar la base de datos

```bash
# Crear la base de datos
createdb taskflow_dev

# Correr migraciones
npm run db:migrate

# (Opcional) Cargar datos de ejemplo
npm run db:seed
```

### 5. Iniciar en desarrollo

```bash
npm run dev
```

El servidor estará disponible en `http://localhost:3000`.

## Variables de entorno

```env
# Servidor
NODE_ENV=development
PORT=3000

# Base de datos PostgreSQL
DATABASE_URL=postgresql://user:password@localhost:5432/taskflow_dev

# Redis (cache y sesiones)
REDIS_URL=redis://localhost:6379

# JWT
JWT_PRIVATE_KEY_PATH=./keys/private.pem
JWT_PUBLIC_KEY_PATH=./keys/public.pem
JWT_ACCESS_TOKEN_EXPIRY=15m
JWT_REFRESH_TOKEN_EXPIRY=7d

# Email (para notificaciones)
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASSWORD=re_xxxxxxxxxxxxx
FROM_EMAIL=noreply@taskflow.app

# Webhooks
WEBHOOK_SECRET=tu-secreto-aqui

# Rate limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

## Estructura del proyecto

```
taskflow-api/
├── src/
│   ├── index.ts              # Entry point
│   ├── app.ts                # Configuración de Express
│   ├── routes/
│   │   ├── auth.ts           # Rutas de autenticación
│   │   ├── tasks.ts          # CRUD de tareas
│   │   ├── projects.ts       # CRUD de proyectos
│   │   └── users.ts          # Gestión de usuarios
│   ├── controllers/
│   │   ├── tasks.controller.ts
│   │   ├── projects.controller.ts
│   │   └── users.controller.ts
│   ├── services/
│   │   ├── auth.service.ts   # Lógica de JWT
│   │   ├── tasks.service.ts  # Reglas de negocio de tareas
│   │   └── email.service.ts  # Envío de emails
│   ├── models/
│   │   ├── task.ts
│   │   ├── project.ts
│   │   └── user.ts
│   ├── middleware/
│   │   ├── auth.ts           # Validación de JWT
│   │   ├── rate-limit.ts
│   │   └── error-handler.ts
│   ├── db/
│   │   ├── client.ts         # Cliente de PostgreSQL
│   │   └── migrations/       # SQL de migraciones
│   └── utils/
│       ├── pagination.ts
│       └── validators.ts
├── tests/
├── docs/
├── .env.template
└── package.json
```

## Correr en producción

```bash
# Build TypeScript
npm run build

# Correr migraciones en producción
npm run db:migrate:prod

# Iniciar servidor
npm start
```

Se recomienda usar PM2 o un process manager similar:

```bash
npm install -g pm2
pm2 start dist/index.js --name taskflow-api
pm2 startup
pm2 save
```

## Scripts disponibles

| Script               | Descripción                                |
| -------------------- | ------------------------------------------ |
| `npm run dev`        | Inicia en modo desarrollo con hot-reload   |
| `npm run build`      | Compila TypeScript a JavaScript            |
| `npm start`          | Inicia el servidor compilado               |
| `npm test`           | Corre todos los tests                      |
| `npm run test:watch` | Tests en modo watch                        |
| `npm run db:migrate` | Aplica migraciones pendientes              |
| `npm run db:seed`    | Carga datos de ejemplo                     |
| `npm run db:reset`   | Resetea la base de datos (solo desarrollo) |
| `npm run lint`       | Revisa el código con ESLint                |
| `npm run typecheck`  | Verifica tipos sin compilar                |

## Contribución

1. Fork el repositorio
2. Crea una branch: `git checkout -b feature/mi-feature`
3. Haz commits atómicos con mensajes descriptivos
4. Asegúrate que los tests pasen: `npm test`
5. Abre un Pull Request

Por favor lee [CONTRIBUTING.md](./CONTRIBUTING.md) antes de contribuir.

## Soporte

- **Documentación:** https://docs.taskflow.app
- **Issues:** https://github.com/taskflow/api/issues
- **Discord:** https://discord.gg/taskflow
- **Email:** support@taskflow.app

## Licencia

MIT — ver [LICENSE](./LICENSE) para detalles.
