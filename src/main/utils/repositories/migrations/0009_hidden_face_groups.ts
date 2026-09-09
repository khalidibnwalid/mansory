import Database from 'better-sqlite3'
import { ensureFaceSchema } from './0005_faces'

export function up(db: Database.Database): void {
  ensureFaceSchema(db)
}
