import * as fs from "fs/promises";
import * as path from "path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

async function createIssue(params: {
  title: string;
  description: string;
  labels?: string[];
  priority?: string;
}): Promise<string> {
  try {
    const issuesDir = "./issues";
    await fs.mkdir(issuesDir, { recursive: true });

    const existingFiles = await fs.readdir(issuesDir);
    const existingIssues = existingFiles.filter((file) => file.endsWith(".md"));
    const issueNumber = existingIssues.length + 1;

    const formattedNumber = String(issueNumber).padStart(3, "0");
    const fileName = `issue-${formattedNumber}.md`;
    const fullPath = path.join(issuesDir, fileName);

    const date = new Date().toISOString().substring(0, 10);
    const labelsStr = params.labels?.join(", ") ?? "sin etiquetas";
    const priority = params.priority ?? "medium";
    const content = `# Issue #${issueNumber}: ${params.title}
      ## Metadata
      - **Fecha:** ${date}
      - **Prioridad:** ${priority}
      - **Etiquetas:** ${labelsStr}
      - **Estado:** abierto
      ## Descripción
      ${params.description}
      ---
      *Issue creado automáticamente por DevAssistant*
      `;
    await fs.writeFile(fullPath, content, "utf-8");
    return `Issue creado satisfactoriamente: ${fullPath}\nTítulo: ${params.title}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Error al crear el issue: ${message}`;
  }
}

export const createIssueTool = tool(async (input) => createIssue(input), {
  name: "create_issue",
  description:
    "Crea un issue o tarea en el directorio ./issues/ del proyecto. " +
    "Úsala cuando el usuario quiera reportar un bug, registrar una mejora, " +
    "o crear una tarea de seguimiento. " +
    "Los issues se guardan como archivos Markdown con numeración automática.",
  schema: z.object({
    title: z.string().describe("Título conciso del issue."),
    description: z
      .string()
      .describe("Descripción detallada del problema o tarea."),
    labels: z
      .array(z.string())
      .optional()
      .describe(
        "Etiquetas opcionales (ej: ['bug', 'enhancement', 'documentation']).",
      ),
    priority: z
      .enum(["low", "medium", "high"])
      .optional()
      .describe("Prioridad del issue (default: medium)."),
  }),
});
