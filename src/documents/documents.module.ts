import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RagModule } from "../rag/rag.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { DocumentEntity } from "./document.entity";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { IngestConsumer } from "./ingestion/ingest.consumer";
import { SqsProducerService } from "./ingestion/sqs-producer.service";
import { S3Service } from "./s3.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentEntity]),
    RagModule,
    RealtimeModule,
  ],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    S3Service,
    SqsProducerService,
    // IngestConsumer,
  ],
})
export class DocumentsModule {}
