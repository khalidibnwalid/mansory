import Database from 'better-sqlite3'

/**
 * Face tables are also ensured by FaceRepository. That second entry point is
 * intentional: a gallery may already be open when an app update introduces
 * this migration, and some older galleries have an advanced user_version with
 * no face schema.
 */
export function ensureFaceSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS face_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      kind TEXT NOT NULL CHECK(kind IN ('realistic', 'anime', 'mixed')),
      hidden INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS faces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_id INTEGER NOT NULL,
      group_id INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('realistic', 'anime')),
      confidence REAL NOT NULL,
      box TEXT NOT NULL,
      crop_path TEXT NOT NULL,
      embedding TEXT NOT NULL,
      embedding_model TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES face_groups(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS face_scan_status (
      image_id INTEGER PRIMARY KEY,
      image_modified_at DATETIME NOT NULL,
      detector_model TEXT NOT NULL DEFAULT 'legacy',
      scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
    );
  `)

  // Repair databases created by an early face-index build. CREATE TABLE IF NOT
  // EXISTS cannot add newly introduced columns to an already existing table.
  const faceColumns = db.prepare('PRAGMA table_info(faces)').all() as {
    name: string
  }[]
  if (!faceColumns.some(column => column.name === 'embedding_model')) {
    db.exec(
      `ALTER TABLE faces ADD COLUMN embedding_model TEXT NOT NULL DEFAULT 'legacy'`,
    )
  }

  const groupColumns = db.prepare('PRAGMA table_info(face_groups)').all() as {
    name: string
  }[]
  if (!groupColumns.some(column => column.name === 'hidden')) {
    db.exec(
      `ALTER TABLE face_groups ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0`,
    )
  }

  const statusColumns = db
    .prepare('PRAGMA table_info(face_scan_status)')
    .all() as { name: string }[]
  if (!statusColumns.some(column => column.name === 'detector_model')) {
    db.exec(
      `ALTER TABLE face_scan_status ADD COLUMN detector_model TEXT NOT NULL DEFAULT 'legacy'`,
    )
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_faces_image_id ON faces(image_id);
    CREATE INDEX IF NOT EXISTS idx_faces_group_id ON faces(group_id);
  `)
}

export function up(db: Database.Database): void {
  ensureFaceSchema(db)
}
