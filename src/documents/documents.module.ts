import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RagModule } from "../rag/rag.module";
import { DocumentEntity } from "./document.entity";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { S3Service } from "./s3.service";

@Module({
  imports: [TypeOrmModule.forFeature([DocumentEntity]), RagModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, S3Service],
})
export class DocumentsModule {}
