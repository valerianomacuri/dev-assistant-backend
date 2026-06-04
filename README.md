# DevAssistant

> Agente inteligente de documentación técnica con RAG, Function Calling y Claude API.

DevAssistant es una CLI conversacional que combina **Retrieval Augmented Generation (RAG)** con un **agente autónomo** construido sobre **LangChain** y **LangGraph**. Utiliza **OpenAI `text-embedding-3-small`** para generar los embeddings del pipeline RAG, y **Claude (Anthropic)** vía `ChatAnthropic` de LangChain como LLM del agente conversacional. Los vectores se almacenan en **Postgres + pgvector**. Permite cargar tu documentación técnica en la base de datos vectorial y responder preguntas sobre ella con citas precisas a las fuentes, además de explorar y buscar código de forma autónoma mediante herramientas.

---

## Características

- **RAG sobre documentación Markdown** — indexa archivos `.md` en **Postgres + pgvector** (vía `PGVectorStore` de LangChain) y responde citando fuentes exactas.
- **Agente autónomo** — grafo ReAct con **LangGraph** (`createAgent`), hasta 8 tool calls por turno: lista archivos, lee código, busca patrones, consulta los docs y crea issues.
- **Streaming de respuestas** — output en tiempo real directamente en la terminal.
- **Guardrails de seguridad** — detección de prompt injection (inglés y español), sanitización de entradas y rate limiting configurable.
- **Calculadora de costos** — estima el costo USD de cada sesión según el modelo y los tokens consumidos.
- **Embeddings con OpenAI** — el pipeline RAG usa `text-embedding-3-small` de OpenAI para indexación y búsqueda por similitud vectorial. El agente conversacional usa exclusivamente Claude (Anthropic).

---

## Tabla de contenidos

