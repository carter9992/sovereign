'use client'

import { useEffect, useState } from 'react'
import { useGameStore } from '@/store/game'
import {
  BUILDING_BUILD_TIMES,
  BUILDING_BUILD_COSTS,
  MINE_UPGRADE_COSTS,
  CITADEL_UPGRADE_COSTS,
  STORAGE_UPGRADE_COSTS,
  SAWMILL_UPGRADE_COSTS,
  BARRACKS_UPGRADE_COSTS,
  FARM_UPGRADE_COSTS,
  TUTORIAL_STEPS,
} from '@/lib/game/constants'

// ---------------------------------------------------------------------------
// Building metadata
// ---------------------------------------------------------------------------

const BUILDING_DESCRIPTIONS: Record<string, string> = {
  SAWMILL: 'Produces lumber for construction. Output scales with Forestry research.',
  FARM: 'Produces provisions. Upgrade to increase output.',
  MINE: 'Produces ore. Upgrade to increase output. Production stops during upgrades.',
  OBSERVATORY: 'Survey the land. Required for Mana discovery.',
  BARRACKS: 'Train military units. Upgrade to decrease training time.',
  STORAGE: 'Increases resource storage caps.',
  CITADEL: 'Your seat of power. Unlocks scouts, frontiers, and advanced features.',
}

const BUILDING_ICONS: Record<string, string> = {
  SAWMILL: '🪵',
  FARM: '🌾',
  MINE: '⛏️',
  OBSERVATORY: '🔭',
  BARRACKS: '⚔️',
  STORAGE: '📦',
  CITADEL: '🏰',
}

// Tutorial step -> building that should be highlighted
const TUTORIAL_HIGHLIGHT: Record<number, string> = {
  [TUTORIAL_STEPS.START]: 'SAWMILL',
  [TUTORIAL_STEPS.BUILD_SAWMILL]: 'FARM',
  [TUTORIAL_STEPS.BUILD_FARM]: 'MINE',
  [TUTORIAL_STEPS.BUILD_MINE]: 'OBSERVATORY',
  [TUTORIAL_STEPS.RESEARCH_IRRIGATION]: 'BARRACKS',
}

// Display order
const BUILDING_ORDER = ['CITADEL', 'SAWMILL', 'FARM', 'MINE', 'OBSERVATORY', 'BARRACKS', 'STORAGE']

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  if (seconds <= 0) return 'Instant'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
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

