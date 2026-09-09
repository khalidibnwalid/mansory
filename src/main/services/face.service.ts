import { FaceKind } from '@main/types/models.shared'
import { CONFIG_DIR } from '@main/utils/files/config'
import { FaceRepository } from '@main/utils/repositories/Face'
import { clipService } from './clip.service'
import { env, pipeline, RawImage } from '@huggingface/transformers'
import { mkdir } from 'fs/promises'
import { basename, join } from 'path'
import sharp from 'sharp'
import { randomUUID } from 'crypto'
import { notifier } from './notifier.service'
import {
  NOTIFIER_EVENTS,
  NOTIFIER_EVENT_TYPES,
} from '@main/types/constants.shared'
import { AppSettingsRepository } from '@main/utils/repositories/appSettings'
import {
  APP_SETTING_KEYS,
  FACE_DETECTION_THRESHOLD_DEFAULT,
  FACE_GROUPING_THRESHOLD_DEFAULT,
  FACE_DETECTION_MODEL_DEFAULT,
} from '@main/utils/appSettingsKeys'
import { animeFaceDetectorService } from './anime-face-detector.service'

type Detection = {
  score: number
  label: string
  box: { xmin: number; ymin: number; xmax: number; ymax: number }
}

type ScannedFace = {
  imageId: number
  kind: FaceKind
  confidence: number
  box: { x: number; y: number; width: number; height: number }
  cropPath: string
  embedding: number[]
  embeddingModel: string
}

class FaceService {
  private detector: any = null
  private detectorPromise: Promise<any> | null = null

  private async getDetector(cacheDir: string): Promise<any> {
    if (this.detector) return this.detector
    if (this.detectorPromise) return this.detectorPromise
    env.cacheDir = join(cacheDir, 'models')
    env.allowLocalModels = true
    this.detectorPromise = pipeline(
      'zero-shot-object-detection',
      'Xenova/owlvit-base-patch32',
      { dtype: 'q8' },
    )
      .then(value => {
        this.detector = value
        return value
      })
      .catch(error => {
        this.detectorPromise = null
        throw error
      })
    return this.detectorPromise
  }

