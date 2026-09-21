import type { StateCreator } from 'zustand'
import type { CatalogFurniture } from '@/lib/api'
import type { FurnitureCategory, FurniturePlacement } from '@/lib/furnitureCatalog'
import type { PlacedFurniture, UserFurnitureEntry } from '../types'
import type { RoomStore } from '../roomStoreTypes'

export interface FurnitureSlice {
  furniture: PlacedFurniture[]
  userFurniture: UserFurnitureEntry[]
  /** Do'kon-managed 3D models from the admin catalog (GET /furniture) — fetched
   *  by the studio page and stored here (not persisted) so every placement
   *  path can price/label a placed shop model the same way it already does
   *  for a user's own uploaded model, via placeFurniture's enrichment below. */
  catalogFurniture: CatalogFurniture[]

  placeFurniture(item: PlacedFurniture): void
  moveFurniture(id: string, x: number, y: number, rotation: number): void
  resizeFurniture(id: string, scaleOverride: number): void
  removeFurniture(id: string): void
  setFurnitureColors(id: string, overrides: Record<string, string>): void
  hideFurniturePart(id: string, partKey: string): void
  addUserFurniture(entry: UserFurnitureEntry): void
  removeUserFurniture(id: string): void
  setUserFurniturePath(id: string, path: string): void
  setUserFurnitureServer(id: string, serverId: string, remoteUrl: string): void
  setUserFurnitureCategory(id: string, category: FurnitureCategory): void
  setUserFurniturePlacement(id: string, placement: FurniturePlacement): void
  setUserFurniturePrice(id: string, priceUzs: number): void
  setCatalogFurniture(items: CatalogFurniture[]): void
}

export const createFurnitureSlice: StateCreator<
  RoomStore,
  [],
  [],
  FurnitureSlice
> = (set) => ({
  furniture: [],
  userFurniture: [],
  catalogFurniture: [],

  placeFurniture(item) {
    set((state) => {
      // A user-uploaded model has no shared catalog slug to price by later —
      // snapshot its name/price onto the placed instance now, at the one
      // point every placement path (drag-in, AI builder, add-object sheet)
      // funnels through, so callers don't each need to know about pricing.
      // A do'kon (shop) catalog model DOES have a shared id, but the backend
      // smeta engine has no DB access to that catalog either — it only reads
      // the room's own saved state — so the same per-instance snapshot is the
      // only way its real price/name reach the estimate.
      const userEntry = state.userFurniture.find((f) => f.id === item.furniture_id)
      const catalogEntry = state.catalogFurniture.find((f) => f.id === item.furniture_id)
      const priceSource = userEntry?.priceUzs ?? catalogEntry?.price_uzs ?? undefined
      const nameSource = userEntry?.name ?? catalogEntry?.name_uz
      const enriched = (userEntry || catalogEntry)
        ? {
            ...item,
            name: item.name ?? nameSource,
            unitPriceUzs: item.unitPriceUzs ?? priceSource,
          }
        : item
      return {
        isDirty: true,
        furniture: [...state.furniture, enriched],
      }
    })
  },

  moveFurniture(id, x, y, rotation) {
    set((state) => ({
      isDirty: true,
      furniture: state.furniture.map((f) =>
        f.id === id ? { ...f, x, y, rotation } : f,
      ),
    }))
  },

  resizeFurniture(id, scaleOverride) {
    set((state) => ({
      isDirty: true,
      furniture: state.furniture.map((f) =>
        f.id === id ? { ...f, scaleOverride } : f,
      ),
    }))
  },

  removeFurniture(id) {
    set((state) => ({
      isDirty: true,
      furniture: state.furniture.filter((f) => f.id !== id),
    }))
  },

  setFurnitureColors(id, overrides) {
    set((state) => ({
      isDirty: true,
      furniture: state.furniture.map((f) =>
        f.id === id ? { ...f, colorOverrides: overrides } : f,
      ),
    }))
  },

  hideFurniturePart(id, partKey) {
    set((state) => ({
      isDirty: true,
      furniture: state.furniture.map((f) =>
        f.id === id && !(f.hiddenParts ?? []).includes(partKey)
          ? { ...f, hiddenParts: [...(f.hiddenParts ?? []), partKey] }
          : f,
      ),
    }))
  },

  addUserFurniture(entry) {
    set((state) => ({ userFurniture: [...state.userFurniture, entry] }))
  },

  removeUserFurniture(id) {
    // Placed copies must go with the model. Left behind, they reference an
    // entry that no longer exists and the scene can only guess what to draw.
    set((state) => {
      const placed = state.furniture.filter((f) => f.furniture_id === id)
      if (placed.length === 0) {
        return { userFurniture: state.userFurniture.filter((f) => f.id !== id) }
      }
      return {
        userFurniture: state.userFurniture.filter((f) => f.id !== id),
        furniture: state.furniture.filter((f) => f.furniture_id !== id),
        isDirty: true,
      }
    })
  },

  setUserFurniturePath(id, path) {
    set((state) => ({
      userFurniture: state.userFurniture.map((f) => f.id === id ? { ...f, modelPath: path } : f),
    }))
  },

  setUserFurnitureServer(id, serverId, remoteUrl) {
    set((state) => ({
      userFurniture: state.userFurniture.map((f) => f.id === id ? { ...f, serverId, remoteUrl } : f),
    }))
  },

  setUserFurnitureCategory(id, category) {
    set((state) => ({
      userFurniture: state.userFurniture.map((f) => f.id === id ? { ...f, category } : f),
    }))
  },

  setUserFurniturePlacement(id, placement) {
    set((state) => ({
      userFurniture: state.userFurniture.map((f) => f.id === id ? { ...f, placement } : f),
    }))
  },

  setUserFurniturePrice(id, priceUzs) {
    set((state) => ({
      userFurniture: state.userFurniture.map((f) => f.id === id ? { ...f, priceUzs } : f),
    }))
  },

  setCatalogFurniture(items) {
    set({ catalogFurniture: items })
  },
})
