// Register migrations here in order. Generate new ones with
// `npm run migration:generate -- src/database/migrations/<Name>`.
import { Init1793898596228 } from './1793898596228-Init.js';
import { AddEnabledToUsers1794000000000 } from './1794000000000-AddEnabledToUsers.js';

export const migrations = [Init1793898596228, AddEnabledToUsers1794000000000];
