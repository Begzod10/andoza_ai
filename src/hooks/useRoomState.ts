import { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { useRoomStateStore } from '../store/roomStateStore'
import { getRoomState, updateRoomState } from '../api/roomStateApi'
import { RoomStateType } from '../types'

interface UseRoomStateOptions {
  autoLoad?: boolean
}

/**
 * Hook for managing room state operations
 */
export function useRoomState(options: UseRoomStateOptions = {}) {
  const { autoLoad = true } = options

  const activeRoom = useAppStore((state) => state.activeRoom)
  const roomStateData = useAppStore((state) => state.roomState)
  const setRoomState = useAppStore((state) => state.setRoomState)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Load room state on mount if auto-load enabled and no data present
  useEffect(() => {
    if (autoLoad && !roomStateData && activeRoom) {
      loadRoomState()
    }
  }, [autoLoad, roomStateData, activeRoom])

  const loadRoomState = async () => {
    if (!activeRoom) return

    setLoading(true)
    setError(null)

    try {
      const state = await getRoomState(activeRoom.id)
      setRoomState(state)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load room state')
      setError(error)
      console.error('Failed to load room state:', error)
    } finally {
      setLoading(false)
    }
  }

  const saveRoomState = async (state: RoomStateType) => {
    if (!activeRoom) {
      setError(new Error('No active room'))
      return null
    }

    setLoading(true)
    setError(null)

    try {
      const updatedState = await updateRoomState(activeRoom.id, state)
      setRoomState(updatedState)
      return updatedState
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to save room state')
      setError(error)
      console.error('Failed to save room state:', error)
      return null
    } finally {
      setLoading(false)
    }
  }

  return {
    roomState: roomStateData,
    loading,
    error,
    loadRoomState,
    saveRoomState,
  }
}

/**
 * Hook for managing 3D camera state
 */
export function useCameraControls() {
  const cameraRotationX = useRoomStateStore((state) => state.cameraRotationX)
  const cameraRotationY = useRoomStateStore((state) => state.cameraRotationY)
  const cameraZoom = useRoomStateStore((state) => state.cameraZoom)
  const setCameraRotation = useRoomStateStore((state) => state.setCameraRotation)
  const setCameraZoom = useRoomStateStore((state) => state.setCameraZoom)
  const resetCamera = useRoomStateStore((state) => state.resetCamera)

  const rotateX = (delta: number) => {
    const newX = Math.max(-45, Math.min(45, cameraRotationX + delta))
    setCameraRotation(newX, cameraRotationY)
  }

  const rotateY = (delta: number) => {
    setCameraRotation(cameraRotationX, cameraRotationY + delta)
  }

  const rotate = (deltaX: number, deltaY: number) => {
    const newX = Math.max(-45, Math.min(45, cameraRotationX + deltaX))
    setCameraRotation(newX, cameraRotationY + deltaY)
  }

  const zoom = (factor: number) => {
    const newZoom = Math.max(0.5, Math.min(5, cameraZoom * factor))
    setCameraZoom(newZoom)
  }

  const zoomIn = () => zoom(1.1)
  const zoomOut = () => zoom(0.9)

  return {
    rotationX: cameraRotationX,
    rotationY: cameraRotationY,
    zoom: cameraZoom,
    rotate,
    rotateX,
    rotateY,
    zoom: setCameraZoom,
    zoomIn,
    zoomOut,
    reset: resetCamera,
  }
}

/**
 * Hook for managing material selection
 */
export function useMaterialSelection() {
  const selectedColor = useRoomStateStore((state) => state.selectedPaintColor)
  const setSelectedColor = useRoomStateStore((state) => state.setSelectedPaintColor)

  const selectColor = (colorId: string | null) => {
    setSelectedColor(colorId)
  }

  const clearSelection = () => {
    setSelectedColor(null)
  }

  return {
    selectedColor,
    selectColor,
    clearSelection,
    hasSelection: selectedColor !== null,
  }
}

/**
 * Hook for managing stage progression
 */
export function useStageProgression() {
  const completedStages = useRoomStateStore((state) => state.completedStages)
  const markStageComplete = useRoomStateStore((state) => state.markStageComplete)

  const isComplete = (stageId: number): boolean => {
    return completedStages.has(stageId)
  }

  const markComplete = (stageId: number) => {
    markStageComplete(stageId)
  }

  const getProgress = (): number => {
    return completedStages.size
  }

  const getProgressPercentage = (total: number = 8): number => {
    return Math.round((completedStages.size / total) * 100)
  }

  return {
    completedStages,
    isComplete,
    markComplete,
    progress: getProgress(),
    progressPercentage: getProgressPercentage(),
  }
}
