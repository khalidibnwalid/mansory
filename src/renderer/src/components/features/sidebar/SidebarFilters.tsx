import { FolderTree } from '@/components/features/FolderTree'
import { TagsExplorer } from '@/components/features/tags/TagsExplorer'
import { useLocalStorage } from '@/lib/hooks/useLocalStorage'
import { useSettingsStore } from '@/lib/store/settings'
import { cn } from '@/lib/utils'
import { Ribbon } from './Ribbon'
import { ResizableSidebar } from './ResizableSidebar'
import { FacesExplorer } from '../faces/FacesExplorer'

export function SidebarFilters() {
  const { isFolderTreeOpen, toggleFolderTree } = useSettingsStore()
  const [showFolders, setShowFolders] = useLocalStorage(
    'sidebar-show-folders',
    true,
  )
  const [showTags, setShowTags] = useLocalStorage('sidebar-show-tags', true)
  const [showFaces, setShowFaces] = useLocalStorage('sidebar-show-faces', false)

  const handleToggleFolders = () => {
    if (isFolderTreeOpen) {
      if (showFolders) {
        if (!showTags && !showFaces) {
          // Folders is the only one open, collapse the sidebar
          toggleFolderTree()
        } else {
          // Tags is also open, just hide folders
          setShowFolders(false)
        }
      } else {
        // Folders was hidden, show it
        setShowFolders(true)
      }
    } else {
      // Sidebar is closed, open it and make folders visible
      setShowFolders(true)
      toggleFolderTree()
    }
  }

  const handleToggleTags = () => {
    if (isFolderTreeOpen) {
      if (showTags) {
        if (!showFolders && !showFaces) {
          // Tags is the only one open, collapse the sidebar
          toggleFolderTree()
        } else {
          // Folders is also open, just hide tags
          setShowTags(false)
        }
      } else {
        // Tags was hidden, show it
        setShowTags(true)
      }
    } else {
      // Sidebar is closed, open it and make tags visible
      setShowTags(true)
      toggleFolderTree()
    }
  }

  const handleToggleFaces = () => {
    if (isFolderTreeOpen) {
      if (showFaces) {
        if (!showFolders && !showTags) toggleFolderTree()
        else setShowFaces(false)
      } else setShowFaces(true)
    } else {
      setShowFaces(true)
      toggleFolderTree()
    }
  }

  const handleToggleSidebar = () => {
    // If we are opening the sidebar, make sure at least folders is visible if both were false
    if (!isFolderTreeOpen && !showFolders && !showTags && !showFaces) {
      setShowFolders(true)
    }
    toggleFolderTree()
  }

  const isSidebarOpen =
    isFolderTreeOpen && (showFolders || showTags || showFaces)

  return (
    <div className="sticky top-0 h-full z-30 flex shrink-0 select-none">
      <Ribbon
        isSidebarOpen={isSidebarOpen}
        showFolders={showFolders}
        showTags={showTags}
        showFaces={showFaces}
        onToggleSidebar={handleToggleSidebar}
        onToggleFolders={handleToggleFolders}
        onToggleTags={handleToggleTags}
        onToggleFaces={handleToggleFaces}
      />

      <ResizableSidebar isOpen={isSidebarOpen} onToggle={handleToggleSidebar}>
        {showFolders && <FolderTree className="flex-1 min-h-0" />}
        {showTags && (
          <TagsExplorer
            className={cn(
              'flex-1 min-h-0',
              showFolders && 'border-t border-border/40',
            )}
          />
        )}
        {showFaces && (
          <FacesExplorer
            className={cn(
              'flex-1 min-h-0',
              (showFolders || showTags) && 'border-t border-border/40',
            )}
          />
        )}
      </ResizableSidebar>
    </div>
  )
}
