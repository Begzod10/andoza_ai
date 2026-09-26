import type { StateCreator } from 'zustand'
import { nanoid } from 'nanoid'
import type { RoomGeometry, WallElement } from '../types'
import { defaultGeometry, resizeWall } from '../utils/geometryHelpers'
import type { RoomStore } from '../roomStoreTypes'

export interface GeometrySlice {
  ceilingHeight: number
  geometry: RoomGeometry

  setCeilingHeight(h: number): void
  setWallLength(wallId: string, length: number): void
  addElement(wallId: string, element: Omit<WallElement, 'id'>): void
  removeElement(wallId: string, elementId: string): void
  updateElement(wallId: string, elementId: string, patch: Partial<Omit<WallElement, 'id'>>): void
  swapElements(wallId: string): void
  swapAdjacentElements(wallId: string, id1: string, id2: string): void
}

export const createGeometrySlice: StateCreator<
  RoomStore,
  [],
  [],
  GeometrySlice
> = (set) => ({
  ceilingHeight: 2700,
  geometry: defaultGeometry(),

  setCeilingHeight(h) {
    set({ ceilingHeight: h, isDirty: true })
  },

  setWallLength(wallId, length) {
    set((state) => ({
      isDirty: true,
      geometry: resizeWall(state.geometry, wallId, length),
    }))
  },

  addElement(wallId, element) {
    const newElement: WallElement = { ...element, id: nanoid() }
    set((state) => ({
      isDirty: true,
      geometry: {
        // Spread first — keeps `vertices` (see setWallLength above).
        ...state.geometry,
        walls: state.geometry.walls.map((w) =>
          w.id === wallId
            ? { ...w, elements: [...w.elements, newElement] }
            : w,
        ),
      },
    }))
  },

  removeElement(wallId, elementId) {
    set((state) => ({
      isDirty: true,
      geometry: {
        // Spread first — keeps `vertices` (see setWallLength above).
        ...state.geometry,
        walls: state.geometry.walls.map((w) =>
          w.id === wallId
            ? { ...w, elements: w.elements.filter((e) => e.id !== elementId) }
            : w,
        ),
      },
    }))
  },

  updateElement(wallId, elementId, patch) {
    set((state) => ({
      isDirty: true,
      geometry: {
        // Spread first — keeps `vertices` (see setWallLength above).
        ...state.geometry,
        walls: state.geometry.walls.map((w) =>
          w.id === wallId
            ? { ...w, elements: w.elements.map((e) => e.id === elementId ? { ...e, ...patch } : e) }
            : w,
        ),
      },
    }))
  },

  swapElements(wallId) {
    set((state) => ({
      isDirty: true,
      geometry: {
        // Spread first — keeps `vertices` (see setWallLength above).
        ...state.geometry,
        walls: state.geometry.walls.map((w) =>
          w.id === wallId
            ? { ...w, elements: [...w.elements].reverse().map(e => ({ ...e, position: 0 })) }
            : w,
        ),
      },
    }))
  },

  swapAdjacentElements(wallId, id1, id2) {
    set((state) => ({
      isDirty: true,
      geometry: {
        // Spread first — keeps `vertices` (see setWallLength above).
        ...state.geometry,
        walls: state.geometry.walls.map((w) => {
          if (w.id !== wallId) return w;
          const idx1 = w.elements.findIndex((e) => e.id === id1);
          const idx2 = w.elements.findIndex((e) => e.id === id2);
          if (idx1 === -1 || idx2 === -1) return w;
          const el1 = w.elements[idx1];
          const el2 = w.elements[idx2];
          const newElements = [...w.elements];
          if (el1.position > 0 && el2.position > 0) {
            // Both explicitly placed — swap their positions, leave everything else
            newElements[idx1] = { ...el1, position: el2.position };
            newElements[idx2] = { ...el2, position: el1.position };
          } else {
            // Auto-placed — swap the elements in the array so resolveElementPositions
            // lays them out in the new order; reset both positions to trigger re-layout
            newElements[idx1] = { ...el2, position: 0 };
            newElements[idx2] = { ...el1, position: 0 };
          }
          return { ...w, elements: newElements };
        }),
      },
    }));
  },
})
