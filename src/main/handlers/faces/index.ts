import { faceService } from '@main/services/face.service'
import { getAndInitConfig } from '@main/utils/files/config'
import { FaceRepository } from '@main/utils/repositories/Face'
import { ipcMain } from 'electron'
import { deleteFileToTrash } from '@main/utils/files/delete'
import { CONFIG_DIR } from '@main/utils/files/config'
import { join } from 'path'
import { AppSettingsRepository } from '@main/utils/repositories/appSettings'
import {
  APP_SETTING_KEYS,
  FACE_DETECTION_MODEL_DEFAULT,
} from '@main/utils/appSettingsKeys'

async function repository(folderPath: string): Promise<FaceRepository> {
  const { db } = await getAndInitConfig(folderPath)
  return new FaceRepository(db, folderPath)
}

export function registerFacesHandlers(): void {
  ipcMain.handle(
    'faces:get-groups',
    async (_, folderPath: string, includeHidden = false) =>
      (await repository(folderPath)).getGroups(includeHidden),
  )
  ipcMain.handle(
    'faces:scan',
    async (_, folderPath: string, options?: { rescan?: boolean }) =>
      faceService.scan(folderPath, await repository(folderPath), options),
  )
  ipcMain.handle(
    'faces:rename-group',
    async (_, folderPath: string, groupId: number, name: string | null) => {
      const repo = await repository(folderPath)
      repo.renameGroup(groupId, name)
      return repo.getGroups().find(group => group.id === groupId)
    },
  )
  ipcMain.handle(
    'faces:merge-groups',
    async (
      _,
      folderPath: string,
      targetGroupId: number,
      sourceGroupIds: number[],
    ) => {
      const repo = await repository(folderPath)
      repo.mergeGroups(targetGroupId, sourceGroupIds)
      return repo.getGroups()
    },
  )
  ipcMain.handle(
    'faces:set-group-hidden',
    async (_, folderPath: string, groupId: number, hidden: boolean) => {
      const repo = await repository(folderPath)
      repo.setGroupHidden(groupId, hidden)
      return repo.getGroups(true).find(group => group.id === groupId)
    },
  )
  ipcMain.handle('faces:get-stats', async (_, folderPath: string) => {
    const repo = await repository(folderPath)
    const settings = new AppSettingsRepository(repo.db)
    const detectorModel =
      settings.getParsedValue<string>(APP_SETTING_KEYS.FACE_DETECTION_MODEL) ??
      FACE_DETECTION_MODEL_DEFAULT
    return repo.getStats(detectorModel)
  })
  ipcMain.handle('faces:clear-index', async (_, folderPath: string) => {
    const repo = await repository(folderPath)
    const result = repo.clearIndex()
    try {
      await deleteFileToTrash(join(folderPath, CONFIG_DIR, 'faces'))
    } catch (error) {
      console.warn('Face crops directory could not be moved to trash:', error)
    }
    return result
  })
}
