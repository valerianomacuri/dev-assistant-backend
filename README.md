# DevAssistant API

> API REST multi-usuario con RAG por usuario, autenticación JWT, subida de archivos a S3 y respuestas en streaming.

DevAssistant es una API construida con **NestJS** que combina **Retrieval Augmented Generation (RAG)** con un **agente autónomo** sobre **LangChain** y **LangGraph**. Cada usuario tiene su propia **conversación** y su propia **base de conocimiento**: sube archivos (Markdown, texto o PDF) que se almacenan en **AWS S3** y se ingestan en **Postgres + pgvector**. El agente responde por **SSE** citando exclusivamente la documentación del usuario. Embeddings con **OpenAI `text-embedding-3-small`**; LLM del agente con **Claude (Anthropic)**.

---

## Características

- **Multi-tenant** — cada usuario tiene su conversación aislada (`conv-<userId>`) y su RAG aislado (chunks filtrados por `userId`).
- **Autenticación JWT** — registro/login con email y password (hash con bcrypt), Passport (`local` + `jwt`).
- **Base de conocimiento por usuario** — sube `.md`, `.txt` o `.pdf`; se guardan en **AWS S3** y se ingestan de forma **asíncrona** vía **AWS SQS**: dos colas encadenadas (`doc-chunking` → `doc-embeddings`) con DLQ.
- **Progreso en tiempo real (WebSockets)** — un gateway Socket.IO empuja el estado de ingestión (`queued → chunking → embedding → ready/failed`) al frontend, sin polling.
- **Streaming SSE** — la respuesta del agente se emite en tiempo real (`text/event-stream`).
- **Reporte PDF (Lambda)** — `GET /stats/report.pdf` delega el render a una **Lambda Python + WeasyPrint** (AWS) y devuelve el PDF. El código de la Lambda vive en el repo aparte [`dev-assistant-stats-lambda`](../dev-assistant-stats-lambda).
- **Agente autónomo** — grafo ReAct con LangGraph (`createAgent`), tool `search_docs` sobre la documentación del usuario, hasta 8 tool calls por turno.
- **Guardrails** — detección de prompt injection (ES/EN), sanitización y rate limiting por usuario.

---

## Requisitos previos

| Herramienta             | Versión mínima |
| ----------------------- | -------------- |
| Node.js                 | 18+            |
| pnpm                    | 9+             |
| Docker + Docker Compose | —              |
| Cuenta AWS + credenciales (S3, SQS, Lambda) | — |
| API Key de Anthropic    | —              |
| API Key de OpenAI       | —              |

---

## Instalación

```bash
pnpm install

# Levanta Postgres + pgvector (la única dependencia local).
docker compose up -d

# Crea las colas SQS de la ingesta (doc-chunking / doc-embeddings + DLQ) en AWS.
# Usa las credenciales de tu cadena por defecto del SDK/CLI de AWS.
pnpm aws:setup
```

> El **bucket S3** debe existir en tu cuenta AWS (créalo en la consola o con tu IaC).
> La **Lambda del PDF** se despliega desde su propio repo: [`dev-assistant-stats-lambda`](../dev-assistant-stats-lambda) (ver su README).

## Configuración

```bash
cp .env.template .env   # completa ANTHROPIC_API_KEY, OPENAI_API_KEY y JWT_SECRET
```

Variables relevantes (ver `.env.template` para la lista completa): `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `JWT_SECRET`, `DATABASE_URL`, el bloque `S3_*` y el bloque `AWS_*`. Para AWS real deja los endpoints (`S3_ENDPOINT`, `AWS_ENDPOINT`) y las credenciales vacíos: la SDK resuelve el endpoint y toma las credenciales de la cadena por defecto (rol IAM / variables de entorno / perfil).

> Las tablas (`users`, `documents`) las crea TypeORM con `synchronize: true` (solo dev). La tabla `chunks` (pgvector) y las de checkpoints de LangGraph se crean automáticamente al arrancar.

## Ejecución

```bash
pnpm start:dev   # desarrollo con watch
pnpm start       # desarrollo
pnpm build && pnpm start:prod   # producción
```

La API queda en `http://localhost:3000`.

---

## Endpoints