function getUpgradeCost(type: string, nextLevel: number) {
  if (type === 'MINE') return (MINE_UPGRADE_COSTS as any)[nextLevel]
  if (type === 'CITADEL') return (CITADEL_UPGRADE_COSTS as any)[nextLevel]
  if (type === 'STORAGE') return (STORAGE_UPGRADE_COSTS as any)[nextLevel]
  if (type === 'SAWMILL') return (SAWMILL_UPGRADE_COSTS as any)[nextLevel]
  if (type === 'BARRACKS') return (BARRACKS_UPGRADE_COSTS as any)[nextLevel]
  if (type === 'FARM') return (FARM_UPGRADE_COSTS as any)[nextLevel]
  return null
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BuildingsPage() {
  const {
    fetchState,
    build,
    settlements,
    resources,
    tutorialStep,
  } = useGameStore()

  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    fetchState()
  }, [fetchState])

  const capital = settlements.find((s: any) => s.type === 'CAPITAL')
  const buildings = capital?.buildings ?? []

  const highlightedBuilding = TUTORIAL_HIGHLIGHT[tutorialStep]

  const handleBuild = async (buildingType: string) => {
    if (!capital) return
    setActionLoading(buildingType)
    try {
      await build(capital.id, buildingType, 'build')
    } finally {
      setActionLoading(null)
    }
  }

  const handleUpgrade = async (buildingType: string) => {
    if (!capital) return
    setActionLoading(buildingType + '_upgrade')
    try {
      await build(capital.id, buildingType, 'upgrade')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-amber-400">Buildings</h1>
      <p className="text-sm text-gray-500">
        {capital?.name ?? 'Capital'} Settlement
      </p>

      <div className="space-y-3">
        {BUILDING_ORDER.map((type) => {
          const building = buildings.find((b: any) => b.type === type)
          if (!building) return null

          const isBuilt = building.isBuilt
          const isUpgrading =
            building.upgradeFinishAt &&
            new Date(building.upgradeFinishAt) > new Date()
          const isHighlighted = highlightedBuilding === type
          const canUpgrade = type === 'MINE' || type === 'CITADEL' || type === 'STORAGE' || type === 'SAWMILL' || type === 'BARRACKS' || type === 'FARM'

          const upgradeCost = canUpgrade && isBuilt ? getUpgradeCost(type, building.level + 1) : null
          const buildCost = !isBuilt ? BUILDING_BUILD_COSTS[type] : null
          const buildTime = !isBuilt
            ? (BUILDING_BUILD_TIMES as Record<string, number>)[type]
            : upgradeCost?.timeSeconds

          const canAffordBuild =
            buildCost && resources
              ? (resources.ore >= (buildCost.ore ?? 0)) &&
                (resources.provisions >= (buildCost.provisions ?? 0)) &&
                (resources.gold >= (buildCost.gold ?? 0)) &&
                (resources.lumber >= (buildCost.lumber ?? 0))
              : false

          const canAffordUpgrade =
            upgradeCost && resources
              ? (resources.ore >= (upgradeCost.ore ?? 0)) &&
                (resources.provisions >= (upgradeCost.provisions ?? 0)) &&
                (resources.gold >= (upgradeCost.gold ?? 0)) &&
                (resources.lumber >= (upgradeCost.lumber ?? 0)) &&
                (resources.mana >= (upgradeCost.mana ?? 0))
              : false

          return (
            <div
              key={building.id}
              className={`bg-[#1e2538] rounded-lg p-4 border transition-colors ${
                isHighlighted
                  ? 'border-amber-500 ring-1 ring-amber-500/30'
                  : 'border-[#2a3248]'
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{BUILDING_ICONS[type] ?? '🏗️'}</span>
                  <div>
                    <h3 className="text-sm font-bold text-white">{type}</h3>
                    <p className="text-xs text-gray-500">
                      {isBuilt ? `Level ${building.level}` : 'Not Built'}
                    </p>
                  </div>
                </div>

                {isHighlighted && !isBuilt && !isUpgrading && (
                  <span className="text-xs bg-amber-600/20 text-amber-400 px-2 py-0.5 rounded">
                    Build Next
                  </span>
                )}
              </div>

              {/* Description */}
              <p className="text-xs text-gray-400 mb-3">
                {BUILDING_DESCRIPTIONS[type]}
              </p>

              {/* Upgrading status */}
              {isUpgrading && (
                <div className="bg-amber-900/20 border border-amber-700/30 rounded px-3 py-2 mb-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-amber-300">
                      {isBuilt ? 'Upgrading...' : 'Building...'}
                    </span>
                    <span className="text-xs text-amber-400 font-mono">
                      {timeRemaining(building.upgradeFinishAt)}
                    </span>
                  </div>
                </div>
              )}

              {/* Build button (not yet built) */}
              {!isBuilt && !isUpgrading && buildCost && (
                <div>
                  <div className="flex items-center gap-3 text-xs text-gray-400 mb-2 flex-wrap">
                    <span>Cost:</span>
                    {buildCost.lumber && (
                      <span className={resources && resources.lumber < buildCost.lumber ? 'text-red-400' : ''}>
                        {buildCost.lumber} lumber
                      </span>
                    )}
                    {buildCost.ore && (
                      <span className={resources && resources.ore < buildCost.ore ? 'text-red-400' : ''}>
                        {buildCost.ore} ore
                      </span>
                    )}
                    {buildCost.provisions && (
                      <span className={resources && resources.provisions < buildCost.provisions ? 'text-red-400' : ''}>
                        {buildCost.provisions} provisions
                      </span>
                    )}
                    {buildCost.gold && (
                      <span className={resources && resources.gold < buildCost.gold ? 'text-red-400' : ''}>
                        {buildCost.gold} gold
                      </span>
                    )}
                    {buildTime && <span>({formatTime(buildTime)})</span>}
                  </div>
                  <button
                    onClick={() => handleBuild(type)}
                    disabled={!canAffordBuild || actionLoading === type}
                    className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded px-4 py-2 transition-colors"
                  >
                    {actionLoading === type ? 'Building...' : 'Build'}
                  </button>
                </div>
              )}

              {/* Upgrade button (already built, upgradeable) */}
              {isBuilt && !isUpgrading && canUpgrade && upgradeCost && (
                <div>
                  <div className="flex items-center gap-3 text-xs text-gray-400 mb-2 flex-wrap">
                    <span>Upgrade to Lv{building.level + 1}:</span>
                    {upgradeCost.lumber && (
                      <span className={resources && resources.lumber < upgradeCost.lumber ? 'text-red-400' : ''}>
                        {upgradeCost.lumber} lumber
                      </span>
                    )}
                    {upgradeCost.ore && (
                      <span className={resources && resources.ore < upgradeCost.ore ? 'text-red-400' : ''}>
                        {upgradeCost.ore} ore
                      </span>
                    )}
                    {upgradeCost.provisions && (
                      <span className={resources && resources.provisions < upgradeCost.provisions ? 'text-red-400' : ''}>
                        {upgradeCost.provisions} provisions
                      </span>
                    )}
                    {upgradeCost.gold && (
                      <span className={resources && resources.gold < upgradeCost.gold ? 'text-red-400' : ''}>
                        {upgradeCost.gold} gold
                      </span>
                    )}
                    {upgradeCost.mana && (
                      <span className={resources && resources.mana < upgradeCost.mana ? 'text-red-400' : ''}>
                        {upgradeCost.mana} mana
                      </span>
                    )}
                    {upgradeCost.timeSeconds && <span>({formatTime(upgradeCost.timeSeconds)})</span>}
                  </div>
                  <button
                    onClick={() => handleUpgrade(type)}
                    disabled={!canAffordUpgrade || actionLoading === type + '_upgrade'}
                    className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded px-4 py-2 transition-colors"
                  >
                    {actionLoading === type + '_upgrade' ? 'Upgrading...' : 'Upgrade'}
                  </button>
                </div>
              )}

              {/* Max level reached */}
              {isBuilt && !isUpgrading && canUpgrade && !upgradeCost && (
                <p className="text-xs text-green-400">Max level reached</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
