import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  executeListFiles,
  executeReadFile,
  executeSearchCode,
} from "./executor.js";

export const listFilesTool = tool(
  async (input) => executeListFiles(input),
  {
    name: "list_files",
    description:
      "Lista los archivos de un directorio del proyecto. " +
      "Útil para explorar la estructura del codebase antes de leer archivos específicos. " +
      "Puede filtrar por extensión de archivo.",
    schema: z.object({
      path: z
        .string()
        .describe(
          "Ruta del directorio a listar, relativa al proyecto (ej: './src', './src/llm'). " +
            "Usa '.' para el directorio raíz del proyecto.",
        ),
      extension: z
        .string()
        .optional()
        .describe(
          "Extensión de archivo para filtrar resultados (ej: '.ts', '.md', '.json'). " +
            "Si se omite, se listan todos los archivos.",
        ),
    }),
  },
);

export const readFileTool = tool(
  async (input) => executeReadFile(input),
  {
    name: "read_file",
    description:
      "Lee el contenido completo de un archivo del proyecto. " +
      "Útil para inspeccionar código fuente, configuración, o documentación. " +
      "Limitado a archivos de máximo 50,000 caracteres.",
    schema: z.object({
      file_path: z
        .string()
        .describe(
          "Ruta del archivo a leer, relativa al proyecto (ej: './src/config.ts', './README.md'). " +
            "Debe ser la ruta completa incluyendo nombre y extensión.",
        ),
    }),
  },
);

export const searchCodeTool = tool(
  async (input) => executeSearchCode(input),
  {
    name: "search_code",
    description:
      "Busca un patrón de texto en los archivos del proyecto y retorna las líneas que coinciden " +
      "con contexto de 2 líneas arriba y abajo. " +
      "Útil para encontrar usos de funciones, variables, o patrones específicos en el codebase.",
    schema: z.object({
      pattern: z
        .string()
        .describe(
          "Texto a buscar (búsqueda exacta por substring, sensible a mayúsculas). " +
            "Ejemplo: 'askClaude', 'export default', 'import Anthropic'",
        ),
      path: z
        .string()
        .optional()
        .describe(
          "Directorio donde buscar, relativo al proyecto (ej: './src', './src/llm'). " +
            "Si se omite, busca en todo el proyecto.",
        ),
      file_extension: z
        .string()
        .optional()
        .describe(
          "Filtrar búsqueda a archivos con esta extensión (ej: '.ts', '.md'). " +
            "Si se omite, busca en todos los tipos de archivo.",
        ),
    }),
  },
);