| Método     | Ruta             | Auth   | Descripción                                                       |
| ---------- | ---------------- | ------ | ----------------------------------------------------------------- |
| `POST`     | `/auth/register` | —      | `{ email, password }` → `{ accessToken }`                         |
| `POST`     | `/auth/login`    | —      | `{ email, password }` → `{ accessToken }`                         |
| `GET`      | `/chat/stream`   | JWT    | `?message=...` → **SSE** con la respuesta del agente              |
| `DELETE`   | `/chat`          | JWT    | Limpia la conversación del usuario                                |
| `POST`     | `/documents`     | JWT    | `multipart/form-data` campo `file` → sube a S3 y **encola** la ingesta |
| `GET`      | `/documents`     | JWT    | Lista los documentos del usuario                                  |
| `DELETE`   | `/documents/:id` | JWT    | Borra el documento de S3 y sus chunks del RAG                     |
| `GET`      | `/stats`         | JWT    | Resumen de uso (tokens, costo, latencia)                          |
| `GET`      | `/stats/report.pdf` | JWT | PDF del reporte de stats (generado por la Lambda WeasyPrint)      |
| `WS`       | `/socket.io`     | JWT (handshake) | Eventos `document.status` con el progreso de ingestión   |

El token JWT se envía en `Authorization: Bearer <token>` o, para SSE/`EventSource` (que no admite headers personalizados), como query param `?token=<token>`.

### Ejemplo rápido

```bash
B=http://localhost:3000

# 1. Registro → token
TOKEN=$(curl -s -X POST $B/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"yo@test.com","password":"password123"}' | jq -r .accessToken)

# 2. Subir un documento a mi base de conocimiento
curl -X POST $B/documents -H "Authorization: Bearer $TOKEN" \
  -F "file=@./mi-doc.md;type=text/markdown"

# 3. Preguntar (streaming SSE)
curl -N "$B/chat/stream?token=$TOKEN&message=¿De%20qué%20trata%20mi%20documento?"
```

Eventos SSE emitidos: `token` (fragmentos de texto), `done` (metadata: `toolsUsed`, tokens), `error`.

---

## Arquitectura

```
Cliente
   │  Authorization: Bearer / ?token=
   ▼
┌──────────────┐   JWT/Local (Passport)   ┌──────────────┐
│ AuthModule   │ ◄──────────────────────► │ UsersModule  │  (TypeORM: users)
└──────────────┘                          └──────────────┘
   │
   ├── POST /documents ─► DocumentsModule (status=queued)
   │        S3Service (AWS S3) ─► SQS doc-chunking
   │             └─ ChunkingConsumer: text-extractor ─ chunker ─ chunks.json a S3
   │                  └─► SQS doc-embeddings
   │                       └─ EmbeddingsConsumer ─► RagModule.VectorStoreService
   │                            (PGVectorStore + metadata.userId)    (TypeORM: documents)
   │            ╰─ RealtimeModule (Socket.IO) empuja document.status ─► frontend
   │
   ├── GET /stats/report.pdf ─► StatsModule.StatsReportService
   │        └─► Lambda stats-report (Python + WeasyPrint, AWS) ─► PDF
   │
   └── GET /chat/stream ─► ChatModule
            guardrails ─ AgentService.buildAgent(userId)
                            │  createAgent (LangGraph) + tool search_docs(userId)
                            │  + CheckpointerService (PostgresSaver, thread=conv-<userId>)
                            ▼
                       ChatAnthropic ──► SSE (Observable<MessageEvent>)
```

**Aislamiento multi-tenant:** cada chunk lleva `userId` y `documentId` en su `metadata`; `search_docs` filtra siempre por el `userId` del token, y la conversación se indexa por `thread_id = conv-<userId>`.

---

## Estructura del proyecto

```
src/
├── main.ts                       # Bootstrap NestJS
├── app.module.ts                 # ConfigModule + TypeOrmModule + módulos
├── config/configuration.ts       # Validación de env (Zod)
├── auth/                         # JWT + Passport (register/login, strategies, guard)
├── users/                        # Entidad User + servicio (TypeORM)
├── documents/                    # Subida a S3 + ingesta async
│   └── ingestion/                # SQS: producer + consumers (chunking, embeddings)
├── aws/                          # Clientes AWS SDK (SQS_CLIENT, LAMBDA_CLIENT)
├── realtime/                     # Gateway Socket.IO + RealtimeService (progreso de ingestión)
├── rag/                          # chunker, embeddings, vector-store (filtro userId), retriever
├── chat/                         # agent.service (SSE), chat.controller, checkpointer, system-prompt
├── stats/                        # Agregados de uso + stats-report.service (invoca la Lambda PDF)
├── llm/                          # ChatAnthropic provider + extractText
├── security/guardrails.ts        # Prompt injection, rate limit, sanitización
└── common/types.ts               # Tipos compartidos

scripts/setup-aws.mjs             # Crea las colas SQS de la ingesta (+ DLQ) en AWS
```

> La Lambda del reporte PDF vive en un repo aparte: [`dev-assistant-stats-lambda`](../dev-assistant-stats-lambda).
