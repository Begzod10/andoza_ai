import { create } from 'zustand'
import { User, Project, Room, RoomState, Material, PlacedFurniture, ElectricalDevice, Wall, Opening } from '../types'

interface MeasurementState {
  roomId: string | null
  ceilingHeight: number
  doorCount: number
  windowCount: number
  walls: Wall[]
}

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

  // Measurement State
  measurement: MeasurementState
  setMeasurementRoomId: (roomId: string) => void
  setMeasurementCeilingHeight: (height: number) => void
  setMeasurementDoorCount: (count: number) => void
  setMeasurementWindowCount: (count: number) => void
  setMeasurementWalls: (walls: Wall[]) => void
  updateWall: (wallIndex: number, wall: Wall) => void
  addWallOpening: (wallIndex: number, opening: Opening) => void
  removeWallOpening: (wallIndex: number, openingId: string) => void
  resetMeasurement: () => void

  // Decoration & Furniture
  wallFinishes: Map<string, Material> // wall_id -> material
  placedFurniture: PlacedFurniture[]
  setWallFinish: (wallId: string, material: Material) => void
  addFurniture: (furniture: PlacedFurniture) => void
  removeFurniture: (furnitureId: string) => void

  // Electrical
  electricalDevices: ElectricalDevice[]
  setElectricalDevices: (devices: ElectricalDevice[]) => void
  addDevice: (device: ElectricalDevice) => void
  removeDevice: (deviceId: string) => void
  updateDevice: (deviceId: string, updates: Partial<ElectricalDevice>) => void

  // UI State
  currentStage: number // 0-7 for decoration, 8 for electrical
  setCurrentStage: (stage: number) => void
  activeBottomTab: 'uy' | 'dokon' | 'ustalar' | 'profil'
  setActiveBottomTab: (tab: 'uy' | 'dokon' | 'ustalar' | 'profil') => void

  // Settings
  language: 'uz' | 'ru' | 'en'
  setLanguage: (language: 'uz' | 'ru' | 'en') => void
  theme: 'light' | 'dark'
  setTheme: (theme: 'light' | 'dark') => void
  notificationsEnabled: boolean
  setNotificationsEnabled: (enabled: boolean) => void

  // Reset
  reset: () => void
}

const defaultMeasurementState: MeasurementState = {
  roomId: null,
  ceilingHeight: 0,
  doorCount: 0,
  windowCount: 0,
  walls: [
    { id: 'A', direction: 'A', length: 0, openings: [] },
    { id: 'B', direction: 'B', length: 0, openings: [] },
    { id: 'C', direction: 'C', length: 0, openings: [] },
    { id: 'D', direction: 'D', length: 0, openings: [] },
  ],
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

  // Measurement State
  measurement: defaultMeasurementState,
  setMeasurementRoomId: (roomId) => {
    set({
      measurement: { ...get().measurement, roomId },
    })
  },
  setMeasurementCeilingHeight: (ceilingHeight) => {
    set({
      measurement: { ...get().measurement, ceilingHeight },
    })
  },
  setMeasurementDoorCount: (doorCount) => {
    set({
      measurement: { ...get().measurement, doorCount },
    })
  },
  setMeasurementWindowCount: (windowCount) => {
    set({
      measurement: { ...get().measurement, windowCount },
    })
  },
  setMeasurementWalls: (walls) => {
    set({
      measurement: { ...get().measurement, walls },
    })
  },
  updateWall: (wallIndex, wall) => {
    const walls = [...get().measurement.walls]
    walls[wallIndex] = wall
    set({
      measurement: { ...get().measurement, walls },
    })
  },
  addWallOpening: (wallIndex, opening) => {
    const walls = [...get().measurement.walls]
    walls[wallIndex] = {
      ...walls[wallIndex],
      openings: [...walls[wallIndex].openings, opening],
    }
    set({
      measurement: { ...get().measurement, walls },
    })
  },
  removeWallOpening: (wallIndex, openingId) => {
    const walls = [...get().measurement.walls]
    walls[wallIndex] = {
      ...walls[wallIndex],
      openings: walls[wallIndex].openings.filter((o) => o.id !== openingId),
    }
    set({
      measurement: { ...get().measurement, walls },
    })
  },
  resetMeasurement: () => {
    set({
      measurement: defaultMeasurementState,
    })
  },

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
  setElectricalDevices: (devices) => {
    set({ electricalDevices: devices })
  },
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

  // Settings
  language: 'uz',
  setLanguage: (language) => set({ language }),
  theme: 'light',
  setTheme: (theme) => set({ theme }),
  notificationsEnabled: true,
  setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),

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
      measurement: defaultMeasurementState,
      wallFinishes: new Map(),
      placedFurniture: [],
      electricalDevices: [],
      currentStage: 0,
      activeBottomTab: 'uy',
      language: 'uz',
      theme: 'light',
      notificationsEnabled: true,
    })
  },
}))
