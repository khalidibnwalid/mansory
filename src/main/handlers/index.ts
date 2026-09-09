import { registerImagesHandlers } from './images'
import { registerSystemHandlers } from './system'
import { registerTagsHandlers } from './tags'
import { registerFoldersHandlers } from './folders'
import { registerSettingsHandlers } from './settings'
import { registerFacesHandlers } from './faces'

export function registerAllHandlers() {
  registerSystemHandlers()
  registerImagesHandlers()
  registerTagsHandlers()
  registerFoldersHandlers()
  registerSettingsHandlers()
  registerFacesHandlers()
}
