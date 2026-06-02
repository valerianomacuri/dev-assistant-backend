# Getting Started con TaskFlow API

Este guía te lleva desde cero hasta hacer tu primera request en menos de 5 minutos.

## Quick Start — 5 minutos

### Paso 1: Obtener tus credenciales

1. Crea una cuenta en [taskflow.app/signup](https://taskflow.app/signup)
2. Ve a **Settings → API Keys**
3. Haz click en **"Crear nueva API Key"**
4. Guarda el token en un lugar seguro — no se mostrará de nuevo

### Paso 2: Hacer tu primera request

```bash
# Verifica que la API está respondiendo
curl https://api.taskflow.app/v1/health

# Respuesta esperada:
# {"status": "ok", "version": "1.4.2"}
```

### Paso 3: Autenticarte

```bash
curl -X POST https://api.taskflow.app/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "tu@email.com",
    "password": "tu-contraseña"
  }'
```

Guarda el `accessToken` de la respuesta:

```bash
export TASKFLOW_TOKEN="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Paso 4: Crear tu primera tarea

```bash
curl -X POST https://api.taskflow.app/v1/tasks \
  -H "Authorization: Bearer $TASKFLOW_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Mi primera tarea con TaskFlow API",
    "priority": "high",
    "tags": ["inicio", "prueba"]
  }'
```

¡Listo! Acabas de crear tu primera tarea vía API.

---

## Autenticación con JWT

TaskFlow usa JWT (JSON Web Tokens) con algoritmo RS256.

### Flujo de autenticación

```
Usuario → POST /auth/login → [accessToken (15min) + refreshToken (7 días)]
     ↓
Usar accessToken en headers de cada request
     ↓
Cuando expire → POST /auth/refresh con refreshToken → nuevo accessToken
```

### Implementación en JavaScript

```javascript
class TaskFlowClient {
  constructor(baseURL = "https://api.taskflow.app/v1") {
    this.baseURL = baseURL;
    this.accessToken = null;
    this.refreshToken = null;
  }

