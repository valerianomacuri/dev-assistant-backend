# DevAssistant API

> API REST multi-usuario con RAG por usuario, autenticación JWT, subida de archivos a S3 y respuestas en streaming.

DevAssistant es una API construida con **NestJS** que combina **Retrieval Augmented Generation (RAG)** con un **agente autónomo** sobre **LangChain** y **LangGraph**. Cada usuario tiene su propia **conversación** y su propia **base de conocimiento**: sube archivos (Markdown, texto o PDF) que se almacenan en **S3** (MinIO en desarrollo) y se ingestan en **Postgres + pgvector**. El agente responde por **SSE** citando exclusivamente la documentación del usuario. Embeddings con **OpenAI `text-embedding-3-small`**; LLM del agente con **Claude (Anthropic)**.

---

## Características

- **Multi-tenant** — cada usuario tiene su conversación aislada (`conv-<userId>`) y su RAG aislado (chunks filtrados por `userId`).
- **Autenticación JWT** — registro/login con email y password (hash con bcrypt), Passport (`local` + `jwt`).
- **Base de conocimiento por usuario** — sube `.md`, `.txt` o `.pdf`; se guardan en S3 y se ingestan (chunk + embeddings) de forma síncrona.
- **Streaming SSE** — la respuesta del agente se emite en tiempo real (`text/event-stream`).
- **Agente autónomo** — grafo ReAct con LangGraph (`createAgent`), tool `search_docs` sobre la documentación del usuario, hasta 8 tool calls por turno.
- **Guardrails** — detección de prompt injection (ES/EN), sanitización y rate limiting por usuario.

---

## Requisitos previos

| Herramienta             | Versión mínima |
| ----------------------- | -------------- |
| Node.js                 | 18+            |
| pnpm                    | 9+             |
| Docker + Docker Compose | —              |
| API Key de Anthropic    | —              |
| API Key de OpenAI       | —              |

---

## Instalación

```bash
pnpm install

# Levanta Postgres + pgvector y MinIO (S3) + crea el bucket
docker compose up -d
```

## Configuración

```bash
cp .env.template .env   # completa ANTHROPIC_API_KEY, OPENAI_API_KEY y JWT_SECRET
```

Variables relevantes (ver `.env.template` para la lista completa): `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `JWT_SECRET`, `DATABASE_URL`, y el bloque `S3_*` (los valores por defecto apuntan al MinIO del `docker-compose.yml`).

> Las tablas (`users`, `documents`) las crea TypeORM con `synchronize: true` (solo dev). La tabla `chunks` (pgvector) y las de checkpoints de LangGraph se crean automáticamente al arrancar.

## Ejecución

```bash
pnpm start:dev   # desarrollo con watch
pnpm start       # desarrollo
pnpm build && pnpm start:prod   # producción
```

La API queda en `http://localhost:3000`. MinIO expone su consola en `http://localhost:9001` (usuario/clave `minioadmin`).

---

## Endpoints

| Método     | Ruta             | Auth   | Descripción                                                       |
| ---------- | ---------------- | ------ | ----------------------------------------------------------------- |
| `POST`     | `/auth/register` | —      | `{ email, password }` → `{ accessToken }`                         |
| `POST`     | `/auth/login`    | —      | `{ email, password }` → `{ accessToken }`                         |
| `GET`      | `/chat/stream`   | JWT    | `?message=...` → **SSE** con la respuesta del agente              |
| `DELETE`   | `/chat`          | JWT    | Limpia la conversación del usuario                                |
| `POST`     | `/documents`     | JWT    | `multipart/form-data` campo `file` → sube a S3 e ingesta en RAG   |
| `GET`      | `/documents`     | JWT    | Lista los documentos del usuario                                  |
| `DELETE`   | `/documents/:id` | JWT    | Borra el documento de S3 y sus chunks del RAG                     |

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
   ├── POST /documents ─► DocumentsModule
   │        S3Service (MinIO/AWS) ─ text-extractor (md/txt/pdf) ─ chunker
   │                              └─► RagModule.VectorStoreService
   │                                   (PGVectorStore + metadata.userId)   (TypeORM: documents)
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
├── documents/                    # Subida a S3 + ingesta (entity, s3, text-extractor, service, controller)
├── rag/                          # chunker, embeddings, vector-store (filtro userId), retriever
├── chat/                         # agent.service (SSE), chat.controller, checkpointer, system-prompt
├── llm/                          # ChatAnthropic provider + extractText
├── security/guardrails.ts        # Prompt injection, rate limit, sanitización
└── common/types.ts               # Tipos compartidos
```
