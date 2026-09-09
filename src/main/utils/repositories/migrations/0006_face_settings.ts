import Database from 'better-sqlite3'
import { seedAppSettings } from '../../seedSettings'

export function up(db: Database.Database): void {
  // Backfill face settings for galleries created before face recognition existed.
  seedAppSettings(db)
}
