import { FaceGroupModel } from '@main/types/models.shared'
import { ipcRenderer } from 'electron'

const facesApi = {
  getGroups: (
    folderPath: string,
    includeHidden = false,
  ): Promise<FaceGroupModel[]> =>
    ipcRenderer.invoke('faces:get-groups', folderPath, includeHidden),
  scan: (
    folderPath: string,
    options?: { rescan?: boolean },
  ): Promise<{ scanned: number; faces: number; failed: number }> =>
    ipcRenderer.invoke('faces:scan', folderPath, options),
  renameGroup: (
    folderPath: string,
    groupId: number,
    name: string | null,
  ): Promise<FaceGroupModel | undefined> =>
    ipcRenderer.invoke('faces:rename-group', folderPath, groupId, name),
  mergeGroups: (
    folderPath: string,
    targetGroupId: number,
    sourceGroupIds: number[],
  ): Promise<FaceGroupModel[]> =>
    ipcRenderer.invoke(
      'faces:merge-groups',
      folderPath,
      targetGroupId,
      sourceGroupIds,
    ),
  setGroupHidden: (
    folderPath: string,
    groupId: number,
    hidden: boolean,
  ): Promise<FaceGroupModel | undefined> =>
    ipcRenderer.invoke('faces:set-group-hidden', folderPath, groupId, hidden),
  getStats: (
    folderPath: string,
  ): Promise<{
    faces: number
    groups: number
    scannedImages: number
    pendingImages: number
  }> => ipcRenderer.invoke('faces:get-stats', folderPath),
  clearIndex: (
    folderPath: string,
  ): Promise<{ faces: number; groups: number }> =>
    ipcRenderer.invoke('faces:clear-index', folderPath),
}

export default facesApi
