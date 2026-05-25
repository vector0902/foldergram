import { DatabaseSync } from 'node:sqlite';

import { runStartupMigrations } from './migration.js';
import { assertNoLegacySchema } from './schema-compat.js';
import { schemaSql } from './schema.js';
import { storageService } from '../services/storage-service.js';

function initializeTransientDatabase(database: DatabaseSync): DatabaseSync {
  database.exec(schemaSql);
  return database;
}

class DatabaseManager {
  private database: DatabaseSync | null = null;

  get connection(): DatabaseSync {
    if (this.database) {
      return this.database;
    }

    const databasePath = storageService.getDatabasePath();

    if (databasePath === ':memory:') {
      this.database = initializeTransientDatabase(new DatabaseSync(databasePath));
      return this.database;
    }

    runStartupMigrations({ databasePath });
    this.database = new DatabaseSync(databasePath);
    assertNoLegacySchema(this.database);
    return this.database;
  }
}

export const databaseManager = new DatabaseManager();
