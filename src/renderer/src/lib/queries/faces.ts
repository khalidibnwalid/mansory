import { useFolder } from '@/components/providers/FolderProvider'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import QUERIES from './constants'

export function useFaceGroups(includeHidden = false) {
  const { folderPath } = useFolder()
  return useQuery({
    queryKey: QUERIES.FACE_GROUPS(folderPath || undefined, includeHidden),
    queryFn: () => window.api.faces.getGroups(folderPath!, includeHidden),
    enabled: !!folderPath,
  })
}

export function useFaceStats() {
  const { folderPath } = useFolder()
  return useQuery({
    queryKey: ['faces', 'stats', folderPath],
    queryFn: () => window.api.faces.getStats(folderPath!),
    enabled: !!folderPath,
  })
}

export function useScanFaces() {
  const { folderPath } = useFolder()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (options?: { rescan?: boolean }) =>
      window.api.faces.scan(folderPath!, options),
    onSuccess: result => {
      client.invalidateQueries({ queryKey: ['faces'] })
      client.invalidateQueries({ queryKey: ['images'] })
      if (result.scanned === 0 && result.failed === 0) {
        toast.info('Face library is already up to date')
      }
    },
    onError: error =>
      toast.error(error instanceof Error ? error.message : 'Face scan failed'),
  })
}

export function useRenameFaceGroup() {
  const { folderPath } = useFolder()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, name }: { groupId: number; name: string | null }) =>
      window.api.faces.renameGroup(folderPath!, groupId, name),
    onSuccess: () => client.invalidateQueries({ queryKey: ['faces'] }),
  })
}

export function useMergeFaceGroups() {
  const { folderPath } = useFolder()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({
      targetGroupId,
      sourceGroupIds,
    }: {
      targetGroupId: number
      sourceGroupIds: number[]
    }) =>
      window.api.faces.mergeGroups(folderPath!, targetGroupId, sourceGroupIds),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['faces'] })
      client.invalidateQueries({ queryKey: ['images'] })
      toast.success('Face groups merged')
    },
  })
}

export function useSetFaceGroupHidden() {
  const { folderPath } = useFolder()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, hidden }: { groupId: number; hidden: boolean }) =>
      window.api.faces.setGroupHidden(folderPath!, groupId, hidden),
    onSuccess: group => {
      client.invalidateQueries({ queryKey: ['faces'] })
      client.invalidateQueries({ queryKey: ['images'] })
      toast.success(
        group?.hidden ? 'Face hidden from the sidebar' : 'Face shown',
      )
    },
    onError: error =>
      toast.error(
        error instanceof Error ? error.message : 'Could not update face',
      ),
  })
}

export function useClearFaceIndex() {
  const { folderPath } = useFolder()
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => window.api.faces.clearIndex(folderPath!),
    onSuccess: result => {
      client.invalidateQueries({ queryKey: ['faces'] })
      client.invalidateQueries({ queryKey: ['images'] })
      toast.success(
        result.faces
          ? `Cleared ${result.faces} faces from ${result.groups} groups`
          : 'Face index was already empty',
      )
    },
    onError: error =>
      toast.error(
        error instanceof Error ? error.message : 'Could not clear face index',
      ),
  })
}
