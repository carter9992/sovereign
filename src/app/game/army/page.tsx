'use client'

import { useEffect, useState } from 'react'
import { useGameStore } from '@/store/game'
import {
  UNIT_TRAINING_COSTS,
  UNIT_STATS,
  BARRACKS_LEVEL_TRAINING_MULTIPLIERS,
  type UnitType,
} from '@/lib/game/constants'

// ---------------------------------------------------------------------------
// Unit metadata
// ---------------------------------------------------------------------------

const UNIT_DISPLAY: Record<string, { name: string; icon: string; description: string }> = {
  INFANTRY: { name: 'Infantry', icon: '🗡️', description: 'Basic melee fighter (ATK 9, DEF 7). Strong vs Cavalry. Slow speed makes them arrow magnets — ideal screens for faster units.' },
  ARCHER: { name: 'Archer', icon: '🏹', description: 'Ranged attacker (ATK 5, DEF 5). Strong vs Infantry. Fires before melee and bypasses walls. Targets slowest enemies first.' },
  HEAVY_INFANTRY: { name: 'Heavy Infantry', icon: '🛡️', description: 'Armored unit (ATK 12, DEF 15). High damage and defense but slow — absorbs arrows early in the ranged phase.' },
  WARDEN: { name: 'Warden', icon: '🏰', description: 'Defensive specialist (ATK 3, DEF 25). Excellent garrison unit. Slowest unit, so takes arrows first, but extremely hard to kill.' },
  CARAVAN: { name: 'Caravan', icon: '🐴', description: 'Transport unit (DEF 2). Carries 200 resources between settlements. No attack — protect with escorts.' },
  SCOUT: { name: 'Scout', icon: '👁️', description: 'Fast recon unit (ATK 2, DEF 2, Speed 2.0). Reveals map tiles. Fastest unit — last to take arrow fire.' },
  CAVALRY: { name: 'Cavalry', icon: '⚔️', description: 'Charging heavy hitter (ATK 20, DEF 10, 15 gold). Strong vs Archers. Deals 2x damage on the first melee round. Fast speed means arrows hit them last — pair with infantry to absorb the volley.' },
}

