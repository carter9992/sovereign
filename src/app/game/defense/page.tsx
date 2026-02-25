'use client'

import { useEffect, useState } from 'react'
import { useGameStore } from '@/store/game'
import {
  DEFENSE_UPGRADE_COSTS,
  DEFENSE_STRUCTURE_BONUSES,
} from '@/lib/game/constants'

// ---------------------------------------------------------------------------
// Defense metadata
// ---------------------------------------------------------------------------

const DEFENSE_TYPES = ['WALLS', 'GUARD_TOWER', 'WATCH_TOWER', 'BALLISTA'] as const

const DEFENSE_INFO: Record<string, { icon: string; name: string; description: string; unlock: string }> = {
  WALLS: {
    icon: '🧱',
    name: 'Walls',
    description: 'Stone fortifications that increase your settlement defense.',
    unlock: 'Available from start',
  },
  GUARD_TOWER: {
    icon: '🗼',
    name: 'Guard Tower',
    description: 'Manned tower that boosts attack power of garrison.',
    unlock: 'Available from start',
  },
  WATCH_TOWER: {
    icon: '👁️',
    name: 'Watch Tower',
    description: 'Increases detection range for incoming threats.',
    unlock: 'Available from start',
  },
  BALLISTA: {
    icon: '🏹',
    name: 'Ballista',
    description: 'Heavy siege weapon effective against large units.',
    unlock: 'Requires Ballistics 4 + Defense 3',
  },
}

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

function isBallsistaUnlocked(researchStates: any[]): boolean {
  const ballistics = researchStates.find((r: any) => r.track === 'BALLISTICS')
  const defense = researchStates.find((r: any) => r.track === 'DEFENSE_TRACK')
  return (ballistics?.level ?? 0) >= 4 && (defense?.level ?? 0) >= 3
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DefensePage() {
  const {
    fetchState,
    buildDefense,
    settlements,
    resources,
    researchStates,
  } = useGameStore()

  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    fetchState()
  }, [fetchState])

  const capital = settlements.find((s: any) => s.type === 'CAPITAL')
  const defenses = capital?.defenses ?? []

  const ballistaUnlocked = isBallsistaUnlocked(researchStates)

  const handleBuildOrUpgrade = async (defenseType: string) => {
    if (!capital) return
    const existing = defenses.find((d: any) => d.type === defenseType)
    const action = existing && existing.level > 0 ? 'upgrade' : 'build'
    setActionLoading(defenseType)
    try {
      await buildDefense(capital.id, defenseType, action)
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-amber-400">Defenses</h1>
      <p className="text-sm text-gray-500">
        Fortify your settlement against raids and attacks.
      </p>

      <div className="space-y-3">
        {DEFENSE_TYPES.map((type) => {
          const info = DEFENSE_INFO[type]
          const defense = defenses.find((d: any) => d.type === type)
          const currentLevel = defense?.level ?? 0
          const nextLevel = currentLevel + 1

          const isUpgrading =
            defense?.upgradeFinishAt &&
            new Date(defense.upgradeFinishAt) > new Date()

          const cost = (DEFENSE_UPGRADE_COSTS as any)[type]?.[nextLevel]
          const bonus = (DEFENSE_STRUCTURE_BONUSES as any)[type]

          // Lock check for BALLISTA
          const isLocked = type === 'BALLISTA' && !ballistaUnlocked

          const canAfford =
            cost && resources
              ? (resources.ore >= (cost.ore ?? 0)) &&
                (resources.provisions >= (cost.provisions ?? 0)) &&
                (resources.gold >= (cost.gold ?? 0)) &&
                (resources.lumber >= (cost.lumber ?? 0))
              : false

          return (
            <div
              key={type}
              className={`bg-[#1e2538] rounded-lg p-4 border border-[#2a3248] ${
                isLocked ? 'opacity-60' : ''
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{info.icon}</span>
                  <div>
                    <h3 className="text-sm font-bold text-white">{info.name}</h3>
                    <p className="text-xs text-gray-500">
                      {currentLevel > 0 ? `Level ${currentLevel}` : 'Not Built'}
                    </p>
                  </div>
                </div>
                {bonus && currentLevel > 0 && (
                  <span className="text-xs text-green-400">
                    +{Object.values(bonus)[0] as number * currentLevel}%{' '}
                    {Object.keys(bonus)[0]
                      .replace(/Percent$/, '')
                      .replace(/([A-Z])/g, ' $1')
                      .trim()
                      .toLowerCase()}
                  </span>
                )}
              </div>

              {/* Description */}
              <p className="text-xs text-gray-400 mb-1">{info.description}</p>

              {/* Unlock requirement */}
              {isLocked && (
                <p className="text-xs text-red-400 mb-3">{info.unlock}</p>
              )}

              {/* Upgrading status */}
              {isUpgrading && (
                <div className="bg-amber-900/20 border border-amber-700/30 rounded px-3 py-2 mb-3 mt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-amber-300">
                      {currentLevel === 0 ? 'Building...' : 'Upgrading...'}
                    </span>
                    <span className="text-xs text-amber-400 font-mono">
                      {timeRemaining(defense.upgradeFinishAt)}
                    </span>
                  </div>
                </div>
              )}

              {/* Build/Upgrade button */}
              {!isLocked && !isUpgrading && cost && (
                <div className="mt-3">
                  <div className="flex items-center gap-3 text-xs text-gray-400 mb-2 flex-wrap">
                    <span>{currentLevel === 0 ? 'Build' : `Upgrade to Lv${nextLevel}`}:</span>
                    {cost.lumber && (
                      <span className={resources && resources.lumber < cost.lumber ? 'text-red-400' : ''}>
                        {cost.lumber} lumber
                      </span>
                    )}
                    {cost.ore && (
                      <span className={resources && resources.ore < cost.ore ? 'text-red-400' : ''}>
                        {cost.ore} ore
                      </span>
                    )}
                    {cost.provisions && (
                      <span className={resources && resources.provisions < cost.provisions ? 'text-red-400' : ''}>
                        {cost.provisions} provisions
                      </span>
                    )}
                    {cost.gold && (
                      <span className={resources && resources.gold < cost.gold ? 'text-red-400' : ''}>
                        {cost.gold} gold
                      </span>
                    )}
                    {cost.timeSeconds && <span>({formatTime(cost.timeSeconds)})</span>}
                  </div>
                  <button
                    onClick={() => handleBuildOrUpgrade(type)}
                    disabled={!canAfford || actionLoading === type}
                    className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded px-4 py-2 transition-colors"
                  >
                    {actionLoading === type
                      ? 'Working...'
                      : currentLevel === 0
                      ? 'Build'
                      : 'Upgrade'}
                  </button>
                </div>
              )}

              {/* Max level */}
              {!isLocked && !isUpgrading && !cost && currentLevel > 0 && (
                <p className="text-xs text-green-400 mt-2">Max level reached</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
