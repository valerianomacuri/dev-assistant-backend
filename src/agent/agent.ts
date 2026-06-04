import { createAgent } from "langchain";
import { GraphRecursionError } from "@langchain/langgraph";
import {
  HumanMessage,
  type AIMessageChunk,
  type BaseMessage,
  type ToolMessage,
} from "@langchain/core/messages";
import { chatModel, extractText } from "../llm/chat-model.js";
import { ALL_TOOLS } from "../tools/index.js";
import { AGENT_SYSTEM_PROMPT } from "./system-prompt.js";
import { AgentResponse } from "../types.js";
import { getCheckpointer } from "./checkpointer.js";
import {
  getActiveThreadId,
  newThreadId,
  setActiveThreadId,
} from "./conversation-store.js";

const MAX_TOOL_CALLS = 8;
// Cada ciclo agente→tools→agente consume ~2 supersteps en el grafo.
const RECURSION_LIMIT = 2 * MAX_TOOL_CALLS + 1;

export class DevAssistantAgent {
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private turns = 0;
  private toolCallsLastTurn = 0;

  private constructor(
    private readonly agent: ReturnType<typeof createAgent>,
    private threadId: string,
  ) {}

  /**
   * Construye el agente con el checkpointer persistente de Postgres y resuelve
   * el `thread_id` de la conversación activa (o crea uno nuevo si es la primera
   * vez). Es async porque necesita inicializar el checkpointer y leer la BD.
   */
  static async create(
    systemPrompt: string = AGENT_SYSTEM_PROMPT,
  ): Promise<DevAssistantAgent> {
    const checkpointer = await getCheckpointer();

    let threadId = await getActiveThreadId();
    if (!threadId) {
      threadId = newThreadId();
      await setActiveThreadId(threadId);
    }

    const agent = createAgent({
      model: chatModel,
      tools: ALL_TOOLS,
      systemPrompt,
      checkpointer,
    });

    return new DevAssistantAgent(agent, threadId);
  }

  async chat(
    userMessage: string,
    onChunk?: (fragment: string) => void,
  ): Promise<AgentResponse> {
    this.turns++;
    this.toolCallsLastTurn = 0;
    const toolsUsed: string[] = [];
    let inputTokensThisTurn = 0;
    let outputTokensThisTurn = 0;
    let finalText = "";

    console.log(`\nAgente procesando turno ${this.turns}...`);

    try {
      const stream = await this.agent.stream(
        { messages: [new HumanMessage(userMessage)] },
        {
          configurable: { thread_id: this.threadId },
          recursionLimit: RECURSION_LIMIT,
          streamMode: "messages",
        },
      );

      for await (const event of stream) {
        const [message] = event as [BaseMessage, Record<string, unknown>];
        const type = message.getType();

        if (type === "ai") {
          const usage = (message as AIMessageChunk).usage_metadata;
          if (usage) {
            inputTokensThisTurn += usage.input_tokens ?? 0;
            outputTokensThisTurn += usage.output_tokens ?? 0;
          }
          const text = extractText(message.content);
          if (text) {
            onChunk?.(text);
            finalText += text;
          }
        } else if (type === "tool") {
          this.toolCallsLastTurn++;
          const name = (message as ToolMessage).name ?? "desconocida";
          toolsUsed.push(name);
          console.log(
            `Herramienta ejecutada: ${name} [${this.toolCallsLastTurn}]`,
          );
        }
      }
    } catch (error) {
      if (error instanceof GraphRecursionError) {
        console.warn(
          `Límite de ${MAX_TOOL_CALLS} tool calls alcanzado en este turno`,
        );
        const limitMessage =
          `He alcanzado el límite de ${MAX_TOOL_CALLS} llamadas a herramientas por turno. ` +
          `Para completar esta tarea, intenta dividirla en preguntas más específicas.`;
        this.totalInputTokens += inputTokensThisTurn;
        this.totalOutputTokens += outputTokensThisTurn;
        return {
          text: limitMessage,
          toolsUsed,
          inputTokens: inputTokensThisTurn,
          outputTokens: outputTokensThisTurn,
        };
      }
      throw error;
    }

    this.totalInputTokens += inputTokensThisTurn;
    this.totalOutputTokens += outputTokensThisTurn;
    console.log("Respuesta final generada\n");

    return {
      text: finalText,
      toolsUsed,
      inputTokens: inputTokensThisTurn,
      outputTokens: outputTokensThisTurn,
    };
  }

  /**
   * Devuelve los mensajes guardados de la conversación activa para poder
   * reproducirlos al iniciar el CLI. Vacío si es una conversación nueva.
   */
  async loadHistory(): Promise<BaseMessage[]> {
    const state = (await this.agent.getState({
      configurable: { thread_id: this.threadId },
    })) as { values?: { messages?: unknown } };
    const messages = state.values?.messages;
    return Array.isArray(messages) ? (messages as BaseMessage[]) : [];
  }

  async clearHistory(): Promise<void> {
    // Nuevo thread_id => el checkpointer arranca un historial limpio.
    // La conversación anterior queda archivada en los checkpoints de Postgres.
    this.threadId = newThreadId();
    await setActiveThreadId(this.threadId);
    this.turns = 0;
    this.toolCallsLastTurn = 0;
    console.log("Historial del agente limpiado");
  }

  getStats(): {
    inputTokens: number;
    outputTokens: number;
    turns: number;
    toolCallsLastTurn: number;
  } {
    return {
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      turns: this.turns,
      toolCallsLastTurn: this.toolCallsLastTurn,
    };
  }
}
