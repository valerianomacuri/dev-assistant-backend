import "reflect-metadata";
import "dotenv/config";
import { DataSource } from "typeorm";
import { AgentRunEntity } from "../chat/agent-run.entity";
import { ConversationEntity } from "../chat/conversation.entity";
import { MessageEntity } from "../chat/message.entity";
import { ToolExecutionEntity } from "../chat/tool-execution.entity";
import { DocumentEntity } from "../documents/document.entity";
import { User } from "../users/user.entity";

/**
 * DataSource para el CLI de TypeORM (migration:generate / run / revert).
 *
 * La app en runtime NO usa este archivo: TypeORM se configura vía Nest en
 * `app.module.ts`. Aquí solo importa que la lista de entidades y la ruta de
 * migraciones coincidan, para que `migration:generate` produzca el diff
 * correcto contra el esquema de la base de datos apuntada por `DATABASE_URL`.
 */
export default new DataSource({
  type: "postgres",
  url:
    process.env.DATABASE_URL ??
    "postgresql://devassistant:devassistant@localhost:5432/devassistant",
  entities: [
    User,
    DocumentEntity,
    ConversationEntity,
    AgentRunEntity,
    MessageEntity,
    ToolExecutionEntity,
  ],
  migrations: [__dirname + "/migrations/*.{js,ts}"],
});
