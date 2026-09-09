import { useSearch } from '@/components/providers/SearchProvider'
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
import { FaceManagerDialog } from './FaceManagerDialog'
import {
  useFaceGroups,
  useMergeFaceGroups,
  useRenameFaceGroup,
  useScanFaces,
} from '@/lib/queries/faces'
import { cn } from '@/lib/utils'
import {
  ArrowsMergeIcon,
  CheckIcon,
  PencilSimpleIcon,
  ScanIcon,
  UsersThreeIcon,
  XIcon,
} from '@phosphor-icons/react'
import { useState } from 'react'

export function FacesExplorer({ className }: { className?: string }) {
  const { data: groups = [], isLoading } = useFaceGroups()
  const scan = useScanFaces()
  const rename = useRenameFaceGroup()
  const merge = useMergeFaceGroups()
  const { faceGroupIds, setFaceGroupIds, setIsSearching } = useSearch()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [mergeMode, setMergeMode] = useState(false)
  const [mergeIds, setMergeIds] = useState<number[]>([])
  const [confirmMerge, setConfirmMerge] = useState(false)
  const [managerOpen, setManagerOpen] = useState(false)

  const toggleGroup = (id: number) => {
    if (mergeMode) {
      setMergeIds(current =>
        current.includes(id)
          ? current.filter(value => value !== id)
          : [...current, id],
      )
      return
    }
    setFaceGroupIds(current =>
      current.includes(id)
        ? current.filter(value => value !== id)
        : [...current, id],
    )
    setIsSearching(true)
  }

  const stopMerging = () => {
    setMergeMode(false)
    setMergeIds([])
    setConfirmMerge(false)
  }

  const target = groups.find(group => group.id === mergeIds[0])

  return (
    <section className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium">People & Characters</h2>
          <p className="truncate text-[11px] text-muted-foreground">
            Faces across your library
          </p>
        </div>
        {!!faceGroupIds.length && !mergeMode && (
          <Button
            size="icon-sm"
            variant="ghost"
            title="Clear character filters"
            aria-label="Clear character filters"
            onClick={() => setFaceGroupIds([])}
          >
            <XIcon />
          </Button>
        )}
        {!!groups.length && (
          <Button
            size="icon-sm"
            variant={mergeMode ? 'secondary' : 'ghost'}
            title={mergeMode ? 'Cancel merging' : 'Merge face groups'}
            onClick={() => (mergeMode ? stopMerging() : setMergeMode(true))}
          >
            {mergeMode ? <XIcon /> : <ArrowsMergeIcon />}
          </Button>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          title="Manage people and characters"
          onClick={() => setManagerOpen(true)}
        >
          <UsersThreeIcon />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          title="Scan new images for faces"
          disabled={scan.isPending}
          onClick={() => scan.mutate({})}
        >
          <ScanIcon className={cn(scan.isPending && 'animate-pulse')} />
        </Button>
      </div>

      {mergeMode && (
        <div className="flex items-center gap-2 border-b border-border/40 bg-accent/20 px-3 py-2">
          <p className="flex-1 text-xs text-muted-foreground">
            Select 2+ groups. The first is kept.
          </p>
          <Button
            size="sm"
            disabled={mergeIds.length < 2}
            onClick={() => setConfirmMerge(true)}
          >
            Merge {mergeIds.length || ''}
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <p className="p-3 text-center text-xs text-muted-foreground">
            Loading faces…
          </p>
        ) : !groups.length ? (
          <div className="flex h-full min-h-36 flex-col items-center justify-center gap-3 px-4 text-center">
            <div className="rounded-full bg-accent p-3">
              <ScanIcon className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium">Find familiar faces</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Detection and grouping run locally. The first scan downloads the
                face model.
              </p>
            </div>
            <Button
              size="sm"
              disabled={scan.isPending}
              onClick={() => scan.mutate({})}
            >
              {scan.isPending ? 'Scanning…' : 'Scan library'}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {groups.map(group => {
              const selected = mergeMode
                ? mergeIds.includes(group.id)
                : faceGroupIds.includes(group.id)
              return (
                <div key={group.id} className="group relative min-w-0">
                  <button
                    className={cn(
                      'w-full overflow-hidden rounded-xl border bg-card text-left transition hover:border-primary/50',
                      selected && 'border-primary ring-2 ring-primary/20',
                    )}
                    onClick={() => toggleGroup(group.id)}
                  >
                    <div className="relative aspect-square overflow-hidden bg-muted">
                      {group.coverPath && (
                        <img
                          src={`file://${group.coverPath}`}
                          alt=""
                          className="size-full object-cover"
                        />
                      )}
                      {mergeMode && selected && (
                        <span className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                          {mergeIds.indexOf(group.id) === 0 ? (
                            '1'
                          ) : (
                            <CheckIcon />
                          )}
                        </span>
                      )}
                    </div>
                    <div className="px-2 py-1.5">
                      <p className="truncate text-xs font-medium">
                        {group.name || 'Unnamed face'}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {group.imageCount}{' '}
                        {group.imageCount === 1 ? 'photo' : 'photos'}
                      </p>
                    </div>
                  </button>
                  {!mergeMode && (
                    <Button
                      size="icon-sm"
                      variant="secondary"
                      className="absolute right-1 top-1 size-6 opacity-0 shadow-sm group-hover:opacity-100"
                      title="Name this face"
                      onClick={event => {
                        event.stopPropagation()
                        setEditingId(group.id)
                        setEditingName(group.name || '')
                      }}
                    >
                      <PencilSimpleIcon className="size-3" />
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Dialog
        open={editingId !== null}
        onOpenChange={open => !open && setEditingId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Name this face</DialogTitle>
            <DialogDescription>
              Names stay in this gallery’s local database.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={editingName}
            placeholder="Name"
            onChange={event => setEditingName(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && editingId !== null) {
                rename.mutate({ groupId: editingId, name: editingName })
                setEditingId(null)
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingId(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                rename.mutate({ groupId: editingId!, name: editingName })
                setEditingId(null)
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmMerge} onOpenChange={setConfirmMerge}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge {mergeIds.length} face groups?</DialogTitle>
            <DialogDescription>
              All selected faces will join “
              {target?.name || 'the first selected group'}”. This is useful when
              the same person or character was split into separate groups.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmMerge(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                merge.mutate({
                  targetGroupId: mergeIds[0],
                  sourceGroupIds: mergeIds.slice(1),
                })
                stopMerging()
              }}
            >
              Merge groups
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FaceManagerDialog open={managerOpen} onOpenChange={setManagerOpen} />
    </section>
  )
}
