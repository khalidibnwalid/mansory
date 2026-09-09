import Database from 'better-sqlite3'
import { ensureFaceSchema } from './0005_faces'
import { seedAppSettings } from '../../seedSettings'

export function up(db: Database.Database): void {
  ensureFaceSchema(db)
  seedAppSettings(db)
}
