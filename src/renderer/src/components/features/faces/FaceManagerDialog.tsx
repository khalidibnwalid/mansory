import { useSearch } from '@/components/providers/SearchProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  useFaceGroups,
  useMergeFaceGroups,
  useRenameFaceGroup,
  useSetFaceGroupHidden,
} from '@/lib/queries/faces'
import { cn } from '@/lib/utils'
import {
  ArrowsMergeIcon,
  CheckIcon,
  EyeIcon,
  EyeSlashIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
} from '@phosphor-icons/react'
import { useMemo, useState } from 'react'

type VisibilityFilter = 'visible' | 'hidden' | 'all'

export function FaceManagerDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: groups = [], isLoading } = useFaceGroups(true)
  const rename = useRenameFaceGroup()
  const setHidden = useSetFaceGroupHidden()
  const merge = useMergeFaceGroups()
  const { setFaceGroupIds } = useSearch()
  const [query, setQuery] = useState('')
  const [visibility, setVisibility] = useState<VisibilityFilter>('visible')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [confirmMerge, setConfirmMerge] = useState(false)

  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return groups.filter(group => {
      if (visibility === 'visible' && group.hidden) return false
      if (visibility === 'hidden' && !group.hidden) return false
      return (
        !normalizedQuery ||
        (group.name || 'Unnamed face')
          .toLocaleLowerCase()
          .includes(normalizedQuery)
      )
    })
  }, [groups, query, visibility])

  const hiddenCount = groups.filter(group => group.hidden).length
  const target = groups.find(group => group.id === selectedIds[0])

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSelectedIds([])
      setEditingId(null)
      setConfirmMerge(false)
    }
    onOpenChange(nextOpen)
  }

  const toggleSelected = (groupId: number) => {
    setSelectedIds(current =>
      current.includes(groupId)
        ? current.filter(id => id !== groupId)
        : [...current, groupId],
    )
  }

  const saveName = () => {
    if (editingId === null) return
    rename.mutate({ groupId: editingId, name: editingName })
    setEditingId(null)
  }

  const changeVisibility = (groupId: number, hidden: boolean) => {
    setHidden.mutate({ groupId, hidden })
    if (hidden) {
      setFaceGroupIds(current => current.filter(id => id !== groupId))
      setSelectedIds(current => current.filter(id => id !== groupId))
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-3 sm:max-w-4xl">
          <DialogHeader className="pr-10">
            <DialogTitle>Manage people & characters</DialogTitle>
            <DialogDescription>
              Name, hide, restore, or merge identities. Hidden faces stay
              indexed but do not appear in the sidebar.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search names"
                className="pl-8"
              />
            </div>
            <div className="flex rounded-lg bg-muted p-1">
              {(['visible', 'hidden', 'all'] as const).map(option => (
                <Button
                  key={option}
                  size="sm"
                  variant={visibility === option ? 'secondary' : 'ghost'}
                  className="h-7 capitalize shadow-none"
                  onClick={() => setVisibility(option)}
                >
                  {option}
                  {option === 'hidden' && hiddenCount > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {hiddenCount}
                    </span>
                  )}
                </Button>
              ))}
            </div>
          </div>

          <div className="min-h-48 flex-1 overflow-y-auto rounded-lg border bg-muted/20 p-2">
            {isLoading ? (
              <p className="grid min-h-48 place-items-center text-sm text-muted-foreground">
                Loading faces…
              </p>
            ) : filteredGroups.length === 0 ? (
              <p className="grid min-h-48 place-items-center text-sm text-muted-foreground">
                {query ? 'No matching faces' : `No ${visibility} faces`}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {filteredGroups.map(group => {
                  const selected = selectedIds.includes(group.id)
                  const isEditing = editingId === group.id
                  return (
                    <article
                      key={group.id}
                      className={cn(
                        'group overflow-hidden rounded-xl border bg-card transition',
                        selected && 'border-primary ring-2 ring-primary/20',
                        group.hidden && 'opacity-70',
                      )}
                    >
                      <button
                        type="button"
                        className="relative block aspect-square w-full overflow-hidden bg-muted"
                        aria-label={`${selected ? 'Deselect' : 'Select'} ${group.name || 'unnamed face'} for merging`}
                        onClick={() => toggleSelected(group.id)}
                      >
                        {group.coverPath && (
                          <img
                            src={`file://${group.coverPath}`}
                            alt=""
                            className={cn(
                              'size-full object-cover transition',
                              group.hidden && 'grayscale',
                            )}
                          />
                        )}
                        {group.hidden && (
                          <Badge
                            variant="secondary"
                            className="absolute left-1.5 top-1.5"
                          >
                            <EyeSlashIcon /> Hidden
                          </Badge>
                        )}
                        {selected && (
                          <span className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-primary text-xs text-primary-foreground shadow-sm">
                            {selectedIds.indexOf(group.id) === 0 ? (
                              '1'
                            ) : (
                              <CheckIcon />
                            )}
                          </span>
                        )}
                      </button>

                      <div className="space-y-2 p-2">
                        {isEditing ? (
                          <Input
                            autoFocus
                            value={editingName}
                            className="h-7 text-xs"
                            placeholder="Name"
                            onChange={event =>
                              setEditingName(event.target.value)
                            }
                            onBlur={saveName}
                            onKeyDown={event => {
                              if (event.key === 'Enter') saveName()
                              if (event.key === 'Escape') setEditingId(null)
                            }}
                          />
                        ) : (
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">
                              {group.name || 'Unnamed face'}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {group.imageCount}{' '}
                              {group.imageCount === 1 ? 'photo' : 'photos'} ·{' '}
                              {group.faceCount} faces
                            </p>
                          </div>
                        )}

                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 min-w-0 flex-1 px-2 text-xs"
                            onClick={() => {
                              setEditingId(group.id)
                              setEditingName(group.name || '')
                            }}
                          >
                            <PencilSimpleIcon /> Name
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="outline"
                            className="size-7"
                            title={
                              group.hidden
                                ? 'Show in the sidebar'
                                : 'Hide from the sidebar'
                            }
                            disabled={setHidden.isPending}
                            onClick={() =>
                              changeVisibility(group.id, !group.hidden)
                            }
                          >
                            {group.hidden ? <EyeIcon /> : <EyeSlashIcon />}
                          </Button>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>

          <DialogFooter className="items-center sm:justify-between">
            <p className="mr-auto text-xs text-muted-foreground">
              {selectedIds.length
                ? `${selectedIds.length} selected · the first selection is kept`
                : `${groups.length - hiddenCount} visible · ${hiddenCount} hidden`}
            </p>
            <Button
              variant="outline"
              disabled={selectedIds.length === 0}
              onClick={() => setSelectedIds([])}
            >
              Clear selection
            </Button>
            <Button
              disabled={selectedIds.length < 2}
              onClick={() => setConfirmMerge(true)}
            >
              <ArrowsMergeIcon /> Merge selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmMerge} onOpenChange={setConfirmMerge}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge {selectedIds.length} face groups?</DialogTitle>
            <DialogDescription>
              All selected faces will join “
              {target?.name || 'the first selected group'}”. The other groups
              will be removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmMerge(false)}>
              Cancel
            </Button>
            <Button
              disabled={merge.isPending}
              onClick={() => {
                merge.mutate({
                  targetGroupId: selectedIds[0],
                  sourceGroupIds: selectedIds.slice(1),
                })
                setSelectedIds([])
                setConfirmMerge(false)
              }}
            >
              Merge groups
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