  async scan(
    rootPath: string,
    repo: FaceRepository,
    options: { rescan?: boolean } = {},
  ): Promise<{ scanned: number; faces: number; failed: number }> {
    const settings = new AppSettingsRepository(repo.db)
    const enabled =
      settings.getParsedValue<boolean>(APP_SETTING_KEYS.FACE_ENABLED) ?? true
    if (!enabled) throw new Error('Face recognition is disabled in Settings')

    // Both prompt families are always active. Kind is only an internal detector
    // detail and does not divide identities into user-facing categories.
    const kinds: FaceKind[] = ['realistic', 'anime']
    const detectionThreshold =
      settings.getParsedValue<number>(
        APP_SETTING_KEYS.FACE_DETECTION_THRESHOLD,
      ) ?? FACE_DETECTION_THRESHOLD_DEFAULT
    const groupingThreshold =
      settings.getParsedValue<number>(
        APP_SETTING_KEYS.FACE_GROUPING_THRESHOLD,
      ) ?? FACE_GROUPING_THRESHOLD_DEFAULT
    const detectorModel =
      settings.getParsedValue<string>(APP_SETTING_KEYS.FACE_DETECTION_MODEL) ??
      FACE_DETECTION_MODEL_DEFAULT
    const pending = repo.getPendingImages(!!options.rescan, detectorModel)
    if (!pending.length) return { scanned: 0, faces: 0, failed: 0 }

    const sessionId = randomUUID()
    notifier.notify({
      id: NOTIFIER_EVENTS.FACES.SCAN,
      type: NOTIFIER_EVENT_TYPES.PROGRESS_PART,
      payload: {
        order: 0,
        total: pending.length,
        facesFound: 0,
        sessionId,
      },
    })

    const cacheDir = join(rootPath, CONFIG_DIR)
    const cropsDir = join(cacheDir, 'faces')
    let detector: any = null
    try {
      await mkdir(cropsDir, { recursive: true })
      if (detectorModel === 'deepghs-anime-v1.4-n') {
        await animeFaceDetectorService.init(cacheDir)
      } else {
        detector = await this.getDetector(cacheDir)
      }
      clipService.loadSettingsFromDb(repo.db)
      await clipService.init(cacheDir)
    } catch (error) {
      notifier.notify({
        id: NOTIFIER_EVENTS.FACES.SCAN,
        type: NOTIFIER_EVENT_TYPES.STATUS,
        payload: {
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
          sessionId,
        },
      })
      throw error
    }
    let faceCount = 0
    let failed = 0
    for (let imageIndex = 0; imageIndex < pending.length; imageIndex++) {
      const image = pending[imageIndex]
      try {
        const raw = await RawImage.read(image.filePath)
        const detections =
          detectorModel === 'deepghs-anime-v1.4-n'
            ? (
                await animeFaceDetectorService.detect(
                  image.filePath,
                  cacheDir,
                  detectionThreshold,
                )
              ).map(item => ({
                ...item,
                label: 'face',
                kind: 'anime' as const,
              }))
            : suppressOverlaps(
                (
                  (await detector(
                    raw,
                    kinds.flatMap(kind =>
                      kind === 'realistic'
                        ? ['a real human face', 'a photographic portrait face']
                        : ['an anime face', 'an illustrated cartoon face'],
                    ),
                    { threshold: detectionThreshold },
                  )) as Detection[]
                )
                  .map(item => ({
                    ...item,
                    kind: /anime|illustrated|cartoon/i.test(item.label)
                      ? ('anime' as const)
                      : ('realistic' as const),
                  }))
                  .filter(item => kinds.includes(item.kind)),
              )

        const metadata = await sharp(image.filePath, {
          failOn: 'none',
        }).metadata()
        const width = metadata.width || raw.width
        const height = metadata.height || raw.height
        const candidates: ScannedFace[] = []
        for (let index = 0; index < detections.length; index++) {
          const item = detections[index]
          const box = clampBox(item.box, width, height)
          if (box.width < 24 || box.height < 24) continue
          const cropPath = join(cropsDir, `${image.id}-${index}.jpg`)
          await sharp(image.filePath, { failOn: 'none' })
            .extract(box)
            .resize(224, 224, { fit: 'cover' })
            .jpeg({ quality: 88 })
            .toFile(cropPath)
          const embedding = await clipService.getImageEmbedding(cropPath)
          candidates.push({
            imageId: image.id,
            kind: item.kind,
            confidence: item.score,
            box: {
              x: box.left,
              y: box.top,
              width: box.width,
              height: box.height,
            },
            cropPath,
            embedding: Array.from(embedding),
            embeddingModel: clipService.getModelName(),
          })
        }
        repo.replaceImageFaces(
          image.id,
          image.modifiedAt,
          candidates,
          groupingThreshold,
          detectorModel,
        )
        faceCount += candidates.length
      } catch (error) {
        failed++
        console.error(`[Face scan] Failed to scan ${image.filePath}:`, error)
      }
      notifier.notify({
        id: NOTIFIER_EVENTS.FACES.SCAN,
        type: NOTIFIER_EVENT_TYPES.PROGRESS_PART,
        payload: {
          order: imageIndex + 1,
          total: pending.length,
          facesFound: faceCount,
          fileName: basename(image.filePath),
          sessionId,
        },
      })
    }
    notifier.notify({
      id: NOTIFIER_EVENTS.FACES.SCAN,
      type: NOTIFIER_EVENT_TYPES.PROGRESS_COMPLETE,
      payload: {
        totalProcessed: pending.length - failed,
        totalFailed: failed,
        totalFaces: faceCount,
        sessionId,
      },
    })
    return { scanned: pending.length - failed, faces: faceCount, failed }
  }
}

function clampBox(
  box: Detection['box'],
  imageWidth: number,
  imageHeight: number,
): { left: number; top: number; width: number; height: number } {
  const rawWidth = box.xmax - box.xmin
  const rawHeight = box.ymax - box.ymin
  const padX = rawWidth * 0.12
  const padY = rawHeight * 0.16
  const left = Math.max(0, Math.floor(box.xmin - padX))
  const top = Math.max(0, Math.floor(box.ymin - padY))
  const right = Math.min(imageWidth, Math.ceil(box.xmax + padX))
  const bottom = Math.min(imageHeight, Math.ceil(box.ymax + padY))
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  }
}

function suppressOverlaps<T extends Detection>(items: T[]): T[] {
  const sorted = [...items].sort((a, b) => b.score - a.score)
  const kept: T[] = []
  for (const item of sorted) {
    if (
      !kept.some(other => intersectionOverUnion(item.box, other.box) > 0.55)
    ) {
      kept.push(item)
    }
  }
  return kept
}

function intersectionOverUnion(
  a: Detection['box'],
  b: Detection['box'],
): number {
  const left = Math.max(a.xmin, b.xmin)
  const top = Math.max(a.ymin, b.ymin)
  const right = Math.min(a.xmax, b.xmax)
  const bottom = Math.min(a.ymax, b.ymax)
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top)
  const areaA = (a.xmax - a.xmin) * (a.ymax - a.ymin)
  const areaB = (b.xmax - b.xmin) * (b.ymax - b.ymin)
  return intersection / Math.max(1, areaA + areaB - intersection)
}

export const faceService = new FaceService()
