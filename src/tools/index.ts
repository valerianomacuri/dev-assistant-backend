import {
  listFilesTool,
  readFileTool,
  searchCodeTool,
} from "./file-tools.js";
import { searchDocsTool } from "./docs-tool.js";
import { createIssueTool } from "./issue-tool.js";

/**
 * Todas las tools del agente en formato LangChain (tool() + zod).
 * Reemplaza a las antiguas definiciones JSON Schema + tool-registry.
 */
export const ALL_TOOLS = [
  listFilesTool,
  readFileTool,
  searchCodeTool,
  searchDocsTool,
  createIssueTool,
];

export interface ToolMeta {
  name: string;
  paramNames: string[];
  description: string;
}

/**
 * Metadata ligera para el comando /tools de la CLI.
 * LangGraph/LangChain no exponen el JSON Schema con la forma anterior,
 * así que mantenemos esta lista en paralelo.
 */
export const TOOL_METADATA: ToolMeta[] = [
  {
    name: "list_files",
    paramNames: ["path", "extension"],
    description: listFilesTool.description,
  },
  {
    name: "read_file",
    paramNames: ["file_path"],
    description: readFileTool.description,
  },
  {
    name: "search_code",
    paramNames: ["pattern", "path", "file_extension"],
    description: searchCodeTool.description,
  },
  {
    name: "search_docs",
    paramNames: ["query", "top_k"],
    description: searchDocsTool.description,
  },
  {
    name: "create_issue",
    paramNames: ["title", "description", "labels", "priority"],
    description: createIssueTool.description,
  },
];
