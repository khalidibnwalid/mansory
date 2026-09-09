import Database from 'better-sqlite3'
import { ensureFaceSchema } from './0005_faces'

/**
 * Corrective migration for galleries that reached schema version 6 while the
 * face migration was not present in their running bundle. The helper is
 * idempotent, so normally migrated galleries are left unchanged.
 */
export function up(db: Database.Database): void {
  ensureFaceSchema(db)
}
