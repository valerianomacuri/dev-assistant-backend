import { BadRequestException } from "@nestjs/common";
import pdfParse from "pdf-parse";

/** Tipos de archivo aceptados para la base de conocimiento. */
export const SUPPORTED_MIME_TYPES = [
  "text/markdown",
  "text/x-markdown",
  "text/plain",
  "application/pdf",
] as const;

/** Algunos clientes envían `application/octet-stream` para .md; validamos por extensión. */
const SUPPORTED_EXTENSIONS = [".md", ".markdown", ".txt", ".pdf"];

export function isSupported(mimeType: string, filename: string): boolean {
  if ((SUPPORTED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return true;
  }
  const lower = filename.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Extrae texto plano de un archivo subido. MD/TXT se decodifican como UTF-8;
 * los PDF se parsean con pdf-parse.
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<string> {
  const lower = filename.toLowerCase();
  const isPdf = mimeType === "application/pdf" || lower.endsWith(".pdf");

  if (isPdf) {
    const parsed = await pdfParse(buffer);
    return parsed.text;
  }

  // MD / TXT
  if (isSupported(mimeType, filename)) {
    return buffer.toString("utf-8");
  }

  throw new BadRequestException(
    `Tipo de archivo no soportado: ${mimeType || filename}. ` +
      `Formatos permitidos: .md, .txt, .pdf`,
  );
}
