import { create } from 'zustand'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Resources {
  ore: number
  provisions: number
  gold: number
  lumber: number
  mana: number
  oreCap: number
  provisionsCap: number
  goldCap: number
  lumberCap: number
  manaCap: number
}

interface GameState {
  // Data
  deviceId: string | null
  player: any | null
  resources: Resources | null
  settlements: any[]
  researchStates: any[]
  activeResearch: any | null
  armies: any[]
  events: any[]
  mapTiles: any[]
  tutorialStep: number
  loading: boolean
  initialized: boolean

  // Actions
  init: () => Promise<void>
  login: (deviceId: string, name?: string, region?: string) => Promise<void>
  fetchState: () => Promise<void>
  build: (settlementId: string, buildingType: string, action?: string) => Promise<void>
  buildDefense: (settlementId: string, defenseType: string, action?: string) => Promise<void>
  startResearch: (track: string) => Promise<void>
  trainUnits: (settlementId: string, unitType: string, quantity: number) => Promise<void>
  createArmy: (name: string, settlementId: string, unitSelections: Record<string, number>) => Promise<void>
  marchArmy: (armyId: string, toTileId: string) => Promise<void>
  scoutTile: (toTileId: string, settlementId: string) => Promise<void>
  fetchMap: () => Promise<void>
  executeTrade: (data: {
    type: string
    resourceSend: string
    amountSend: number
    resourceReceive: string
  }) => Promise<void>
  debugFastForward: (minutes: number) => Promise<void>
  debugAddResources: (resources: Partial<Record<'ore' | 'provisions' | 'gold' | 'lumber' | 'mana', number>>) => Promise<void>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let pollInterval: ReturnType<typeof setInterval> | null = null

function headers(deviceId: string | null): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...(deviceId ? { 'x-device-id': deviceId } : {}),
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useGameStore = create<GameState>((set, get) => ({
  // ----- Initial state -----
  deviceId: null,
  player: null,
  resources: null,
  settlements: [],
  researchStates: [],
  activeResearch: null,
  armies: [],
  events: [],
  mapTiles: [],
  tutorialStep: 0,
  loading: false,
  initialized: false,

  // ----- Actions -----

  init: async () => {
    if (get().initialized) return

    set({ loading: true })

    let deviceId = localStorage.getItem('sovereign_device_id')
    if (!deviceId) {
      deviceId = crypto.randomUUID()
      localStorage.setItem('sovereign_device_id', deviceId)
    }

    set({ deviceId })

    try {
      await get().login(deviceId)
      await get().fetchState()
      set({ initialized: true })

      // Start polling every 15 seconds
      if (pollInterval) clearInterval(pollInterval)
      pollInterval = setInterval(() => {
        if (get().initialized && get().deviceId) {
          get().fetchState()
        }
      }, 15_000)
    } catch (err) {
      console.error('[GameStore] init failed:', err)
    } finally {
      set({ loading: false })
    }
  },

  login: async (deviceId: string, name?: string, region?: string) => {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: headers(deviceId),
      body: JSON.stringify({
        deviceId,
        name: name ?? undefined,
        startingRegion: region ?? undefined,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error ?? 'Login failed')
    }

    const data = await res.json()
    set({ player: data.player })
  },

  fetchState: async () => {
    const { deviceId } = get()
    if (!deviceId) return

    try {
      const res = await fetch('/api/game/state', {
        headers: headers(deviceId),
      })

      if (!res.ok) return

      const data = await res.json()

      set({
        player: data.player,
        resources: data.resources,
        settlements: data.settlements ?? [],
        researchStates: data.researchStates ?? [],
        activeResearch: data.activeResearch ?? null,
        armies: data.armies ?? [],
        events: data.recentEvents ?? [],
        tutorialStep: data.tutorialStep ?? 0,
      })
    } catch (err) {
      console.error('[GameStore] fetchState failed:', err)
    }
  },

  build: async (settlementId: string, buildingType: string, action?: string) => {
    const { deviceId } = get()
    if (!deviceId) return

    await fetch('/api/game/build', {
      method: 'POST',
      headers: headers(deviceId),
      body: JSON.stringify({ settlementId, buildingType, action: action ?? 'build' }),
    })

    await get().fetchState()
  },

  buildDefense: async (settlementId: string, defenseType: string, action?: string) => {
    const { deviceId } = get()
    if (!deviceId) return

    await fetch('/api/game/defense', {
      method: 'POST',
      headers: headers(deviceId),
      body: JSON.stringify({ settlementId, defenseType, action: action ?? 'build' }),
    })

    await get().fetchState()
  },

  startResearch: async (track: string) => {
    const { deviceId } = get()
    if (!deviceId) return

    await fetch('/api/game/research', {
      method: 'POST',
      headers: headers(deviceId),
      body: JSON.stringify({ track }),
    })

    await get().fetchState()
  },

  trainUnits: async (settlementId: string, unitType: string, quantity: number) => {
    const { deviceId } = get()
    if (!deviceId) return

    await fetch('/api/game/train', {
      method: 'POST',
      headers: headers(deviceId),
      body: JSON.stringify({ settlementId, unitType, quantity }),
    })

    await get().fetchState()
  },

  createArmy: async (name: string, settlementId: string, unitSelections: Record<string, number>) => {
    const { deviceId } = get()
    if (!deviceId) return

    await fetch('/api/game/army', {
      method: 'POST',
      headers: headers(deviceId),
      body: JSON.stringify({
        action: 'create',
        name,
        settlementId,
        unitSelections: Object.entries(unitSelections)
          .filter(([, qty]) => qty > 0)
          .map(([unitType, quantity]) => ({ unitType, quantity })),
      }),
    })

    await get().fetchState()
  },

  marchArmy: async (armyId: string, toTileId: string) => {
    const { deviceId } = get()
    if (!deviceId) return

    await fetch('/api/game/army', {
      method: 'POST',
      headers: headers(deviceId),
      body: JSON.stringify({ action: 'march', armyId, toTileId }),
    })

    await get().fetchState()
  },

  scoutTile: async (toTileId: string, settlementId: string) => {
    const { deviceId } = get()
    if (!deviceId) return

    await fetch('/api/game/army', {
      method: 'POST',
      headers: headers(deviceId),
      body: JSON.stringify({ action: 'scout', toTileId, settlementId }),
    })

    await get().fetchState()
    await get().fetchMap()
  },

  fetchMap: async () => {
    const { deviceId } = get()
    if (!deviceId) return

    try {
      const res = await fetch('/api/game/map', {
        headers: headers(deviceId),
      })

      if (!res.ok) return

      const data = await res.json()
      set({ mapTiles: data.tiles ?? [] })
    } catch (err) {
      console.error('[GameStore] fetchMap failed:', err)
    }
  },

  executeTrade: async (data) => {
    const { deviceId } = get()
    if (!deviceId) return

    await fetch('/api/game/trade', {
      method: 'POST',
      headers: headers(deviceId),
      body: JSON.stringify(data),
    })

    await get().fetchState()
  },

  debugFastForward: async (minutes: number) => {
    const { deviceId } = get()
    if (!deviceId) return

    await fetch('/api/game/debug', {
      method: 'POST',
      headers: headers(deviceId),
      body: JSON.stringify({ action: 'fastForward', minutes }),
    })

    await get().fetchState()
  },

  debugAddResources: async (resources) => {
    const { deviceId } = get()
    if (!deviceId) return

    await fetch('/api/game/debug', {
      method: 'POST',
      headers: headers(deviceId),
      body: JSON.stringify({ action: 'addResources', resources }),
    })

    await get().fetchState()
  },
}))
