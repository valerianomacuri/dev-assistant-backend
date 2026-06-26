import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1782492985927 implements MigrationInterface {
    name = 'Init1782492985927'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "agent_runs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "conversation_id" uuid NOT NULL, "status" character varying NOT NULL DEFAULT 'running', "iterations" integer NOT NULL DEFAULT '0', "input_tokens" integer NOT NULL DEFAULT '0', "output_tokens" integer NOT NULL DEFAULT '0', "total_tokens" integer NOT NULL DEFAULT '0', "cache_read_tokens" integer NOT NULL DEFAULT '0', "cache_creation_tokens" integer NOT NULL DEFAULT '0', "error" text, "started_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "finished_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_442f7e0ec4ae860cf17edc57825" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_3bf7cd6e8aa46c1c6008bf7d0d" ON "agent_runs" ("conversation_id") `);
        await queryRunner.query(`CREATE TABLE "conversations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "title" character varying NOT NULL DEFAULT 'Nueva conversación', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_ee34f4f7ced4ec8681f26bf04ef" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_3a9ae579e61e81cc0e989afeb4" ON "conversations" ("user_id") `);
        await queryRunner.query(`CREATE TABLE "messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "conversation_id" uuid NOT NULL, "run_id" uuid, "type" character varying NOT NULL, "name" character varying, "provider_message_id" character varying, "text_content" text, "tool_calls" jsonb, "invalid_tool_calls" jsonb, "tool_call_id" character varying, "model" character varying, "model_provider" character varying, "finish_reason" character varying, "service_tier" character varying, "input_tokens" integer, "output_tokens" integer, "total_tokens" integer, "cache_read_tokens" integer NOT NULL DEFAULT '0', "cache_creation_tokens" integer NOT NULL DEFAULT '0', "raw" jsonb NOT NULL, "iteration" integer, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_18325f38ae6de43878487eff986" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_3bc55a7c3f9ed54b520bb5cfe2" ON "messages" ("conversation_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_7d4f8fd15f1b2848ba0868b60a" ON "messages" ("run_id") `);
        await queryRunner.query(`CREATE TABLE "tool_executions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "message_id" uuid NOT NULL, "run_id" uuid, "tool_name" character varying NOT NULL, "tool_call_id" character varying, "input" jsonb, "output" jsonb, "status" character varying NOT NULL, "error" text, "latency_ms" integer, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_bdd7e5fafce34f8647fde510aff" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_1f017fc4134dbf16f8ffaa1270" ON "tool_executions" ("message_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_42a87c2613ebc310dd2b534c6a" ON "tool_executions" ("run_id") `);
        await queryRunner.query(`CREATE TABLE "documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "filename" character varying NOT NULL, "s3_key" character varying NOT NULL, "mime_type" character varying NOT NULL, "size_bytes" bigint NOT NULL, "chunk_count" integer NOT NULL DEFAULT '0', "status" character varying NOT NULL DEFAULT 'queued', "error_message" character varying, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ac51aa5181ee2036f5ca482857c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c7481daf5059307842edef74d7" ON "documents" ("user_id") `);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying(320) NOT NULL, "password_hash" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c7481daf5059307842edef74d7"`);
        await queryRunner.query(`DROP TABLE "documents"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_42a87c2613ebc310dd2b534c6a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1f017fc4134dbf16f8ffaa1270"`);
        await queryRunner.query(`DROP TABLE "tool_executions"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7d4f8fd15f1b2848ba0868b60a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3bc55a7c3f9ed54b520bb5cfe2"`);
        await queryRunner.query(`DROP TABLE "messages"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3a9ae579e61e81cc0e989afeb4"`);
        await queryRunner.query(`DROP TABLE "conversations"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3bf7cd6e8aa46c1c6008bf7d0d"`);
        await queryRunner.query(`DROP TABLE "agent_runs"`);
    }

}