  async login(email, password) {
    const response = await fetch(`${this.baseURL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) throw new Error("Login fallido");

    const { accessToken, refreshToken } = await response.json();
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  async request(path, options = {}) {
    const response = await fetch(`${this.baseURL}${path}`, {
      ...options,
      headers: {
        "Authorization": `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    // Si el token expiró, renovarlo automáticamente
    if (response.status === 401) {
      await this.refreshAccessToken();
      return this.request(path, options); // Reintentar
    }

    return response.json();
  }

  async refreshAccessToken() {
    const response = await fetch(`${this.baseURL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: this.refreshToken }),
    });

    const { accessToken } = await response.json();
    this.accessToken = accessToken;
  }
}
```

---

## Webhooks

Los webhooks permiten que TaskFlow notifique a tu aplicación cuando ocurren eventos importantes.

### Eventos disponibles

| Evento                 | Descripción                      |
| ---------------------- | -------------------------------- |
| `task.created`         | Se creó una nueva tarea          |
| `task.updated`         | Se actualizó una tarea           |
| `task.completed`       | Una tarea pasó a estado `done`   |
| `task.deleted`         | Se eliminó una tarea             |
| `project.member.added` | Se agregó un miembro al proyecto |

### Configurar un webhook

```http
POST /v1/webhooks
Authorization: Bearer {token}
Content-Type: application/json

{
  "url": "https://mi-app.com/webhooks/taskflow",
  "events": ["task.created", "task.completed"],
  "secret": "mi-secreto-para-verificar"
}
```

### Verificar la firma del webhook

Cada request de webhook incluye un header `X-TaskFlow-Signature` con un HMAC-SHA256 del body:

```typescript
import { createHmac } from "crypto";

function verifyWebhook(body: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  return `sha256=${expected}` === signature;
}

// En tu endpoint de webhooks:
app.post("/webhooks/taskflow", (req, res) => {
  const signature = req.headers["x-taskflow-signature"] as string;
  const isValid = verifyWebhook(
    JSON.stringify(req.body),
    signature,
    process.env.WEBHOOK_SECRET!
  );

  if (!isValid) {
    return res.status(401).json({ error: "Firma inválida" });
  }

  const { event, data } = req.body;

  switch (event) {
    case "task.completed":
      console.log(`Tarea completada: ${data.task.title}`);
      break;
    // ... manejar otros eventos
  }

  res.json({ received: true });
});
```

---

## SDKs oficiales

### JavaScript / TypeScript

```bash
npm install @taskflow/sdk
```

```typescript
import { TaskFlowClient } from "@taskflow/sdk";

const client = new TaskFlowClient({
  apiKey: process.env.TASKFLOW_API_KEY,
});

// Crear una tarea
const task = await client.tasks.create({
  title: "Mi tarea",
  priority: "high",
});

// Listar tareas
const { data: tasks } = await client.tasks.list({
  status: "todo",
  limit: 20,
});

// Actualizar una tarea
await client.tasks.update(task.id, {
  status: "done",
});
```

### Python

```bash
pip install taskflow-python
```

```python
from taskflow import TaskFlowClient

client = TaskFlowClient(api_key=os.environ["TASKFLOW_API_KEY"])

# Crear una tarea
task = client.tasks.create(
    title="Mi tarea",
    priority="high"
)

# Listar tareas
tasks = client.tasks.list(status="todo", limit=20)
```

---

## Preguntas Frecuentes (FAQ)

### ¿Cómo manejo la paginación en colecciones grandes?

TaskFlow usa paginación cursor-based. El campo `nextCursor` de la respuesta es el cursor para la siguiente página. Cuando `hasMore` es `false`, llegaste al final.

```javascript
// Obtener todas las tareas de un proyecto
async function getAllTasks(projectId) {
  let cursor = undefined;
  let allTasks = [];

  do {
    const result = await client.tasks.list({
      projectId,
      limit: 100,
      cursor,
    });

    allTasks.push(...result.data);
    cursor = result.pagination.hasMore ? result.pagination.nextCursor : undefined;
  } while (cursor);

  return allTasks;
}
```

### ¿Qué hago si recibo un error 429?

Respeta el header `Retry-After` que indica cuántos segundos esperar:

```javascript
async function requestWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, options);

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get("Retry-After") || "60");
      console.log(`Rate limit alcanzado. Esperando ${retryAfter}s...`);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      continue;
    }

    return response;
  }
  throw new Error("Máximo de reintentos alcanzado");
}
```

### ¿Mi token expiró, qué hago?

Los access tokens duran 15 minutos. Cuando recibes un `401 Unauthorized`, usa el refresh token para obtener uno nuevo:

```javascript
const { accessToken } = await fetch("/v1/auth/refresh", {
  method: "POST",
  body: JSON.stringify({ refreshToken: myRefreshToken }),
}).then(r => r.json());
```

Los refresh tokens duran 7 días. Si también expira el refresh token, el usuario debe hacer login de nuevo.

### ¿Puedo usar la API sin JavaScript o Python?

Sí. La API acepta cualquier cliente HTTP que soporte JSON. Ejemplos con otras herramientas:

```bash
# Con HTTPie
http POST api.taskflow.app/v1/tasks \
  Authorization:"Bearer $TOKEN" \
  title="Mi tarea" priority=high

# Con curl
curl -X POST https://api.taskflow.app/v1/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Mi tarea", "priority": "high"}'
```

### ¿Cómo agrego miembros a un proyecto?

```http
POST /v1/projects/{projectId}/members
Authorization: Bearer {token}
Content-Type: application/json

{
  "email": "nuevo.miembro@ejemplo.com",
  "role": "member"
}
```

Roles disponibles: `admin`, `member`, `viewer`.

### ¿Puedo filtrar tareas por múltiples tags?

Sí, pasa los tags separados por coma:

```http
GET /v1/tasks?tags=bug,frontend&status=todo
```

Esto retorna tareas que tengan el tag `bug` O el tag `frontend` (OR lógico). Para AND lógico, filtra en el cliente después de obtener los resultados.