const UNIT_ORDER: UnitType[] = ['INFANTRY', 'ARCHER', 'HEAVY_INFANTRY', 'WARDEN', 'SCOUT', 'CARAVAN', 'CAVALRY']

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  if (seconds <= 0) return 'Instant'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${secs}s`
  return `${secs}s`
}

function timeRemaining(finishAt: string | null | undefined): string {
  if (!finishAt) return ''
  const ms = new Date(finishAt).getTime() - Date.now()
  if (ms <= 0) return 'Completing...'
  const totalSeconds = Math.ceil(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

function meetsRequirements(
  requires: any,
  researchStates: any[],
  settlements: any[]
): boolean {
  if (!requires) return true

  for (const [key, value] of Object.entries(requires)) {
    if (key === 'totalWar') {
      const totalWar =
        getResearchLevel('BALLISTICS', researchStates) +
        getResearchLevel('DEFENSE_TRACK', researchStates) +
        getResearchLevel('STRATEGY', researchStates)
      if (totalWar < (value as number)) return false
    } else if (key === 'mine') {
      const allBuildings = settlements.flatMap((s: any) => s.buildings ?? [])
      const mine = allBuildings.find((b: any) => b.type === 'MINE' && b.isBuilt)
      if (!mine || mine.level < (value as number)) return false
    } else {
      const level = getResearchLevel(key, researchStates)
      if (level < (value as number)) return false
    }
  }
  return true
}

function getResearchLevel(track: string, researchStates: any[]): number {
  const state = researchStates.find((r: any) => r.track === track)
  return state?.level ?? 0
}

function requirementsText(requires: any): string {
  if (!requires) return ''
  const parts: string[] = []
  for (const [key, value] of Object.entries(requires)) {
    if (key === 'totalWar') {
      parts.push(`Total War ${value}`)
    } else if (key === 'mine') {
      parts.push(`Mine Lv${value}`)
    } else {
      parts.push(`${formatTrackName(key)} ${value}`)
    }
  }
  return parts.join(', ')
}

function formatTrackName(track: string): string {
  return track
    .replace(/_/g, ' ')
    .replace(/TRACK/g, '')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ArmyPage() {
  const {
    fetchState,
    trainUnits,
    createArmy,
    marchArmy,
    settlements,
    armies,
    resources,
    researchStates,
    mapTiles,
  } = useGameStore()

  const [trainLoading, setTrainLoading] = useState<string | null>(null)
  const [trainQuantity, setTrainQuantity] = useState<Record<string, number>>({})
  const [showCreateArmy, setShowCreateArmy] = useState(false)
  const [armyName, setArmyName] = useState('')
  const [armyUnits, setArmyUnits] = useState<Record<string, number>>({})
  const [createLoading, setCreateLoading] = useState(false)
  const [marchingArmyId, setMarchingArmyId] = useState<string | null>(null)
  const [marchTileId, setMarchTileId] = useState('')

  useEffect(() => {
    fetchState()
  }, [fetchState])

  const capital = settlements.find((s: any) => s.type === 'CAPITAL')
  const barracks = (capital?.buildings ?? []).find(
    (b: any) => b.type === 'BARRACKS' && b.isBuilt
  )
  const barracksLevel = barracks?.level ?? 1
  const barracksMultiplier = (BARRACKS_LEVEL_TRAINING_MULTIPLIERS as Record<number, number>)[barracksLevel] ?? 1.0
  const garrison = capital?.settlementUnits ?? []
  const unitQueues = capital?.unitQueues ?? []

  const getGarrisonCount = (unitType: string) => {
    const entry = garrison.find((u: any) => u.unitType === unitType)
    return entry?.quantity ?? 0
  }

  const handleTrain = async (unitType: string) => {
    if (!capital) return
    const qty = trainQuantity[unitType] ?? 1
    if (qty < 1) return
    setTrainLoading(unitType)
    try {
      await trainUnits(capital.id, unitType, qty)
      setTrainQuantity((prev) => ({ ...prev, [unitType]: 1 }))
    } finally {
      setTrainLoading(null)
    }
  }

  const handleCreateArmy = async () => {
    if (!capital || !armyName.trim()) return
    const selections: Record<string, number> = {}
    for (const [type, qty] of Object.entries(armyUnits)) {
      if (qty > 0) selections[type] = qty
    }
    if (Object.keys(selections).length === 0) return

    setCreateLoading(true)
    try {
      await createArmy(armyName.trim(), capital.id, selections)
      setShowCreateArmy(false)
      setArmyName('')
      setArmyUnits({})
    } finally {
      setCreateLoading(false)
    }
  }

  const handleMarch = async (armyId: string) => {
    if (!marchTileId.trim()) return
    await marchArmy(armyId, marchTileId.trim())
    setMarchingArmyId(null)
    setMarchTileId('')
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-amber-400">Army</h1>

      {/* Training queues */}
      {unitQueues.length > 0 && (
        <div className="bg-amber-900/20 border border-amber-600/40 rounded-lg p-3">
          <p className="text-sm font-bold text-amber-300 mb-2">Training in Progress</p>
          {unitQueues.map((q: any) => (
            <div key={q.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-300">
                {q.quantity}x {UNIT_DISPLAY[q.unitType]?.name ?? q.unitType}
              </span>
              <span className="text-amber-400 text-xs font-mono">
                {timeRemaining(q.finishAt)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Garrison */}
      {garrison.length > 0 && (
        <div className="bg-[#1e2538] rounded-lg p-4 border border-[#2a3248]">
          <h2 className="text-sm font-bold text-gray-300 mb-2">Garrison - {capital?.name}</h2>
          <div className="grid grid-cols-2 gap-2">
            {garrison
              .filter((u: any) => u.quantity > 0)
              .map((u: any) => (
                <div key={u.id} className="flex items-center gap-2 text-sm">
                  <span>{UNIT_DISPLAY[u.unitType]?.icon ?? '?'}</span>
                  <span className="text-gray-300">
                    {UNIT_DISPLAY[u.unitType]?.name ?? u.unitType}
                  </span>
                  <span className="text-white font-bold ml-auto">{u.quantity}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Train Units */}
      <div>
        <h2 className="text-lg font-bold text-amber-400 mb-3">Train Units</h2>

        {!barracks && (
          <div className="bg-[#1e2538] rounded-lg p-4 border border-[#2a3248]">
            <p className="text-sm text-gray-500 text-center">
              Build Barracks to train units.
            </p>
          </div>
        )}

        {barracks && (
          <div className="space-y-3">
            {UNIT_ORDER.map((unitType) => {
              const info = UNIT_DISPLAY[unitType]
              const cost = UNIT_TRAINING_COSTS[unitType]
              const stats = UNIT_STATS[unitType]
              const hasRequirements = meetsRequirements(
                cost.requires,
                researchStates,
                settlements
              )
              const qty = trainQuantity[unitType] ?? 1

              const totalCost = {
                ore: cost.ore * qty,
                provisions: cost.provisions * qty,
                gold: cost.gold * qty,
              }

              const canAfford =
                resources &&
                resources.ore >= totalCost.ore &&
                resources.provisions >= totalCost.provisions &&
                resources.gold >= totalCost.gold

              return (
                <div
                  key={unitType}
                  className={`bg-[#1e2538] rounded-lg p-4 border border-[#2a3248] ${
                    !hasRequirements ? 'opacity-50' : ''
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{info.icon}</span>
                      <div>
                        <h3 className="text-sm font-bold text-white">{info.name}</h3>
                        <p className="text-xs text-gray-500">{info.description}</p>
                      </div>
                    </div>
                    <span className="text-xs text-gray-500">
                      Garrisoned: {getGarrisonCount(unitType)}
                    </span>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-3 text-xs text-gray-500 mb-2 mt-2">
                    <span>ATK {stats.attack}</span>
                    <span>DEF {stats.defense}</span>
                    <span>SPD {stats.speed}</span>
                    {stats.carryCapacity > 0 && (
                      <span>Carry {stats.carryCapacity}</span>
                    )}
                  </div>

                  {/* Requirements */}
                  {!hasRequirements && cost.requires && (
                    <p className="text-xs text-red-400 mb-2">
                      Requires: {requirementsText(cost.requires)}
                    </p>
                  )}

                  {/* Cost and train */}
                  {hasRequirements && (
                    <div>
                      <div className="flex items-center gap-3 text-xs text-gray-400 mb-2 flex-wrap">
                        <span>Per unit:</span>
                        {cost.ore > 0 && <span>{cost.ore} ore</span>}
                        {cost.provisions > 0 && <span>{cost.provisions} prov</span>}
                        {cost.gold > 0 && <span>{cost.gold} gold</span>}
                        <span>({formatTime(Math.ceil(cost.timeSeconds * barracksMultiplier))})</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() =>
                              setTrainQuantity((prev) => ({
                                ...prev,
                                [unitType]: Math.max(1, (prev[unitType] ?? 1) - 1),
                              }))
                            }
                            className="w-7 h-7 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm flex items-center justify-center"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={qty}
                            onChange={(e) =>
                              setTrainQuantity((prev) => ({
                                ...prev,
                                [unitType]: Math.max(1, Math.min(99, Number(e.target.value) || 1)),
                              }))
                            }
                            className="w-12 h-7 text-center bg-gray-800 border border-gray-600 rounded text-white text-sm"
                          />
                          <button
                            onClick={() =>
                              setTrainQuantity((prev) => ({
                                ...prev,
                                [unitType]: Math.min(99, (prev[unitType] ?? 1) + 1),
                              }))
                            }
                            className="w-7 h-7 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm flex items-center justify-center"
                          >
                            +
                          </button>
                        </div>
                        <button
                          onClick={() => handleTrain(unitType)}
                          disabled={!canAfford || trainLoading === unitType}
                          className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded px-3 py-1.5 transition-colors"
                        >
                          {trainLoading === unitType
                            ? 'Training...'
                            : `Train ${qty}`}
                        </button>
                      </div>

                      {qty > 1 && (
                        <p className="text-xs text-gray-500 mt-1">
                          Total: {totalCost.ore > 0 ? `${totalCost.ore} ore` : ''}
                          {totalCost.provisions > 0 ? ` ${totalCost.provisions} prov` : ''}
                          {totalCost.gold > 0 ? ` ${totalCost.gold} gold` : ''}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Your Armies */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-amber-400">Your Armies</h2>
          <button
            onClick={() => setShowCreateArmy(true)}
            className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded px-3 py-1.5 transition-colors"
          >
            Create Army
          </button>
        </div>

        {armies.length === 0 && !showCreateArmy && (
          <div className="bg-[#1e2538] rounded-lg p-4 border border-[#2a3248]">
            <p className="text-sm text-gray-500 text-center">
              No armies formed. Create one from your garrison.
            </p>
          </div>
        )}

        {/* Create army form */}
        {showCreateArmy && (
          <div className="bg-[#1e2538] rounded-lg p-4 border border-amber-600/40 mb-3">
            <h3 className="text-sm font-bold text-white mb-3">Create New Army</h3>

            <div className="mb-3">
              <label className="text-xs text-gray-400 block mb-1">Army Name</label>
              <input
                type="text"
                value={armyName}
                onChange={(e) => setArmyName(e.target.value)}
                placeholder="Name your army..."
                maxLength={24}
                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="mb-3 space-y-2">
              <label className="text-xs text-gray-400 block">Select Units from Garrison</label>
              {garrison
                .filter((u: any) => u.quantity > 0)
                .map((u: any) => (
                  <div key={u.id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span>{UNIT_DISPLAY[u.unitType]?.icon ?? '?'}</span>
                      <span className="text-gray-300">
                        {UNIT_DISPLAY[u.unitType]?.name ?? u.unitType}
                      </span>
                      <span className="text-gray-500 text-xs">(max {u.quantity})</span>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={u.quantity}
                      value={armyUnits[u.unitType] ?? 0}
                      onChange={(e) =>
                        setArmyUnits((prev) => ({
                          ...prev,
                          [u.unitType]: Math.max(0, Math.min(u.quantity, Number(e.target.value) || 0)),
                        }))
                      }
                      className="w-16 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm text-center"
                    />
                  </div>
                ))}
              {garrison.filter((u: any) => u.quantity > 0).length === 0 && (
                <p className="text-xs text-gray-500">No units in garrison. Train some first.</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCreateArmy}
                disabled={
                  createLoading ||
                  !armyName.trim() ||
                  Object.values(armyUnits).every((v) => v === 0)
                }
                className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded px-4 py-2 transition-colors"
              >
                {createLoading ? 'Creating...' : 'Create Army'}
              </button>
              <button
                onClick={() => {
                  setShowCreateArmy(false)
                  setArmyName('')
                  setArmyUnits({})
                }}
                className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-medium rounded px-4 py-2 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Army list */}
        <div className="space-y-3">
          {armies.map((army: any) => {
            const totalUnits = (army.armyUnits ?? []).reduce(
              (sum: number, u: any) => sum + u.quantity,
              0
            )
            const isMarching = army.status === 'MARCHING'
            const isIdle = army.status === 'IDLE'

            return (
              <div key={army.id} className="bg-[#1e2538] rounded-lg p-4 border border-[#2a3248]">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-white">{army.name}</h3>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      isMarching
                        ? 'bg-amber-900/30 text-amber-400'
                        : isIdle
                        ? 'bg-green-900/30 text-green-400'
                        : 'bg-gray-700 text-gray-400'
                    }`}
                  >
                    {army.status}
                  </span>
                </div>

                {/* Unit composition */}
                <div className="flex flex-wrap gap-2 mb-2">
                  {(army.armyUnits ?? []).map((u: any) => (
                    <span key={u.id} className="text-xs text-gray-400">
                      {UNIT_DISPLAY[u.unitType]?.icon ?? '?'} {u.quantity}x{' '}
                      {UNIT_DISPLAY[u.unitType]?.name ?? u.unitType}
                    </span>
                  ))}
                </div>

                <div className="text-xs text-gray-500">
                  Total: {totalUnits} units
                </div>

                {/* Marching timer */}
                {isMarching && army.arrivesAt && (
                  <div className="mt-2 text-xs text-amber-400">
                    Arrives in: {timeRemaining(army.arrivesAt)}
                  </div>
                )}

                {/* March button for idle armies */}
                {isIdle && (
                  <div className="mt-3">
                    {marchingArmyId === army.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={marchTileId}
                          onChange={(e) => setMarchTileId(e.target.value)}
                          placeholder="Destination tile ID..."
                          className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-amber-500"
                        />
                        <button
                          onClick={() => handleMarch(army.id)}
                          disabled={!marchTileId.trim()}
                          className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-medium rounded px-3 py-1.5 transition-colors"
                        >
                          Go
                        </button>
                        <button
                          onClick={() => {
                            setMarchingArmyId(null)
                            setMarchTileId('')
                          }}
                          className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded px-2 py-1.5 transition-colors"
                        >
                          X
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setMarchingArmyId(army.id)}
                        className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium rounded px-3 py-1.5 transition-colors"
                      >
                        March
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
