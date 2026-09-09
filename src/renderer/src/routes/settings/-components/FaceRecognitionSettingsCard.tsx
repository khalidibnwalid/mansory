import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Spinner } from '@/components/ui/spinner'
import { AlertDialog } from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSearch } from '@/components/providers/SearchProvider'
import {
  useClearFaceIndex,
  useFaceStats,
  useScanFaces,
} from '@/lib/queries/faces'
import {
  useFaceSettings,
  useUpdateSettingMutation,
} from '@/lib/queries/settings'
import {
  APP_SETTING_KEYS,
  FACE_DETECTION_MODELS,
  FACE_DETECTION_MODEL_DEFAULT,
} from '@/lib/types/appSettingsKeys'
import {
  ArrowClockwiseIcon,
  ScanIcon,
  TrashIcon,
  UsersThreeIcon,
  CaretDownIcon,
  CheckIcon,
} from '@phosphor-icons/react'

export function FaceRecognitionSettingsCard({
  folderPath,
}: {
  folderPath: string
}) {
  const settings = useFaceSettings(folderPath)
  const { data: stats } = useFaceStats()
  const scan = useScanFaces()
  const clearIndex = useClearFaceIndex()
  const update = useUpdateSettingMutation(folderPath)
  const queryClient = useQueryClient()
  const { setFaceGroupIds } = useSearch()
  const [detectionThreshold, setDetectionThreshold] = useState(0.12)
  const [groupingThreshold, setGroupingThreshold] = useState(0.88)
  const [dialog, setDialog] = useState<'reindex' | 'clear' | null>(null)

  const enabled = settings.enabled.data ?? true
  const detectionModel =
    settings.detectionModel.data ?? FACE_DETECTION_MODEL_DEFAULT
  const isLoading = Object.values(settings).some(query => query.isLoading)

  useEffect(() => {
    setDetectionThreshold(settings.detectionThreshold.data ?? 0.12)
  }, [settings.detectionThreshold.data])

  useEffect(() => {
    setGroupingThreshold(settings.groupingThreshold.data ?? 0.88)
  }, [settings.groupingThreshold.data])

  const save = async (
    key: string,
    value: boolean | number | string,
    valueType: 'boolean' | 'number' | 'string',
  ) => {
    try {
      await update.mutateAsync({ key, value, valueType })
    } catch (error) {
      console.error(error)
      toast.error('Failed to save face recognition setting')
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-border/40 bg-card/20">
        <Spinner className="size-6 text-primary" />
      </div>
    )
  }

  const isWorking = scan.isPending || clearIndex.isPending

  return (
    <div className="space-y-6 rounded-2xl border border-border/40 bg-card/20 p-6 shadow-xs backdrop-blur-md">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <UsersThreeIcon className="size-5 text-primary" weight="fill" />
            Face Recognition
          </h2>
          <p className="text-sm text-muted-foreground">
            Detect and group faces across photos and artwork locally.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">
            Enable
          </span>
          <Switch
            checked={enabled}
            onCheckedChange={checked =>
              save(APP_SETTING_KEYS.FACE_ENABLED, checked, 'boolean')
            }
          />
        </div>
      </div>

      <div
        className={
          !enabled ? 'pointer-events-none space-y-6 opacity-40' : 'space-y-6'
        }
      >
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold">Face detection model</p>
            <p className="text-xs text-muted-foreground">
              Choose broad coverage or an anime-optimized local detector.
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-between sm:w-64"
              >
                <span className="truncate">
                  {FACE_DETECTION_MODELS.find(
                    model => model.id === detectionModel,
                  )?.name || detectionModel}
                </span>
                <CaretDownIcon className="size-4 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-72">
              {FACE_DETECTION_MODELS.map(model => (
                <DropdownMenuItem
                  key={model.id}
                  className="flex cursor-pointer items-start gap-2 py-2"
                  onSelect={async () => {
                    await save(
                      APP_SETTING_KEYS.FACE_DETECTION_MODEL,
                      model.id,
                      'string',
                    )
                    const recommendedThreshold =
                      model.id === 'deepghs-anime-v1.4-n' ? 0.3 : 0.12
                    setDetectionThreshold(recommendedThreshold)
                    await save(
                      APP_SETTING_KEYS.FACE_DETECTION_THRESHOLD,
                      recommendedThreshold,
                      'number',
                    )
                    queryClient.invalidateQueries({
                      queryKey: ['faces', 'stats'],
                    })
                    toast.info('Detection model changed', {
                      description:
                        'Previously scanned images are now pending for reindexing.',
                    })
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold">{model.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {model.description}
                    </p>
                  </div>
                  {model.id === detectionModel && (
                    <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <ThresholdControl
          label="Detection confidence"
          description="Raise this to reduce false faces; lower it to find smaller or stylized faces."
          value={detectionThreshold}
          min={0.05}
          max={0.5}
          step={0.01}
          onChange={setDetectionThreshold}
          onCommit={value =>
            save(APP_SETTING_KEYS.FACE_DETECTION_THRESHOLD, value, 'number')
          }
        />

        <ThresholdControl
          label="Identity grouping strictness"
          description="Higher values keep uncertain matches separate. Lower values create broader groups."
          value={groupingThreshold}
          min={0.65}
          max={0.98}
          step={0.01}
          onChange={setGroupingThreshold}
          onCommit={value =>
            save(APP_SETTING_KEYS.FACE_GROUPING_THRESHOLD, value, 'number')
          }
        />
      </div>

      <div className="rounded-xl border border-border/40 bg-background/30 p-4">
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Faces" value={stats?.faces ?? 0} />
          <Stat label="Groups" value={stats?.groups ?? 0} />
          <Stat label="Scanned" value={stats?.scannedImages ?? 0} />
          <Stat label="Pending" value={stats?.pendingImages ?? 0} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={!enabled || isWorking}
            onClick={() => scan.mutate({})}
          >
            {scan.isPending && !scan.variables?.rescan ? (
              <Spinner className="size-4" />
            ) : (
              <ScanIcon />
            )}
            Scan pending
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!enabled || isWorking}
            onClick={() => setDialog('reindex')}
          >
            <ArrowClockwiseIcon />
            Reindex all faces
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isWorking || !stats?.scannedImages}
            className="text-destructive hover:text-destructive"
            onClick={() => setDialog('clear')}
          >
            <TrashIcon />
            Clear index
          </Button>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Changes to confidence or grouping apply to future scans. Reindex to
          apply them to the whole library. The first scan may download local AI
          models.
        </p>
      </div>

      {!enabled && (
        <p className="rounded-xl border border-amber-500/10 bg-amber-500/5 p-4 text-xs text-amber-500">
          Face scanning is disabled. Existing groups and names remain available.
        </p>
      )}

      <AlertDialog
        open={dialog !== null}
        onOpenChange={open => !open && setDialog(null)}
        title={dialog === 'clear' ? 'Clear face index?' : 'Reindex all faces?'}
        description={
          dialog === 'clear'
            ? 'This removes all detected faces, groups, names, and generated face crops. Original images are untouched.'
            : 'Every image will be scanned again using the current face settings. Existing names are preserved when identities still match.'
        }
        actionLabel={dialog === 'clear' ? 'Clear face index' : 'Reindex faces'}
        onAction={() => {
          if (dialog === 'clear') {
            clearIndex.mutate(undefined, {
              onSuccess: () => {
                setFaceGroupIds([])
                queryClient.invalidateQueries({ queryKey: ['faces'] })
              },
            })
          } else {
            scan.mutate({ rescan: true })
          }
          setDialog(null)
        }}
      />
    </div>
  )
}

function ThresholdControl({
  label,
  description,
  value,
  min,
  max,
  step,
  onChange,
  onCommit,
}: {
  label: string
  description: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  onCommit: (value: number) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <span className="font-mono text-sm font-bold text-primary">
          {Math.round(value * 100)}%
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={values => onChange(values[0])}
        onValueCommit={values => onCommit(values[0])}
      />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2 text-center">
      <p className="text-lg font-bold tabular-nums">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  )
}
