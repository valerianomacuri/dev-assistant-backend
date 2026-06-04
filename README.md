# DevAssistant

> Agente inteligente de documentación técnica con RAG, Function Calling y Claude API.

DevAssistant es una CLI conversacional que combina **Retrieval Augmented Generation (RAG)** con un **agente autónomo** basado en Claude de Anthropic. Utiliza **OpenAI `text-embedding-3-small`** para generar los embeddings del pipeline RAG, y **Claude (Anthropic)** como LLM del agente conversacional. Permite cargar tu documentación técnica en una base de datos vectorial y responder preguntas sobre ella con citas precisas a las fuentes, además de explorar y buscar código de forma autónoma mediante herramientas.

---

## Características

- **RAG sobre documentación Markdown** — indexa archivos `.md` en un vector store local (SQLite + sqlite-vec) y responde citando fuentes exactas.
- **Agente autónomo** — loop agentic con hasta 8 tool calls por turno: lista archivos, lee código y busca patrones en el codebase.
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
| npm                            | 9+             |
| API Key de Anthropic           | —              |
| API Key de OpenAI (embeddings) | —              |

---

## Instalación

```bash
# 1. Clona el repositorio
git clone https://github.com/DevTalles-corp/node-dev-assistant
cd dev-assistant

# 2. Instala las dependencias
npm install
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
DB_PATH=./data/vectors.db         # ruta del vector store
RAG_TOP_K=5                       # chunks a recuperar por búsqueda
```

> **Nota:** Nunca hagas commit del archivo `.env`. Está incluido en `.gitignore`.

---

## Uso

### Modo agente (recomendado)

Inicia la CLI interactiva con el agente completo:

```bash
npm run dev
# o
npm start
```

### Ingestión de documentación

Indexa los archivos Markdown de tu proyecto para habilitar el RAG:

```bash
npm run ingest
# o desde la CLI:
/ingest ./docs/mi-proyecto
```

### Demo del agente

Ejecuta el flujo de demostración sin la interfaz interactiva:

```bash
npm run demo
```

### Revisor de código

Ejecuta el ejercicio de code review:

```bash
npm run review
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
│ DevAssistantAgent│   agentic loop (max 8 tool calls/turno)
│   agent.ts       │◄────────────────────────────────────┐
└─────────────────┘                                      │
     │  streaming                                        │
     ▼                                              tool results
┌──────────────────┐     tool_use     ┌─────────────────┐
│  Claude API      │ ───────────────► │  Tool Executor  │
│  (Anthropic SDK) │                  │  • list_files   │
└──────────────────┘                  │  • read_file    │
                                      │  • search_code  │
                                      └─────────────────┘

RAG Pipeline (modo /ingest + consulta directa)
  Markdown files → Chunker → Embeddings (OpenAI text-embedding-3-small) → VectorStore (SQLite)
                                                                                │
  User question → Embeddings (OpenAI text-embedding-3-small) → Retriever ──────┘
                                                                    │
                                               Context → Claude (Anthropic) → Respuesta con fuentes
```

### Flujo RAG

1. **Ingestión:** los archivos `.md` se dividen en chunks por encabezados (`chunker.ts`), se generan embeddings con **OpenAI `text-embedding-3-small`** y se almacenan en SQLite con `sqlite-vec`.
2. **Consulta:** la pregunta del usuario se embebe también con **OpenAI `text-embedding-3-small`**, se recuperan los `TOP_K` chunks más similares y se construye un prompt aumentado que **Claude (Anthropic)** usa para responder citando fuentes.

### Flujo Agente

1. El usuario envía un mensaje; los guardrails lo validan y sanitizan.
2. El agente llama a Claude con las tools definidas.
3. Si Claude responde con `tool_use`, el executor invoca la herramienta y devuelve el resultado.
4. El ciclo se repite hasta `end_turn` o el límite de 8 tool calls.

---

## Estructura del proyecto

```
dev-assistant/
├── src/
│   ├── index.ts                  # Entry point
│   ├── config.ts                 # Configuración desde variables de entorno
│   ├── types.ts                  # Tipos TypeScript compartidos
│   ├── agent/
│   │   ├── agent.ts              # DevAssistantAgent — agentic loop
│   │   ├── demo.ts               # Script de demostración
│   │   ├── system-prompt.ts      # System prompt del agente
│   │   └── tool-registry.ts      # Registro de todas las tools
│   ├── chat/
│   │   ├── cli.ts                # CLI interactiva
│   │   └── conversation.ts       # Manejo de historial de conversación
│   ├── llm/
│   │   ├── anthropic-client.ts   # Cliente Anthropic SDK
│   │   ├── prompts.ts            # Prompts reutilizables
│   │   └── streaming.ts          # Helpers de streaming
│   ├── rag/
│   │   ├── chunker.ts            # División de documentos en chunks
│   │   ├── embeddings.ts         # Generación de embeddings (OpenAI)
│   │   ├── ingest.ts             # Script de ingestión standalone
│   │   ├── rag-chain.ts          # Cadena RAG completa
│   │   ├── retriever.ts          # Búsqueda por similitud vectorial
│   │   └── vector-store.ts       # CRUD sobre SQLite + sqlite-vec
│   ├── security/
│   │   ├── guardrails.ts         # Prompt injection, rate limit, sanitización
│   │   └── examples.ts           # Ejemplos de patrones bloqueados
│   ├── tools/
│   │   ├── definitions.ts        # Esquemas JSON de las tools
│   │   ├── executor.ts           # Ejecución de tools
│   │   └── agent-loop.ts         # Loop agentic standalone
│   ├── exercises/
│   │   └── code-reviewer.ts      # Ejercicio: revisor de código con Claude
│   └── utils/
│       └── cost-calculator.ts    # Estimación de costos USD por modelo
├── docs/
│   └── sample-project/           # Documentación de ejemplo para el RAG
│       ├── README.md
│       ├── api-reference.md
│       └── getting-started.md
├── data/
│   └── vectors.db                # Vector store (generado en runtime)
├── .env.template                 # Plantilla de variables de entorno
├── package.json
└── tsconfig.json
```
