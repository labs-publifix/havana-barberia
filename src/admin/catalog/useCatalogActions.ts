import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAdminAuth } from '../auth/AdminAuth'

/**
 * Catalog mutations. Each one refreshes the admin and the public site's catalog,
 * barbers and slots, so prices, durations and who does what show up everywhere at once.
 */
export function useCatalogActions() {
  const { repo } = useAdminAuth()
  const qc = useQueryClient()
  const refresh = () =>
    Promise.all([['admin'], ['catalog'], ['staff'], ['slots']].map((queryKey) => qc.invalidateQueries({ queryKey })))
  const opts = { onSuccess: refresh }
  return {
    saveService: useMutation({ mutationFn: repo.saveService.bind(repo), ...opts }),
    deleteService: useMutation({ mutationFn: repo.deleteService.bind(repo), ...opts }),
    moveService: useMutation({
      mutationFn: (v: { id: string; dir: -1 | 1 }) => repo.moveService(v.id, v.dir),
      ...opts,
    }),
    saveCategory: useMutation({ mutationFn: repo.saveCategory.bind(repo), ...opts }),
    moveCategory: useMutation({
      mutationFn: (v: { id: string; dir: -1 | 1 }) => repo.moveCategory(v.id, v.dir),
      ...opts,
    }),
    deleteCategory: useMutation({ mutationFn: repo.deleteCategory.bind(repo), ...opts }),
  }
}
