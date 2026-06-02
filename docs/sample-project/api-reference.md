# TaskFlow API Reference

## Base URL

```
https://api.taskflow.app/v1
```

Para desarrollo local:

```
http://localhost:3000/v1
```

## Autenticación

TaskFlow usa **Bearer tokens (JWT)** para autenticar todas las requests a endpoints protegidos.

### Obtener un token

```http
POST /v1/auth/login
Content-Type: application/json

{
  "email": "usuario@ejemplo.com",
  "password": "tu-contraseña"
}
```

**Respuesta exitosa (200):**

```json
{
  "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900,
  "tokenType": "Bearer"
}
```

### Usar el token

Incluye el token en el header `Authorization` de cada request:

```http
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Renovar el token

El access token expira en 15 minutos. Usa el refresh token para obtener uno nuevo:

```http
POST /v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Registro de usuario

```http
POST /v1/auth/register
Content-Type: application/json

{
  "name": "María García",
  "email": "maria@ejemplo.com",
  "password": "MiContraseñaSegura123!"
}
```

**Respuesta (201):**

```json
{
  "user": {
    "id": "usr_01HXYZ123",
    "name": "María García",
    "email": "maria@ejemplo.com",
    "createdAt": "2024-01-15T10:00:00Z"
  },
  "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## Tareas

### Modelo de Tarea

```typescript
interface Task {
  id: string;              // "tsk_01HXYZ123"
  title: string;           // Máximo 255 caracteres
  description?: string;    // Máximo 10,000 caracteres (Markdown)
  status: "todo" | "in_progress" | "done" | "cancelled";
  priority: "low" | "medium" | "high" | "urgent";
  projectId?: string;      // Referencia al proyecto
  assigneeId?: string;     // Usuario asignado
  creatorId: string;       // Usuario que creó la tarea
  dueDate?: string;        // ISO 8601: "2024-03-15T17:00:00Z"
  tags: string[];          // ["backend", "bug", "frontend"]
  createdAt: string;
  updatedAt: string;
}
```

### GET /tasks — Listar tareas

Retorna una lista paginada de tareas del usuario autenticado.

```http
GET /v1/tasks?status=todo&priority=high&limit=20&cursor=tsk_01HXYZ
Authorization: Bearer {token}
```

**Query parameters:**

| Parámetro    | Tipo   | Descripción                                                    |
| ------------ | ------ | -------------------------------------------------------------- |
| `status`     | string | Filtrar por estado: `todo`, `in_progress`, `done`, `cancelled` |
| `priority`   | string | Filtrar por prioridad: `low`, `medium`, `high`, `urgent`       |
| `projectId`  | string | Filtrar por proyecto                                           |
| `assigneeId` | string | Filtrar por usuario asignado                                   |
| `tags`       | string | Filtrar por tags (comma-separated): `bug,frontend`             |
| `limit`      | number | Resultados por página (1-100, default: 20)                     |
| `cursor`     | string | Cursor para paginación                                         |
| `sortBy`     | string | Campo de ordenamiento: `createdAt`, `dueDate`, `priority`      |
| `sortOrder`  | string | `asc` o `desc` (default: `desc`)                               |

**Respuesta (200):**

```json
{
  "data": [
    {
      "id": "tsk_01HXYZ123",
      "title": "Implementar autenticación JWT",
      "status": "in_progress",
      "priority": "high",
      "dueDate": "2024-02-01T17:00:00Z",
      "tags": ["backend", "auth"],
      "createdAt": "2024-01-15T10:00:00Z",
      "updatedAt": "2024-01-16T09:30:00Z"
    }
  ],
  "pagination": {
    "total": 47,
    "limit": 20,
    "nextCursor": "tsk_01HABC456",
    "hasMore": true
  }
}
```

### POST /tasks — Crear tarea

```http
POST /v1/tasks
Authorization: Bearer {token}
Content-Type: application/json

