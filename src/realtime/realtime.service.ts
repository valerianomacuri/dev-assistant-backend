import { Injectable } from "@nestjs/common";
import type { DocumentStatus } from "../documents/document.entity";
import { EventsGateway, userRoom } from "./events.gateway";

/** Payload del evento `document.status` empujado al frontend. */
export interface DocumentStatusEvent {
  id: string;
  status: DocumentStatus;
  chunkCount?: number;
  errorMessage?: string | null;
}

/**
 * Fachada para emitir eventos en tiempo real desde cualquier servicio
 * (ingesta, workers SQS) sin acoplarse al gateway de Socket.IO.
 */
@Injectable()
export class RealtimeService {
  constructor(private readonly gateway: EventsGateway) {}

  /** Notifica un cambio de estado de un documento al usuario dueño. */
  emitDocumentStatus(userId: string, event: DocumentStatusEvent): void {
    this.gateway.server?.to(userRoom(userId)).emit("document.status", event);
  }
}
