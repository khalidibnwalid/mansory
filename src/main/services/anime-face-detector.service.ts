import { access, mkdir, rename, writeFile } from 'fs/promises'
import { join } from 'path'
import * as ort from 'onnxruntime-node'
import sharp from 'sharp'

export interface AnimeFaceDetection {
  score: number
  box: { xmin: number; ymin: number; xmax: number; ymax: number }
}

const MODEL_URL =
  'https://huggingface.co/deepghs/anime_face_detection/resolve/main/face_detect_v1.4_n/model.onnx'
const INPUT_SIZE = 640

class AnimeFaceDetectorService {
  private session: ort.InferenceSession | null = null
  private sessionPromise: Promise<ort.InferenceSession> | null = null

  private async getSession(cacheDir: string): Promise<ort.InferenceSession> {
    if (this.session) return this.session
    if (this.sessionPromise) return this.sessionPromise
    this.sessionPromise = (async () => {
      const modelDir = join(cacheDir, 'models', 'deepghs-anime-face-v1.4-n')
      const modelPath = join(modelDir, 'model.onnx')
      await mkdir(modelDir, { recursive: true })
      try {
        await access(modelPath)
      } catch {
        const response = await fetch(MODEL_URL)
        if (!response.ok) {
          throw new Error(
            `Could not download anime face model (${response.status} ${response.statusText})`,
          )
        }
        const temporaryPath = `${modelPath}.download`
        await writeFile(
          temporaryPath,
          Buffer.from(await response.arrayBuffer()),
        )
        await rename(temporaryPath, modelPath)
      }
      this.session = await ort.InferenceSession.create(modelPath, {
        graphOptimizationLevel: 'all',
      })
      return this.session
    })().catch(error => {
      this.sessionPromise = null
      throw error
    })
    return this.sessionPromise
  }

  async init(cacheDir: string): Promise<void> {
    await this.getSession(cacheDir)
  }

  async detect(
    imagePath: string,
    cacheDir: string,
    threshold: number,
  ): Promise<AnimeFaceDetection[]> {
    const session = await this.getSession(cacheDir)
    const source = sharp(imagePath, { failOn: 'none' })
    const metadata = await source.metadata()
    const sourceWidth = metadata.width
    const sourceHeight = metadata.height
    if (!sourceWidth || !sourceHeight) return []

    const { data, info } = await source
      .resize(INPUT_SIZE, INPUT_SIZE, {
        fit: 'contain',
        background: { r: 114, g: 114, b: 114 },
      })
      .removeAlpha()
      .toColourspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true })

    const plane = INPUT_SIZE * INPUT_SIZE
    const input = new Float32Array(plane * 3)
    for (let pixel = 0; pixel < plane; pixel++) {
      input[pixel] = data[pixel * info.channels] / 255
      input[plane + pixel] = data[pixel * info.channels + 1] / 255
      input[plane * 2 + pixel] = data[pixel * info.channels + 2] / 255
    }

    const result = await session.run({
      images: new ort.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE]),
    })
    const output = result.output0
    const values = output.data as Float32Array
    const anchors = output.dims[2]
    const scale = Math.min(INPUT_SIZE / sourceWidth, INPUT_SIZE / sourceHeight)
    const resizedWidth = Math.round(sourceWidth * scale)
    const resizedHeight = Math.round(sourceHeight * scale)
    const padX = (INPUT_SIZE - resizedWidth) / 2
    const padY = (INPUT_SIZE - resizedHeight) / 2
    const detections: AnimeFaceDetection[] = []

    for (let index = 0; index < anchors; index++) {
      const score = values[anchors * 4 + index]
      if (score < threshold) continue
      const cx = values[index]
      const cy = values[anchors + index]
      const width = values[anchors * 2 + index]
      const height = values[anchors * 3 + index]
      detections.push({
        score,
        box: {
          xmin: clamp((cx - width / 2 - padX) / scale, 0, sourceWidth),
          ymin: clamp((cy - height / 2 - padY) / scale, 0, sourceHeight),
          xmax: clamp((cx + width / 2 - padX) / scale, 0, sourceWidth),
          ymax: clamp((cy + height / 2 - padY) / scale, 0, sourceHeight),
        },
      })
    }
    return nonMaximumSuppression(detections, 0.5)
  }
}

function nonMaximumSuppression(
  detections: AnimeFaceDetection[],
  iouThreshold: number,
): AnimeFaceDetection[] {
  const sorted = [...detections].sort((a, b) => b.score - a.score)
  const kept: AnimeFaceDetection[] = []
  for (const detection of sorted) {
    if (!kept.some(other => iou(detection.box, other.box) > iouThreshold)) {
      kept.push(detection)
    }
  }
  return kept
}

function iou(
  a: AnimeFaceDetection['box'],
  b: AnimeFaceDetection['box'],
): number {
  const left = Math.max(a.xmin, b.xmin)
  const top = Math.max(a.ymin, b.ymin)
  const right = Math.min(a.xmax, b.xmax)
  const bottom = Math.min(a.ymax, b.ymax)
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top)
  const areaA = Math.max(0, a.xmax - a.xmin) * Math.max(0, a.ymax - a.ymin)
  const areaB = Math.max(0, b.xmax - b.xmin) * Math.max(0, b.ymax - b.ymin)
  return intersection / Math.max(1, areaA + areaB - intersection)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export const animeFaceDetectorService = new AnimeFaceDetectorService()
