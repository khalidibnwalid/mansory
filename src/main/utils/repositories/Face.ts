import { FaceGroupModel, FaceKind } from '@main/types/models.shared'
import { toAbsolutePath, toRelativePath } from '../pathUtils'
import Database from 'better-sqlite3'
import { ensureFaceSchema } from './migrations/0005_faces'

type FaceCandidate = {
  imageId: number
  kind: FaceKind
  confidence: number
  box: { x: number; y: number; width: number; height: number }
  cropPath: string
  embedding: number[]
  embeddingModel: string
}

export class FaceRepository {
  constructor(
    public readonly db: Database.Database,
    private rootPath: string,
  ) {
    ensureFaceSchema(db)
  }

  getGroups(includeHidden = false): FaceGroupModel[] {
    const rows = this.db
      .prepare(
        `
      SELECT g.id, g.name, g.kind, g.hidden, g.created_at AS createdAt,
        COUNT(f.id) AS faceCount, COUNT(DISTINCT f.image_id) AS imageCount,
        (SELECT crop_path FROM faces WHERE group_id = g.id
          ORDER BY confidence DESC LIMIT 1) AS coverPath
      FROM face_groups g
      JOIN faces f ON f.group_id = g.id
      JOIN images i ON i.id = f.image_id AND i.deleted_at IS NULL
      WHERE (? = 1 OR g.hidden = 0)
      GROUP BY g.id
      ORDER BY COALESCE(g.name, '') COLLATE NOCASE, imageCount DESC
    `,
      )
      .all(includeHidden ? 1 : 0) as (Omit<FaceGroupModel, 'hidden'> & {
      hidden: number
    })[]
    return rows.map(group => ({
      ...group,
      hidden: !!group.hidden,
      coverPath: group.coverPath
        ? toAbsolutePath(this.rootPath, group.coverPath)
        : null,
    }))
  }

  getPendingImages(
    rescan = false,
    detectorModel = 'owlvit-general',
  ): { id: number; filePath: string; modifiedAt: string }[] {
    const rows = this.db
      .prepare(
        `
      SELECT i.id, i.file_path AS filePath, i.modified_at AS modifiedAt
      FROM images i
      LEFT JOIN face_scan_status s ON s.image_id = i.id
      WHERE i.deleted_at IS NULL
        AND (? = 1 OR s.image_id IS NULL OR s.image_modified_at != i.modified_at
          OR s.detector_model != ?)
      ORDER BY i.id
    `,
      )
      .all(rescan ? 1 : 0, detectorModel) as {
      id: number
      filePath: string
      modifiedAt: string
    }[]
    return rows.map(row => ({
      ...row,
      filePath: toAbsolutePath(this.rootPath, row.filePath),
    }))
  }

  getStats(detectorModel = 'owlvit-general'): {
    faces: number
    groups: number
    scannedImages: number
    pendingImages: number
  } {
    const counts = this.db
      .prepare(
        `
        SELECT
          (SELECT COUNT(*) FROM faces f JOIN images i ON i.id = f.image_id
            WHERE i.deleted_at IS NULL) AS faces,
          (SELECT COUNT(*) FROM face_groups g WHERE EXISTS (
            SELECT 1 FROM faces f JOIN images i ON i.id = f.image_id
            WHERE f.group_id = g.id AND i.deleted_at IS NULL
          )) AS groups,
          (SELECT COUNT(*) FROM face_scan_status s JOIN images i ON i.id = s.image_id
            WHERE i.deleted_at IS NULL) AS scannedImages,
          (SELECT COUNT(*) FROM images i LEFT JOIN face_scan_status s ON s.image_id = i.id
            WHERE i.deleted_at IS NULL
              AND (s.image_id IS NULL OR s.image_modified_at != i.modified_at
                OR s.detector_model != ?)) AS pendingImages
      `,
      )
      .get(detectorModel) as {
      faces: number
      groups: number
      scannedImages: number
      pendingImages: number
    }
    return counts
  }

