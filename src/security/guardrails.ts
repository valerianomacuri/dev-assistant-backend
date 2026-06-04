export interface GuardrailResult {
  safe: boolean;
  reason?: string;
  sanitized: string;
}
export interface RateLimiterConfig {
  maxRequests: number;
  windowMs: number;
}
export class RateLimiter {
  private timestamps: number[] = [];
  constructor(private config: RateLimiterConfig) {}
  check(): boolean {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    this.timestamps = this.timestamps.filter((t) => t > windowStart);
    if (this.timestamps.length >= this.config.maxRequests) {
      return false;
    }
    this.timestamps.push(now);
    return true;
  }
  reset(): void {
    this.timestamps = [];
  }
  get remaining(): number {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const active = this.timestamps.filter((t) => t > windowStart).length;
    return Math.max(0, this.config.maxRequests - active);
  }
}
const INJECTION_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  // --- Inglés ---
  {
    name: "ignore instructions",
    regex: /ignore\s+(?:\w+\s+){0,3}instructions?/i,
  },
  {
    name: "forget instructions",
    regex:
      /forget\s+(everything|all|your\s+instructions?|what\s+you\s+were\s+told)/i,
  },
  {
    name: "you are now",
    regex: /you\s+are\s+now\s+/i,
  },
  {
    name: "act as",
    regex: /act\s+as\s+(if\s+)?you\s+(are|were)\s+/i,
  },
  {
    name: "disregard",
    regex: /disregard\s+(your|all|previous|the)\s+/i,
  },
  {
    name: "new instructions",
    regex: /new\s+instructions?\s*:/i,
  },
  {
    name: "system override",
    regex: /system\s*:?\s*you\s+/i,
  },
  {
    name: "override system prompt",
    regex: /override\s+(the\s+)?(system\s+prompt|your\s+instructions?)/i,
  },

  // --- Español ---
  {
    name: "ignorar instrucciones (es)",
    regex:
      /ignora\s+(las\s+)?(instrucciones?\s+)?(anteriores?|previas?|todas?)/i,
  },
  {
    name: "olvida instrucciones (es)",
    regex:
      /olvida\s+(todo|las\s+instrucciones?|lo\s+que\s+te\s+(dijeron|indicaron))/i,
  },
  {
    name: "ahora eres (es)",
    regex: /ahora\s+(eres|serás|actúas?\s+como)\s+/i,
  },
  {
    name: "actúa como (es)",
    regex: /act[uú]a\s+(como\s+si\s+)?(fueras?|eres)\s+/i,
  },
  {
    name: "actúa como (es)",
    regex: /act[uú]a\s+como\s+/i,
  },
  {
    name: "nuevas instrucciones (es)",
    regex: /nuevas?\s+instrucciones?\s*:/i,
  },
  {
    name: "ignora todo (es)",
    regex: /ignora\s+todo\s+(lo\s+anterior|lo\s+que\s+)/i,
  },
  {
    name: "eres libre (es)",
    regex: /eres\s+libre\s+(de|para)\s+/i,
  },
  {
    name: "sin restricciones (es)",
    regex: /sin\s+(ninguna\s+)?(restricci[oó]n|l[ií]mite|instrucci[oó]n)/i,
  },
];
export function sanitizeInput(input: string): string {
  const MAX_LENGTH = 8_000;
  let result = input
    .replace(/\0/g, "") // Null bytes eliminados
    .replace(/\n{3,}/g, "\n\n") // se permite solo dos saltos de línea
    .replace(/[\x00-\x1F\x7F]/g, ""); // Chars de control eliminados
  if (result.length > MAX_LENGTH) {
    result =
      result.slice(0, MAX_LENGTH) +
      "\nExcedía el límite — cortado a 8000 chars";
  }
  return result;
}
export function detectPromptInjection(input: string): {
  detected: boolean;
  pattern?: string;
} {
  for (const { name, regex } of INJECTION_PATTERNS) {
    if (regex.test(input)) {
      return { detected: true, pattern: name };
    }
  }
  return { detected: false };
}
export function checkGuardrails(
  input: string,
  rateLimiter: RateLimiter,
): GuardrailResult {
  const sanitized = sanitizeInput(input);
  const injectionCheck = detectPromptInjection(input);
  if (injectionCheck.detected) {
    console.warn(`Prompt injection detectado: ${injectionCheck.pattern}`);
    return {
      safe: false,
      reason:
        "Tu mensaje contiene patrones que intentan modificar el comportamiento del asistente.\n" +
        "Por favor reformula tu pregunta.",
      sanitized,
    };
  }
  if (!rateLimiter.check()) {
    console.warn(`Rate limit alcanzado`);
    return {
      safe: false,
      reason:
        `Demasiadas solicitudes en poco tiempo.\n` +
        `Espera un momento antes de continuar. (Restantes: ${rateLimiter.remaining})`,
      sanitized,
    };
  }
  return { safe: true, sanitized };
}
export function createRateLimiter(
  config?: Partial<RateLimiterConfig>,
): RateLimiter {
  return new RateLimiter({
    maxRequests: config?.maxRequests ?? 10,
    windowMs: config?.windowMs ?? 60_000,
  });
}
