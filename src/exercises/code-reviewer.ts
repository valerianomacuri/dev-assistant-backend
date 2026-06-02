import * as fs from "fs";
import * as path from "path";
import { streamClaude } from "../llm/streaming.js";
import { CODE_REVIEWER_PROMPT } from "../llm/prompts.js";

// Extensiones de archivo que soportamos
const SUPPORTED_FILE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".cs",
  ".cpp",
  ".c",
  ".rb",
  ".php",
  ".swift",
  ".kt",
  ".sql",
]);
// Límite de tamaño: archivos muy grandes consumen muchos tokens
const MAX_CHARS = 20_000;

async function reviewFile(filePath: string): Promise<void> {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    console.error(" Archivo no encontrado: ", absolutePath);
    process.exit(1);
  }
  const fileExtension = path.extname(absolutePath).toLowerCase();
  if (!SUPPORTED_FILE_EXTENSIONS.has(fileExtension)) {
    console.warn(
      `Esta extensión "${fileExtension} no reconocida. Continuando de todas formas..."`,
    );
  }

  const content = fs.readFileSync(absolutePath, "utf-8");
  const totalLines = content.split("\n").length;
  const fileName = path.basename(absolutePath);

  let reviewContent = content;
  let sizeWarning = "";

  if (content.length > MAX_CHARS) {
    reviewContent = content.slice(0, MAX_CHARS);
    sizeWarning =
      " Archivo muy grande - revisando primeras " + MAX_CHARS + " caracteres";
  }

  // Mostrar header
  console.log("╔════════════════════════════════════════╗");
  console.log("║       DevAssistant — Code Reviewer     ║");
  console.log("╚════════════════════════════════════════╝");
  console.log(`\n📄 Archivo: ${fileName}`);
  console.log(`   Ruta: ${absolutePath}`);
  console.log(`   Líneas: ${totalLines} | Caracteres: ${content.length}`);
  if (sizeWarning) console.log(sizeWarning);
  console.log("\nAnalizando con Claude...\n");
  console.log("─".repeat(60));

  // Construir el prompt con el contexto del archivo
  const prompt = `Por favor, revisa el siguiente archivo de código:
    **Archivo:** \`${fileName}\`
    **Extensión:** ${fileExtension || "desconocida"}
    **Líneas:** ${totalLines}
    \`\`\`${fileExtension.slice(1)}
    ${reviewContent}
    \`\`\``;

  await streamClaude(prompt, CODE_REVIEWER_PROMPT);
  console.log("-".repeat(60));
  console.log("Review completada");
}

const inputArguments = process.argv.slice(2);
if (inputArguments.length === 0) {
  console.error("Uso: npm run review <ruta-del-archivo>");
  console.error("Ejemplo: npm run review ./src/config.ts");
  process.exit(1);
}
const filePath = inputArguments[0];
if (!filePath) {
  console.error("Debes especificar la ruta del archivo a revisar.");
  process.exit(1);
}

reviewFile(filePath).catch((error: Error) => {
  console.error("Error: ", error.message);
  process.exit(1);
});
