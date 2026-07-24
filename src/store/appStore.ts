import { create } from 'zustand'
import { User, Project, Room, RoomState, Material, PlacedFurniture, ElectricalDevice } from '../types'

interface AppStore {
  // Auth
  user: User | null
  isAuthenticated: boolean
  setUser: (user: User | null) => void

  // Projects & Rooms
  projects: Project[]
  activeProject: Project | null
  setProjects: (projects: Project[]) => void
  setActiveProject: (project: Project | null) => void

  rooms: Room[]
  activeRoom: Room | null
  setRooms: (rooms: Room[]) => void
  setActiveRoom: (room: Room | null) => void

  // Room State
  roomState: RoomState | null
  setRoomState: (state: RoomState | null) => void

  // Decoration & Furniture
  wallFinishes: Map<string, Material> // wall_id -> material
  placedFurniture: PlacedFurniture[]
  setWallFinish: (wallId: string, material: Material) => void
  addFurniture: (furniture: PlacedFurniture) => void
  removeFurniture: (furnitureId: string) => void

  // Electrical
  electricalDevices: ElectricalDevice[]
  addDevice: (device: ElectricalDevice) => void
  removeDevice: (deviceId: string) => void
  updateDevice: (deviceId: string, updates: Partial<ElectricalDevice>) => void

  // UI State
  currentStage: number // 0-7 for decoration, 8 for electrical
  setCurrentStage: (stage: number) => void
  activeBottomTab: 'uy' | 'dokon' | 'ustalar' | 'profil'
  setActiveBottomTab: (tab: 'uy' | 'dokon' | 'ustalar' | 'profil') => void

  // Reset
  reset: () => void
}

export const useAppStore = create<AppStore>((set, get) => ({
  // Auth
  user: null,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: user !== null }),

  // Projects & Rooms
  projects: [],
  activeProject: null,
  setProjects: (projects) => set({ projects }),
  setActiveProject: (project) => set({ activeProject: project }),

  rooms: [],
  activeRoom: null,
  setRooms: (rooms) => set({ rooms }),
  setActiveRoom: (room) => set({ activeRoom: room }),

  // Room State
  roomState: null,
  setRoomState: (state) => set({ roomState: state }),

  // Decoration & Furniture
  wallFinishes: new Map(),
  placedFurniture: [],
  setWallFinish: (wallId, material) => {
    const finishes = new Map(get().wallFinishes)
    finishes.set(wallId, material)
    set({ wallFinishes: finishes })
  },
  addFurniture: (furniture) => {
    set({ placedFurniture: [...get().placedFurniture, furniture] })
  },
  removeFurniture: (furnitureId) => {
    set({
      placedFurniture: get().placedFurniture.filter((f) => f.id !== furnitureId),
    })
  },

  // Electrical
  electricalDevices: [],
  addDevice: (device) => {
    set({ electricalDevices: [...get().electricalDevices, device] })
  },
  removeDevice: (deviceId) => {
    set({
      electricalDevices: get().electricalDevices.filter((d) => d.id !== deviceId),
    })
  },
  updateDevice: (deviceId, updates) => {
    set({
      electricalDevices: get().electricalDevices.map((d) =>
        d.id === deviceId ? { ...d, ...updates } : d
      ),
    })
  },

  // UI State
  currentStage: 0,
  setCurrentStage: (stage) => set({ currentStage: stage }),
  activeBottomTab: 'uy',
  setActiveBottomTab: (tab) => set({ activeBottomTab: tab }),

  // Reset
  reset: () => {
    set({
      user: null,
      isAuthenticated: false,
      projects: [],
      activeProject: null,
      rooms: [],
      activeRoom: null,
      roomState: null,
      wallFinishes: new Map(),
      placedFurniture: [],
      electricalDevices: [],
      currentStage: 0,
      activeBottomTab: 'uy',
    })
  },
}))
