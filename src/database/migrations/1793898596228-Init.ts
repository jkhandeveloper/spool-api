import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1793898596228 implements MigrationInterface {
  name = 'Init1793898596228';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying(320) NOT NULL, "passwordHash" character varying(100) NOT NULL, "displayName" character varying(80), "journalOnly" boolean NOT NULL DEFAULT false, "privacyReviewedAt" TIMESTAMP WITH TIME ZONE, "graduatedAt" TIMESTAMP WITH TIME ZONE, "remindersEnabled" boolean NOT NULL DEFAULT true, "reminderTime" character varying(5) DEFAULT '20:00', "textSize" character varying(16) NOT NULL DEFAULT 'default', "reduceMotion" boolean NOT NULL DEFAULT false, "tokenVersion" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "password_resets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "tokenHash" character varying(64) NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "usedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_4816377aa98211c1de34469e742" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_7f6aae0fcc807c9e7194ca5cc4" ON "password_resets"  ("tokenHash") `,
    );
    await queryRunner.query(
      `CREATE TABLE "journal_entries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "title" character varying(120) NOT NULL, "body" text NOT NULL, "includeInPrompts" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a70368e64230434457c8d007ab3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4767468fae34f3d5ad8fa95c55" ON "journal_entries"  ("userId", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "therapy_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'recording', "consentConfirmedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "prompts" jsonb NOT NULL DEFAULT '[]', "durationSeconds" integer, "transcript" text, "title" character varying(120), "topics" jsonb NOT NULL DEFAULT '[]', "mainPoints" jsonb NOT NULL DEFAULT '[]', "takeaways" jsonb NOT NULL DEFAULT '[]', "dailyGoal" character varying(280), "weeklyGoal" character varying(280), "failureReason" character varying(280), "canRetry" boolean NOT NULL DEFAULT false, "processingStartedAt" TIMESTAMP WITH TIME ZONE, "savedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6fe6d9add6f1790d13c7946d1cf" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_85ef6faa3b3d0898c72a9361a3" ON "therapy_sessions"  ("userId", "status", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "goal_check_ins" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "goalId" uuid NOT NULL, "completed" boolean NOT NULL DEFAULT false, "reflection" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_2a6f644e51cc99ce3e994bb26da" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "goals" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "sessionId" uuid, "cadence" character varying(8) NOT NULL, "text" character varying(280) NOT NULL, "active" boolean NOT NULL DEFAULT true, "completedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_26e17b251afab35580dff769223" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c0f79b30d288eb5c18f8b3e9ad" ON "goals"  ("userId", "active") `,
    );
    await queryRunner.query(
      `CREATE TABLE "appointments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "title" character varying(120) NOT NULL DEFAULT 'Therapy appointment', "startsAt" TIMESTAMP WITH TIME ZONE NOT NULL, "durationMinutes" integer NOT NULL DEFAULT '50', "kind" character varying(12) NOT NULL DEFAULT 'in_person', "location" character varying(200), "notes" text, "reminderMinutesBefore" integer DEFAULT '60', "cancelledAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_4a437a9a27e948726b8bb3e36ad" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_aa179be1919264fa62bad54328" ON "appointments"  ("userId", "startsAt") `,
    );
    await queryRunner.query(
      `ALTER TABLE "password_resets" ADD CONSTRAINT "FK_d95569f623f28a0bf034a55099e" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" ADD CONSTRAINT "FK_bf5147ed303e809a150f1f40237" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "therapy_sessions" ADD CONSTRAINT "FK_3bf8460a8cf55ed9b0e829fbb20" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "goal_check_ins" ADD CONSTRAINT "FK_8de353cc011b9b71b41f4867ab4" FOREIGN KEY ("goalId") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "goals" ADD CONSTRAINT "FK_57dd8a3fc26eb760d076bf8840e" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "goals" ADD CONSTRAINT "FK_b03f81d7ec0871b1ff27f905060" FOREIGN KEY ("sessionId") REFERENCES "therapy_sessions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD CONSTRAINT "FK_01733651151c8a1d6d980135cc4" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP CONSTRAINT "FK_01733651151c8a1d6d980135cc4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "goals" DROP CONSTRAINT "FK_b03f81d7ec0871b1ff27f905060"`,
    );
    await queryRunner.query(
      `ALTER TABLE "goals" DROP CONSTRAINT "FK_57dd8a3fc26eb760d076bf8840e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "goal_check_ins" DROP CONSTRAINT "FK_8de353cc011b9b71b41f4867ab4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "therapy_sessions" DROP CONSTRAINT "FK_3bf8460a8cf55ed9b0e829fbb20"`,
    );
    await queryRunner.query(
      `ALTER TABLE "journal_entries" DROP CONSTRAINT "FK_bf5147ed303e809a150f1f40237"`,
    );
    await queryRunner.query(
      `ALTER TABLE "password_resets" DROP CONSTRAINT "FK_d95569f623f28a0bf034a55099e"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_aa179be1919264fa62bad54328"`,
    );
    await queryRunner.query(`DROP TABLE "appointments"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c0f79b30d288eb5c18f8b3e9ad"`,
    );
    await queryRunner.query(`DROP TABLE "goals"`);
    await queryRunner.query(`DROP TABLE "goal_check_ins"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_85ef6faa3b3d0898c72a9361a3"`,
    );
    await queryRunner.query(`DROP TABLE "therapy_sessions"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4767468fae34f3d5ad8fa95c55"`,
    );
    await queryRunner.query(`DROP TABLE "journal_entries"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7f6aae0fcc807c9e7194ca5cc4"`,
    );
    await queryRunner.query(`DROP TABLE "password_resets"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