- [DevAssistant](#devassistant)
  - [Características](#características)
  - [Tabla de contenidos](#tabla-de-contenidos)
  - [Requisitos previos](#requisitos-previos)
  - [Instalación](#instalación)
  - [Configuración](#configuración)
  - [Uso](#uso)
    - [Modo agente (recomendado)](#modo-agente-recomendado)
    - [Ingestión de documentación](#ingestión-de-documentación)
    - [Demo del agente](#demo-del-agente)
    - [Revisor de código](#revisor-de-código)
  - [Comandos disponibles](#comandos-disponibles)
  - [Arquitectura](#arquitectura)
    - [Flujo RAG](#flujo-rag)
    - [Flujo Agente](#flujo-agente)
  - [Estructura del proyecto](#estructura-del-proyecto)

---

## Requisitos previos

| Herramienta                    | Versión mínima |
| ------------------------------ | -------------- |
| Node.js                        | 18+            |
| pnpm                           | 9+             |
| Docker + Docker Compose        | —              |
| API Key de Anthropic           | —              |
| API Key de OpenAI (embeddings) | —              |

---

## Instalación

```bash
# 1. Clona el repositorio
git clone https://github.com/DevTalles-corp/node-dev-assistant
cd dev-assistant

# 2. Instala las dependencias
pnpm install

# 3. Levanta Postgres + pgvector (Docker)
docker compose up -d
```

---

## Configuración

Copia el archivo de variables de entorno y completa tus credenciales:

```bash
cp .env.template .env
```

Edita `.env` con tus valores:

```env
# API Keys
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Proveedor de LLM: anthropic | openai
MODEL_PROVIDER=anthropic

# Modelos
ANTHROPIC_MODEL=claude-sonnet-4-6
OPENAI_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# RAG
DOCS_PATH=./docs/sample-project   # directorio con tus archivos .md
DATABASE_URL=postgresql://devassistant:devassistant@localhost:5432/devassistant  # Postgres + pgvector
RAG_TOP_K=5                       # chunks a recuperar por búsqueda
```

> **Nota:** El `DATABASE_URL` por defecto coincide con las credenciales del `docker-compose.yml`. La tabla `chunks` y la extensión `pgvector` se crean automáticamente en la primera ingestión.

> **Nota:** Nunca hagas commit del archivo `.env`. Está incluido en `.gitignore`.

---

## Uso

### Modo agente (recomendado)

Inicia la CLI interactiva con el agente completo:

```bash
pnpm dev
# o
pnpm start
```

### Ingestión de documentación

Indexa los archivos Markdown de tu proyecto para habilitar el RAG:

```bash
pnpm ingest
# o desde la CLI:
/ingest ./docs/mi-proyecto
```

### Demo del agente

Ejecuta el flujo de demostración sin la interfaz interactiva:

```bash
pnpm demo
```

### Revisor de código

Ejecuta el ejercicio de code review:

```bash
pnpm review
```

---

## Comandos disponibles

Dentro de la CLI interactiva puedes usar estos comandos:

| Comando          | Descripción                                                                      |
| ---------------- | -------------------------------------------------------------------------------- |
| `/ingest [path]` | Indexa los archivos `.md` del directorio indicado (por defecto usa `DOCS_PATH`). |
| `/stats`         | Muestra tokens consumidos, turnos y costo estimado de la sesión.                 |
| `/tools`         | Lista las herramientas disponibles para el agente con su firma y descripción.    |
| `/clear`         | Reinicia el historial de conversación del agente.                                |
| `/exit`          | Termina la sesión y muestra el resumen final.                                    |

Cualquier otro texto es enviado directamente al agente.

---

## Arquitectura

```
Usuario (CLI)
     │
     ▼
┌─────────────┐    guardrails     ┌──────────────────────┐
│   cli.ts    │ ────────────────► │  security/guardrails  │
│  (entrada)  │                   │  • Prompt injection   │
└─────────────┘                   │  • Rate limiting      │
     │                            │  • Sanitización       │
     ▼                            └──────────────────────┘
┌─────────────────┐
│ DevAssistantAgent│   grafo ReAct LangGraph (max 8 tool calls/turno)
│   agent.ts       │◄────────────────────────────────────┐
└─────────────────┘                                      │
     │  streaming                                        │
     ▼                                              tool results
┌──────────────────┐     tool_calls   ┌─────────────────┐
│  ChatAnthropic   │ ───────────────► │  Tools (zod)    │
│  (LangChain)     │                  │  • list_files   │
└──────────────────┘                  │  • read_file    │
                                      │  • search_code  │
                                      │  • search_docs  │
                                      │  • create_issue │
                                      └─────────────────┘

RAG Pipeline (modo /ingest + consulta directa)
  Markdown files → Chunker → PGVectorStore (LangChain) → Postgres + pgvector
                                  │ embeddings: OpenAI text-embedding-3-small
  User question → PGVectorStore.similaritySearch ──────┘
                                                                    │
                                               Context → ChatAnthropic → Respuesta con fuentes
```

### Flujo RAG

1. **Ingestión:** los archivos `.md` se dividen en chunks por encabezados (`chunker.ts`) y se cargan en **Postgres + pgvector** mediante `PGVectorStore` de LangChain, que genera los embeddings con **OpenAI `text-embedding-3-small`** internamente.
2. **Consulta:** `PGVectorStore.similaritySearch` embebe la pregunta, recupera los `TOP_K` chunks más similares (distancia coseno) y se construye un prompt aumentado que **ChatAnthropic** usa para responder citando fuentes.

### Flujo Agente

1. El usuario envía un mensaje; los guardrails lo validan y sanitizan.
2. El grafo ReAct de **LangGraph** (`createAgent`) invoca a `ChatAnthropic` con las tools (definidas con `tool()` + zod).
3. Si el modelo emite `tool_calls`, el `ToolNode` de LangGraph ejecuta la herramienta y devuelve el resultado.
4. El ciclo se repite hasta la respuesta final o el límite de 8 tool calls (`recursionLimit`). El historial se persiste con `MemorySaver`.

---

## Estructura del proyecto

```
dev-assistant/
├── src/
│   ├── index.ts                  # Entry point
│   ├── config.ts                 # Configuración desde variables de entorno
│   ├── types.ts                  # Tipos TypeScript compartidos
│   ├── agent/
│   │   ├── agent.ts              # DevAssistantAgent — grafo ReAct (LangGraph)
│   │   ├── demo.ts               # Script de demostración
│   │   └── system-prompt.ts      # System prompt del agente
│   ├── cli/
│   │   ├── cli.ts                # CLI interactiva
│   │   └── conversation.ts       # Manejo de historial de conversación
│   ├── llm/
│   │   ├── chat-model.ts         # ChatAnthropic compartido (LangChain)
│   │   ├── prompts.ts            # Prompts reutilizables
│   │   └── streaming.ts          # Helpers de streaming
│   ├── rag/
│   │   ├── chunker.ts            # División de documentos en chunks
│   │   ├── embeddings.ts         # OpenAIEmbeddings (LangChain)
│   │   ├── ingest.ts             # Script de ingestión standalone
│   │   ├── rag-chain.ts          # Cadena RAG completa
│   │   ├── retriever.ts          # Búsqueda por similitud vectorial
│   │   └── vector-store.ts       # PGVectorStore sobre Postgres + pgvector
│   ├── security/
│   │   └── guardrails.ts         # Prompt injection, rate limit, sanitización
│   ├── tools/
│   │   ├── file-tools.ts         # Tools list_files / read_file / search_code
│   │   ├── docs-tool.ts          # Tool search_docs (RAG)
│   │   ├── issue-tool.ts         # Tool create_issue
│   │   ├── executor.ts           # Lógica de filesystem reusada
│   │   └── index.ts              # ALL_TOOLS + metadata para /tools
│   ├── exercises/
│   │   └── code-reviewer.ts      # Ejercicio: revisor de código con Claude
│   └── utils/
│       └── cost-calculator.ts    # Estimación de costos USD por modelo
├── docs/
│   └── sample-project/           # Documentación de ejemplo para el RAG
│       ├── README.md
│       ├── api-reference.md
│       └── getting-started.md
├── docker-compose.yml            # Postgres + pgvector
├── .env.template                 # Plantilla de variables de entorno
├── package.json
└── tsconfig.json
```