  clearIndex(): { faces: number; groups: number } {
    const stats = this.getStats()
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM faces').run()
      this.db.prepare('DELETE FROM face_groups').run()
      this.db.prepare('DELETE FROM face_scan_status').run()
    })()
    return { faces: stats.faces, groups: stats.groups }
  }

  replaceImageFaces(
    imageId: number,
    modifiedAt: string,
    candidates: FaceCandidate[],
    similarityThreshold = 0.88,
    detectorModel = 'owlvit-general',
  ): void {
    this.db.transaction(() => {
      // Resolve identities while the previous scan is still present. This preserves a
      // user's name when a modified image is rescanned and it was the group's only image.
      const assignments = candidates.map(candidate => ({
        candidate,
        groupId: this.findOrCreateGroup(candidate, similarityThreshold),
      }))
      this.db.prepare('DELETE FROM faces WHERE image_id = ?').run(imageId)
      for (const { candidate, groupId } of assignments) {
        this.db
          .prepare(
            `
          INSERT INTO faces (image_id, group_id, kind, confidence, box, crop_path, embedding, embedding_model)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
          )
          .run(
            imageId,
            groupId,
            candidate.kind,
            candidate.confidence,
            JSON.stringify(candidate.box),
            toRelativePath(this.rootPath, candidate.cropPath),
            JSON.stringify(candidate.embedding),
            candidate.embeddingModel,
          )
      }
      for (const groupId of new Set(assignments.map(item => item.groupId))) {
        this.updateGroupKind(groupId)
      }
      this.db
        .prepare(
          `
        INSERT INTO face_scan_status (image_id, image_modified_at, detector_model, scanned_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(image_id) DO UPDATE SET
          image_modified_at = excluded.image_modified_at,
          detector_model = excluded.detector_model,
          scanned_at = CURRENT_TIMESTAMP
      `,
        )
        .run(imageId, modifiedAt, detectorModel)
      this.removeEmptyGroups()
    })()
  }

  private findOrCreateGroup(
    candidate: FaceCandidate,
    threshold: number,
  ): number {
    const rows = this.db
      .prepare(
        `
      SELECT f.group_id AS groupId, f.embedding
      FROM faces f JOIN face_groups g ON g.id = f.group_id
      WHERE f.embedding_model = ?
    `,
      )
      .all(candidate.embeddingModel) as {
      groupId: number
      embedding: string
    }[]

    let bestGroup = 0
    let bestScore = -1
    for (const row of rows) {
      const vector = JSON.parse(row.embedding) as number[]
      const score = cosine(candidate.embedding, vector)
      if (score > bestScore) {
        bestScore = score
        bestGroup = row.groupId
      }
    }
    if (bestGroup && bestScore >= threshold) return bestGroup

    const result = this.db
      .prepare('INSERT INTO face_groups (kind) VALUES (?)')
      .run(candidate.kind)
    return Number(result.lastInsertRowid)
  }

  renameGroup(groupId: number, name: string | null): void {
    const value = name?.trim() || null
    this.db
      .prepare('UPDATE face_groups SET name = ? WHERE id = ?')
      .run(value, groupId)
  }

  setGroupHidden(groupId: number, hidden: boolean): void {
    this.db
      .prepare('UPDATE face_groups SET hidden = ? WHERE id = ?')
      .run(hidden ? 1 : 0, groupId)
  }

  mergeGroups(targetGroupId: number, sourceGroupIds: number[]): void {
    const sources = [...new Set(sourceGroupIds)].filter(
      id => id !== targetGroupId,
    )
    if (!sources.length) return
    this.db.transaction(() => {
      const placeholders = sources.map(() => '?').join(',')
      this.db
        .prepare(
          `UPDATE faces SET group_id = ? WHERE group_id IN (${placeholders})`,
        )
        .run(targetGroupId, ...sources)
      this.updateGroupKind(targetGroupId)
      this.db
        .prepare(`DELETE FROM face_groups WHERE id IN (${placeholders})`)
        .run(...sources)
    })()
  }

  private updateGroupKind(groupId: number): void {
    const kinds = this.db
      .prepare(`SELECT DISTINCT kind FROM faces WHERE group_id = ?`)
      .all(groupId) as { kind: FaceKind }[]
    this.db
      .prepare('UPDATE face_groups SET kind = ? WHERE id = ?')
      .run(kinds.length > 1 ? 'mixed' : kinds[0]?.kind || 'mixed', groupId)
  }

  private removeEmptyGroups(): void {
    this.db
      .prepare(
        'DELETE FROM face_groups WHERE id NOT IN (SELECT DISTINCT group_id FROM faces)',
      )
      .run()
  }
}

function cosine(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length)
  let dot = 0
  let aa = 0
  let bb = 0
  for (let i = 0; i < length; i++) {
    dot += a[i] * b[i]
    aa += a[i] * a[i]
    bb += b[i] * b[i]
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0
}