{
  "title": "Revisar PR de autenticación",
  "description": "# Descripción\n\nRevisar el PR #42 que implementa JWT...",
  "priority": "high",
  "projectId": "prj_01HXYZ999",
  "assigneeId": "usr_01HABC123",
  "dueDate": "2024-02-15T17:00:00Z",
  "tags": ["review", "auth"]
}
```

**Campos requeridos:** `title`

**Respuesta (201):**

```json
{
  "data": {
    "id": "tsk_01HNEW789",
    "title": "Revisar PR de autenticación",
    "status": "todo",
    "priority": "high",
    "projectId": "prj_01HXYZ999",
    "assigneeId": "usr_01HABC123",
    "creatorId": "usr_01HCURRENT",
    "dueDate": "2024-02-15T17:00:00Z",
    "tags": ["review", "auth"],
    "createdAt": "2024-01-20T14:30:00Z",
    "updatedAt": "2024-01-20T14:30:00Z"
  }
}
```

### GET /tasks/:id — Obtener tarea

```http
GET /v1/tasks/tsk_01HXYZ123
Authorization: Bearer {token}
```

**Respuesta (200):** Objeto `Task` completo.

**Errores:**
- `404` — Tarea no encontrada o sin permisos para verla

### PUT /tasks/:id — Actualizar tarea

Actualización parcial (solo los campos enviados se actualizan):

```http
PUT /v1/tasks/tsk_01HXYZ123
Authorization: Bearer {token}
Content-Type: application/json

{
  "status": "done",
  "priority": "medium"
}
```

**Respuesta (200):** Objeto `Task` actualizado.

**Errores:**
- `404` — Tarea no encontrada
- `403` — Sin permisos para editar esta tarea

### DELETE /tasks/:id — Eliminar tarea

```http
DELETE /v1/tasks/tsk_01HXYZ123
Authorization: Bearer {token}
```

**Respuesta (204):** Sin body.

> **Nota:** Solo el creador de la tarea o un administrador del proyecto puede eliminarla.

---

## Proyectos

### Modelo de Proyecto

```typescript
interface Project {
  id: string;              // "prj_01HXYZ999"
  name: string;
  description?: string;
  ownerId: string;         // Usuario propietario
  members: ProjectMember[];
  taskCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ProjectMember {
  userId: string;
  role: "owner" | "admin" | "member" | "viewer";
  joinedAt: string;
}
```

### GET /projects — Listar proyectos

```http
GET /v1/projects?limit=10
Authorization: Bearer {token}
```

**Respuesta (200):**

```json
{
  "data": [
    {
      "id": "prj_01HXYZ999",
      "name": "TaskFlow Backend",
      "description": "API REST principal",
      "ownerId": "usr_01HOWNER",
      "taskCount": 23,
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "total": 3,
    "limit": 10,
    "hasMore": false
  }
}
```

### POST /projects — Crear proyecto

```http
POST /v1/projects
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "Mi Nuevo Proyecto",
  "description": "Descripción opcional"
}
```

**Respuesta (201):** Objeto `Project` creado.

---

## Usuarios

### GET /users/me — Perfil del usuario actual

```http
GET /v1/users/me
Authorization: Bearer {token}
```

**Respuesta (200):**

```json
{
  "data": {
    "id": "usr_01HXYZ123",
    "name": "María García",
    "email": "maria@ejemplo.com",
    "avatar": "https://cdn.taskflow.app/avatars/usr_01HXYZ123.jpg",
    "plan": "pro",
    "createdAt": "2024-01-15T10:00:00Z"
  }
}
```

### PUT /users/me — Actualizar perfil

```http
PUT /v1/users/me
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "María López García"
}
```

---

## Rate Limiting

Cada usuario autenticado puede hacer **100 requests por minuto**.

Los headers de rate limiting están presentes en todas las respuestas:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1706793600
```

Cuando se supera el límite:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 23

{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Demasiadas requests. Intenta de nuevo en 23 segundos.",
    "retryAfter": 23
  }
}
```

---

## Paginación

TaskFlow usa **paginación cursor-based** para manejar eficientemente colecciones grandes.

### Iterar todas las páginas

```typescript
let cursor: string | undefined;
let allTasks: Task[] = [];

do {
  const response = await fetch(
    `/v1/tasks?limit=100${cursor ? `&cursor=${cursor}` : ""}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const { data, pagination } = await response.json();

  allTasks = [...allTasks, ...data];
  cursor = pagination.hasMore ? pagination.nextCursor : undefined;
} while (cursor);
```

---

## Códigos de Error

| Código | Descripción                                           |
| ------ | ----------------------------------------------------- |
| `400`  | Bad Request — Datos inválidos en el body              |
| `401`  | Unauthorized — Token ausente o expirado               |
| `403`  | Forbidden — Sin permisos para esta acción             |
| `404`  | Not Found — Recurso no existe                         |
| `409`  | Conflict — El recurso ya existe (ej: email duplicado) |
| `422`  | Unprocessable Entity — Validación fallida             |
| `429`  | Too Many Requests — Rate limit excedido               |
| `500`  | Internal Server Error — Error del servidor            |

### Formato de error

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Datos inválidos",
    "details": [
      {
        "field": "title",
        "message": "El título es requerido"
      }
    ]
  }
}
```
