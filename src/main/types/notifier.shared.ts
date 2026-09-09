export interface NotifyImageThumbnailGeneratedPartPayload {
  data: {
    filePath: string
    thumbnailPath: string
  }
  order: number
  total: number
  sessionId: string
}

export interface NotifyImageThumbnailGenerationCompletePayload {
  totalProcessed: number
  totalFailed: number
  sessionId: string
}

export interface NotifyFaceScanPartPayload {
  order: number
  total: number
  facesFound: number
  fileName?: string
  sessionId: string
}

export interface NotifyFaceScanCompletePayload {
  totalProcessed: number
  totalFailed: number
  totalFaces: number
  sessionId: string
}
