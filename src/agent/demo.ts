import { DevAssistantAgent } from "./agent.js";

// === Utilidades de presentación ===

function logSeparator(): void {
  console.log("\n" + "═".repeat(60) + "\n");
}

function printScenarioDetails(
  scenarioNumber: number,
  title: string,
  description: string,
): void {
  console.log(`ESCENARIO ${scenarioNumber}: ${title}`);
  console.log(`   ${description}`);
  console.log("");
}

function printStats(devAssistant: DevAssistantAgent): void {
  const stats = devAssistant.getStats();
  console.log(
    `\nStats: ${stats.inputTokens} tokens entrada | ` +
      `${stats.outputTokens} tokens salida | ` +
      `Tools usadas: ${stats.toolCallsLastTurn}`,
  );
}

// Pausa pequeña entre escenarios para evitar rate limiting
async function pauseExecution(ms: number = 800): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// === Escenarios de demostración ===

/**
 * Escenario 1: Exploración de código
 * Demuestra cómo el agente usa read_file o search_code para inspeccionar el codebase.
 */
async function exploreCode(
  devAssistantAgent: DevAssistantAgent,
): Promise<void> {
  printScenarioDetails(
    1,
    "Exploración de código",
    "El agente lee un archivo del proyecto para responder sobre sus exports",
  );

  const question =
    "¿Qué funciones y valores exporta el archivo src/rag/retriever.ts?";
  console.log(`Usuario: ${question}\n`);
  console.log("DevAssistant: ");

  const response = await devAssistantAgent.chat(question, (fragment) => {
    process.stdout.write(fragment);
  });

  process.stdout.write("\n");

  if (response.toolsUsed.length > 0) {
    console.log(`\n🔧 Tools usadas: ${response.toolsUsed.join(", ")}`);
  }

  printStats(devAssistantAgent);
}

/**
 * Escenario 2: Búsqueda en documentación (RAG como tool)
 * Demuestra search_docs. Si no hay docs, el agente lo indica gracefully.
 */
async function searchDocumentation(
  devAssistantAgent: DevAssistantAgent,
): Promise<void> {
  printScenarioDetails(
    2,
    "Búsqueda en documentación",
    "El agente usa search_docs para encontrar información en los docs ingestados",
  );

  const question =
    "¿Cómo se autentican las peticiones a la API según la documentación?";
  console.log(`Usuario: ${question}\n`);
  console.log("DevAssistant: ");

  const response = await devAssistantAgent.chat(question, (fragment) => {
    process.stdout.write(fragment);
  });

  process.stdout.write("\n");

  if (response.toolsUsed.length > 0) {
    console.log(`\nTools usadas: ${response.toolsUsed.join(", ")}`);
  } else {
    console.log(
      "\nTip: Ejecuta npm run ingest para cargar documentación y probar search_docs",
    );
  }

  printStats(devAssistantAgent);
}

/**
 * Escenario 3: Tarea multi-tool
 * Demuestra que el agente puede encadenar múltiples tools en una sola respuesta.
 */
async function executeMultiToolTask(
  devAssistantAgent: DevAssistantAgent,
): Promise<void> {
  printScenarioDetails(
    3,
    "Tarea multi-tool",
    "El agente encadena list_files + read_file para completar una tarea",
  );

  const question =
    "Lista los archivos que hay en src/agent y luego lee el contenido del system prompt del agente.";
  console.log(`Usuario: ${question}\n`);
  console.log("DevAssistant: ");

  const chatResponse = await devAssistantAgent.chat(question, (fragment) => {
    process.stdout.write(fragment);
  });

  process.stdout.write("\n");

  if (chatResponse.toolsUsed.length > 0) {
    console.log(`\n🔧 Tools usadas: ${chatResponse.toolsUsed.join(", ")}`);
  }

  printStats(devAssistantAgent);
}

/**
 * Escenario 4: Crear un issue
 * Demuestra create_issue — una tool con efecto de lado real (escribe a disco).
 */
async function registerBugIssue(
  devAssistantAgent: DevAssistantAgent,
): Promise<void> {
  printScenarioDetails(
    4,
    "Crear un issue",
    "El agente usa create_issue para registrar una tarea en ./issues/",
  );

  const question =
    "Crea un issue de tipo bug: el vector store falla silenciosamente cuando " +
    "DB_PATH apunta a un directorio que no existe. Debería lanzar un error claro " +
    "en lugar de crear la base de datos en una ubicación inesperada. " +
    "Etiquetas: bug, rag. Prioridad: high.";
  console.log(`Usuario: ${question}\n`);
  console.log("DevAssistant: ");

  const response = await devAssistantAgent.chat(question, (fragment) => {
    process.stdout.write(fragment);
  });

  process.stdout.write("\n");

  if (response.toolsUsed.length > 0) {
    console.log(`\n🔧 Tools usadas: ${response.toolsUsed.join(", ")}`);
  }

  printStats(devAssistantAgent);
}

// === Función principal ===

async function runDemo(): Promise<void> {
  console.log("");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║           DevAssistant — Demo Automatizada                 ║");
  console.log("║           Sección 6: Agente Completo                       ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("Esta demo ejecuta 4 escenarios para mostrar las capacidades");
  console.log("del DevAssistantAgent sin necesidad de input del usuario.");

  const devAssistant = new DevAssistantAgent();

  // Escenario 1
  logSeparator();
  await exploreCode(devAssistant);
  devAssistant.clearHistory();
  await pauseExecution();

  // Escenario 2
  logSeparator();
  await searchDocumentation(devAssistant);
  devAssistant.clearHistory();
  await pauseExecution();

  // Escenario 3
  logSeparator();
  await executeMultiToolTask(devAssistant);
  devAssistant.clearHistory();
  await pauseExecution();

  // Escenario 4
  logSeparator();
  await registerBugIssue(devAssistant);
  devAssistant.clearHistory();
  await pauseExecution();

  // Resumen final
  logSeparator();
  console.log("Demo completada exitosamente");
  console.log("");
  console.log("Próximos pasos:");
  console.log("  npm run dev       — Prueba el agente de forma interactiva");
  console.log(
    "  npm run ingest    — Carga documentación para usar search_docs",
  );
  console.log("  ls ./issues/      — Revisa el issue creado en el escenario 4");
  console.log("");
}

// Entry point
runDemo().catch((error: Error) => {
  console.error("Error en la demo:", error.message);
  process.exit(1);
});
