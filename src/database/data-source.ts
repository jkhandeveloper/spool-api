// DataSource used by the TypeORM CLI (migrations). Run against the compiled
// output: `npm run build && npm run migration:run`.
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { entities } from './entities.js';
import { migrations } from './migrations/index.js';

export default new DataSource({
  type: 'postgres',
  url:
    process.env.DATABASE_URL ?? 'postgres://spool:spool@localhost:5432/spool',
  entities,
  migrations,
});
