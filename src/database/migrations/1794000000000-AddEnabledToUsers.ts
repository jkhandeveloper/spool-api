import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEnabledToUsers1794000000000 implements MigrationInterface {
  name = 'AddEnabledToUsers1794000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "enabled" boolean NOT NULL DEFAULT true`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "enabled"`);
  }
}
