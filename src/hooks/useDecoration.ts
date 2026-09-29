import { useState, useCallback, useEffect } from 'react'
import { useDecorationStore } from '../store/decorationStore'
import { useAppStore } from '../store/appStore'
import apiClient from '../config/api'
import { Material } from '../types'

interface UseDecorationReturn {
  loading: boolean
  error: string | null
  loadPaintMaterials: () => Promise<void>
  loadWallpaperMaterials: () => Promise<void>
  loadFloorMaterials: () => Promise<void>
  submitWallFinish: (wallId: string) => Promise<void>
  completeDecoration: () => Promise<void>
}

/**
 * Hook for managing decoration workflow
 */
export const useDecoration = (): UseDecorationReturn => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    setAvailablePaints,
    setAvailableWallpapers,
    setAvailableFloorMaterials,
    appliedWallMaterials,
    appliedFloorMaterial,
  } = useDecorationStore()

  const { activeRoom } = useAppStore()

  const loadPaintMaterials = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.get('/materials?type=paint')
      setAvailablePaints(response.data.data || [])
    } catch (err) {
      setError('Bo\'yoqlarni yuklashda xato')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [setAvailablePaints])

  const loadWallpaperMaterials = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.get('/materials?type=wallpaper')
      setAvailableWallpapers(response.data.data || [])
    } catch (err) {
      setError('Oboilerini yuklashda xato')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [setAvailableWallpapers])

  const loadFloorMaterials = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.get('/materials?type=floor')
      setAvailableFloorMaterials(response.data.data || [])
    } catch (err) {
      setError('Pol materiallarini yuklashda xato')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [setAvailableFloorMaterials])

  const submitWallFinish = useCallback(
    async (wallId: string) => {
      if (!activeRoom) {
        setError('Xona tanlanmagan')
        return
      }

      const applied = appliedWallMaterials.get(wallId)
      if (!applied) {
        setError('Material tanlanmagan')
        return
      }

      try {
        setLoading(true)
        setError(null)

        await apiClient.post(`/rooms/${activeRoom.id}/finishes`, {
          wall_id: wallId,
          material_id: applied.material.id,
          material_type: applied.material.type,
        })
      } catch (err) {
        setError('Material saqlashda xato')
        console.error(err)
      } finally {
        setLoading(false)
      }
    },
    [activeRoom, appliedWallMaterials]
  )

  const completeDecoration = useCallback(async () => {
    if (!activeRoom) {
      setError('Xona tanlanmagan')
      return
    }

    try {
      setLoading(true)
      setError(null)

      // Submit all wall materials
      const wallPromises = Array.from(appliedWallMaterials.entries()).map(([wallId, applied]) => {
        return apiClient.post(`/rooms/${activeRoom.id}/finishes`, {
          wall_id: wallId,
          material_id: applied.material.id,
          material_type: applied.material.type,
        })
      })

      // Submit floor material if exists
      if (appliedFloorMaterial) {
        wallPromises.push(
          apiClient.post(`/rooms/${activeRoom.id}/finishes`, {
            wall_id: 'floor',
            material_id: appliedFloorMaterial.material.id,
            material_type: appliedFloorMaterial.material.type,
          })
        )
      }

      await Promise.all(wallPromises)

      // Mark stage as complete
      await apiClient.post(`/rooms/${activeRoom.id}/stage-complete`, {
        stage: 2, // Decoration stage
      })
    } catch (err) {
      setError('Dekorasyon bosqichini yakunlashda xato')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [activeRoom, appliedWallMaterials, appliedFloorMaterial])

  return {
    loading,
    error,
    loadPaintMaterials,
    loadWallpaperMaterials,
    loadFloorMaterials,
    submitWallFinish,
    completeDecoration,
  }
}

/**
 * Hook for material search and filtering
 */
export const useMaterialSearch = (materials: Material[]) => {
  const [filtered, setFiltered] = useState(materials)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!query) {
      setFiltered(materials)
      return
    }

    const lowercaseQuery = query.toLowerCase()
    const filtered = materials.filter((material) => {
      return (
        material.name.toLowerCase().includes(lowercaseQuery) ||
        material.color?.toLowerCase().includes(lowercaseQuery) ||
        material.pattern?.toLowerCase().includes(lowercaseQuery)
      )
    })

    setFiltered(filtered)
  }, [query, materials])

  return { filtered, query, setQuery }
}
