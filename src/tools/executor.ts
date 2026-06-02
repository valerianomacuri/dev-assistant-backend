import * as fs from "fs/promises";
import * as path from "path";

const PROJECT_ROOT = process.cwd();

const MAX_FILE_SIZE = 50_000;

const MAX_SEARCH_RESULTS = 20;

const CONTEXT_LINES = 2;

function resolveSecurePath(tagetPath: string): string | null {
  const absolutePath = path.resolve(PROJECT_ROOT, tagetPath);
  const projectwithSep = PROJECT_ROOT + path.sep;
  if (
    !absolutePath.startsWith(projectwithSep) &&
    absolutePath !== PROJECT_ROOT
  ) {
    return null;
  }
  return absolutePath;
}

async function collectFiles(
  dirPath: string,
  extension?: string,
): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await collectFiles(fullPath, extension);
      results.push(...subFiles);
    } else if (entry.isFile()) {
      if (!extension || entry.name.endsWith(extension)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

async function executeListFiles(params: {
  path: string;
  extension?: string;
}): Promise<string> {
  const securePath = resolveSecurePath(params.path);
  if (!securePath) {
    return `Error de seguridad: la ruta "${params.path}" intenta acceder fuera del proyecto.`;
  }
  try {
    const stat = await fs.stat(securePath);
    if (!stat.isDirectory()) {
      return `Error: ${params.path} no es un directorio.`;
    }
  } catch {
    return `Error: el directorio ${params.path} no existe.`;
  }

  const files = await collectFiles(securePath, params.extension);
  if (files.length === 0) {
    const filterFile = params.extension
      ? ` con extensión ${params.extension}`
      : "";
    return `No se encontraron archivos${filterFile} en "${params.path}"`;
  }
  const relativePaths = files.map((file) => path.relative(PROJECT_ROOT, file));
  return relativePaths.join("\\n");
}

async function executeReadFile(params: { file_path: string }): Promise<string> {
  const securePath = resolveSecurePath(params.file_path);
  if (!securePath) {
    return `Error de seguridad: la ruta "${params.file_path}" intenta acceder fuera del proyecto.`;
  }
  try {
    const stat = await fs.stat(securePath);
    if (stat.isDirectory()) {
      return `Error: ${params.file_path} es un directorio, no un archivo.`;
    }

    if (stat.size > MAX_FILE_SIZE) {
      return (
        ` Archivo demasiado grande (${stat.size} bytes) ` +
        `Considera leer una sección en especifico.`
      );
    }
    const content = await fs.readFile(securePath, "utf-8");
    if (content.length > MAX_FILE_SIZE) {
      return content.slice(0, MAX_FILE_SIZE) + "\\n\\n... [archivo truncado]";
    }
    return content;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return `Error: el archivo ${params.file_path} no existe.`;
    }
    return `Error al leer el archivo ${params.file_path}.`;
  }
}

async function executeSearchCode(params: {
  pattern: string;
  path?: string;
  file_extension?: string;
}): Promise<string> {
  const searchPath = params.path ?? ".";
  const securePath = resolveSecurePath(searchPath);
  if (!securePath) {
    return `Error de seguridad: la ruta "${searchPath}" intenta acceder fuera del proyecto.`;
  }
  const files = await collectFiles(securePath, params.file_extension);

  const results: string[] = [];
  let totalMatches = 0;

  for (const file of files) {
    if (totalMatches >= MAX_SEARCH_RESULTS) break;

    let content: string;

    try {
      content = await fs.readFile(file, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    const relativePath = path.relative(PROJECT_ROOT, file);

    for (let i = 0; i < lines.length; i++) {
      if (totalMatches >= MAX_SEARCH_RESULTS) break;

      const line = lines[i] ?? "";
      if (!line.includes(params.pattern)) continue;

      totalMatches++;

      const contextBlock: string[] = [];
      const startLine = Math.max(0, i - CONTEXT_LINES);
      const endLine = Math.min(lines.length - 1, i + CONTEXT_LINES);
      for (let j = startLine; j <= endLine; j++) {
        const contextLine = lines[j] ?? "";
        const lineNumber = j + 1;
        const prefix = j === i ? ">" : " ";
        contextBlock.push(
          `${prefix} ${relativePath}: ${lineNumber}: ${contextLine}`,
        );
      }
      results.push(contextBlock.join("\n"));
    }
  }
  if (results.length === 0) {
    return `Sin coincidencias para:${params.pattern}`;
  }
  const header =
    totalMatches >= MAX_SEARCH_RESULTS
      ? `Coincidencias: ${MAX_SEARCH_RESULTS}`
      : `Coincidencias: ${totalMatches}`;

  return header + results.join("\n\n");
}
export async function executeTool(
  name: string,
  params: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case "list_files": {
      const p = params as { path?: unknown; extension?: unknown };
      if (typeof p.path !== "string") {
        return "Error: el parámetro 'path' es requerido y debe ser string.";
      }
      return executeListFiles({
        path: p.path,
        extension: typeof p.extension === "string" ? p.extension : undefined,
      });
    }

    case "read_file": {
      const p = params as { file_path?: unknown };
      if (typeof p.file_path !== "string") {
        return "Error: el parámetro 'file_path' es requerido y debe ser string.";
      }
      return executeReadFile({ file_path: p.file_path });
    }

    case "search_code": {
      const p = params as {
        pattern: unknown;
        path?: unknown;
        file_extension?: unknown;
      };
      if (typeof p.pattern !== "string") {
        return "Error: el parámetro 'pattern' es requerido y debe ser string.";
      }
      return executeSearchCode({
        pattern: p.pattern,
        path: typeof p.path === "string" ? p.path : undefined,
        file_extension:
          typeof p.file_extension === "string" ? p.file_extension : undefined,
      });
    }
    default:
      return `Error: tool desconocida "${name}. Tools disponibles: list_files,read_file, search_code."`;
  }
}
