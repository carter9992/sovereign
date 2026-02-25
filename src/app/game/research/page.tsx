'use client'

import { useEffect, useState } from 'react'
import { useGameStore } from '@/store/game'
import {
  WAR_TECH_COSTS,
  AGRICULTURE_COSTS,
  FORESTRY_COSTS,
} from '@/lib/game/constants'

// ---------------------------------------------------------------------------
// Research track metadata
// ---------------------------------------------------------------------------

const WAR_TRACKS: { track: string; name: string; icon: string; description: string; unlocks: Record<number, string> }[] = [
  {
    track: 'BALLISTICS',
    name: 'Ballistics',
    icon: '🎯',
    description: 'Ranged weapon mastery.',
    unlocks: {
      1: 'Unlocks Archers',
      4: 'Unlocks Ballista defense',
    },
  },
  {
    track: 'DEFENSE_TRACK',
    name: 'Defense',
    icon: '🛡️',
    description: 'Fortification and garrison tactics.',
    unlocks: {
      2: 'Unlocks Wardens',
      3: 'Unlocks Ballista defense',
    },
  },
  {
    track: 'STRATEGY',
    name: 'Strategy',
    icon: '📐',
    description: 'Military intelligence and logistics.',
    unlocks: {
      1: 'Unlocks Scouts',
    },
  },
]

const AGRICULTURE_TRACKS: { track: string; name: string; icon: string; description: string; unlocks: Record<number, string> }[] = [
  {
    track: 'CROP_MASTERY',
    name: 'Crop Mastery',
    icon: '🌾',
    description: 'Improve provision output from farms.',
    unlocks: {
      1: '+30% provisions',
      2: '+60% provisions',
      3: '+100% provisions',
      4: '+150% provisions',
      5: '+200% provisions',
    },
  },
  {
    track: 'ANIMAL_HUSBANDRY',
    name: 'Animal Husbandry',
    icon: '🐎',
    description: 'Breed animals for transport and war.',
    unlocks: {
      2: 'Unlocks Caravans',
      3: 'Unlocks Cavalry',
    },
  },
]

const ECONOMY_TRACKS: { track: string; name: string; icon: string; description: string; unlocks: Record<number, string> }[] = [
  {
    track: 'FORESTRY',
    name: 'Forestry',
    icon: '🪵',
    description: 'Improve lumber output from sawmills.',
    unlocks: {
      1: '+20% lumber',
      2: '+40% lumber',
      3: '+70% lumber',
      4: '+100% lumber',
      5: '+150% lumber',
    },
  },
]

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

function getCostForTrack(track: string, level: number): any {
  if (track === 'BALLISTICS' || track === 'DEFENSE_TRACK' || track === 'STRATEGY') {
    return (WAR_TECH_COSTS as any)[track]?.[level]
  }
  if (track === 'CROP_MASTERY' || track === 'ANIMAL_HUSBANDRY') {
    return (AGRICULTURE_COSTS as any)[track]?.[level]
  }
  if (track === 'FORESTRY') {
    return (FORESTRY_COSTS as any)[level]
  }
  return null
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ResearchPage() {
  const {
    fetchState,
    startResearch,
    researchStates,
    activeResearch,
    resources,
  } = useGameStore()

  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    fetchState()
  }, [fetchState])

  const getLevel = (track: string) => {
    const state = researchStates.find((r: any) => r.track === track)
    return state?.level ?? 0
  }

  const totalWarLevel =
    getLevel('BALLISTICS') + getLevel('DEFENSE_TRACK') + getLevel('STRATEGY')

  const handleResearch = async (track: string) => {
    setActionLoading(track)
    try {
      await startResearch(track)
    } finally {
      setActionLoading(null)
    }
  }

  const isResearching = !!activeResearch

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-amber-400">Research</h1>

      {/* Active research display */}
      {activeResearch && (
        <div className="bg-amber-900/20 border border-amber-600/40 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-amber-300">
                Researching: {formatTrackName(activeResearch.track)}
              </p>
              <p className="text-xs text-amber-400/70 mt-0.5">
                In progress...
              </p>
            </div>
            <span className="text-sm text-amber-400 font-mono">
              {timeRemaining(activeResearch.finishAt)}
            </span>
          </div>
        </div>
      )}

      {/* Total War Level */}
      <div className="bg-[#1e2538] rounded-lg p-3 border border-[#2a3248] flex items-center justify-between">
        <span className="text-sm text-gray-400">Total War Level</span>
        <span className="text-lg font-bold text-red-400">{totalWarLevel}</span>
      </div>

      {/* War Section */}
      <div>
        <h2 className="text-lg font-bold text-red-400 mb-3 flex items-center gap-2">
          <span>War</span>
        </h2>
        <div className="space-y-3">
          {WAR_TRACKS.map((t) => (
            <ResearchCard
              key={t.track}
              track={t.track}
              name={t.name}
              icon={t.icon}
              description={t.description}
              unlocks={t.unlocks}
              currentLevel={getLevel(t.track)}
              resources={resources}
              isResearching={isResearching}
              activeTrack={activeResearch?.track}
              actionLoading={actionLoading}
              onResearch={handleResearch}
            />
          ))}
        </div>
      </div>

      {/* Agriculture Section */}
      <div>
        <h2 className="text-lg font-bold text-green-400 mb-3 flex items-center gap-2">
          <span>Agriculture</span>
        </h2>
        <div className="space-y-3">
          {AGRICULTURE_TRACKS.map((t) => (
            <ResearchCard
              key={t.track}
              track={t.track}
              name={t.name}
              icon={t.icon}
              description={t.description}
              unlocks={t.unlocks}
              currentLevel={getLevel(t.track)}
              resources={resources}
              isResearching={isResearching}
              activeTrack={activeResearch?.track}
              actionLoading={actionLoading}
              onResearch={handleResearch}
            />
          ))}
        </div>
      </div>

      {/* Economy Section */}
      <div>
        <h2 className="text-lg font-bold text-yellow-400 mb-3 flex items-center gap-2">
          <span>Economy</span>
        </h2>
        <div className="space-y-3">
          {ECONOMY_TRACKS.map((t) => (
            <ResearchCard
              key={t.track}
              track={t.track}
              name={t.name}
              icon={t.icon}
              description={t.description}
              unlocks={t.unlocks}
              currentLevel={getLevel(t.track)}
              resources={resources}
              isResearching={isResearching}
              activeTrack={activeResearch?.track}
              actionLoading={actionLoading}
              onResearch={handleResearch}
            />
          ))}
        </div>
      </div>

      {/* Arcana Section (placeholder for future) */}
      <div>
        <h2 className="text-lg font-bold text-purple-400 mb-3 flex items-center gap-2">
          <span>Arcana</span>
          <span className="text-xs text-gray-600 font-normal">(Locked)</span>
        </h2>
        <div className="bg-[#1e2538] rounded-lg p-4 border border-[#2a3248] opacity-50">
          <p className="text-sm text-gray-500 text-center">
            Build an Observatory and discover Mana to unlock arcane research.
          </p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ResearchCard
// ---------------------------------------------------------------------------

function ResearchCard({
  track,
  name,
  icon,
  description,
  unlocks,
  currentLevel,
  resources,
  isResearching,
  activeTrack,
  actionLoading,
  onResearch,
}: {
  track: string
  name: string
  icon: string
  description: string
  unlocks: Record<number, string>
  currentLevel: number
  resources: any
  isResearching: boolean
  activeTrack?: string
  actionLoading: string | null
  onResearch: (track: string) => void
}) {
  const maxLevel = 5
  const nextLevel = currentLevel + 1
  const isMaxed = currentLevel >= maxLevel
  const isThisActive = activeTrack === track

  const cost = !isMaxed ? getCostForTrack(track, nextLevel) : null

  const canAfford =
    cost && resources
      ? (resources.ore >= (cost.ore ?? 0)) &&
        (resources.provisions >= (cost.provisions ?? 0)) &&
        (resources.gold >= (cost.gold ?? 0)) &&
        (resources.lumber >= (cost.lumber ?? 0)) &&
        (resources.mana >= (cost.mana ?? 0))
      : false

  return (
    <div
      className={`bg-[#1e2538] rounded-lg p-4 border ${
        isThisActive ? 'border-amber-500' : 'border-[#2a3248]'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <div>
            <h3 className="text-sm font-bold text-white">{name}</h3>
            <p className="text-xs text-gray-500">{description}</p>
          </div>
        </div>
      </div>

      {/* Level pips */}
      <div className="flex items-center gap-1.5 mb-3">
        {Array.from({ length: maxLevel }, (_, i) => {
          const level = i + 1
          const isFilled = level <= currentLevel
          const isNext = level === nextLevel && !isMaxed
          return (
            <div key={level} className="flex flex-col items-center">
              <div
                className={`w-8 h-2 rounded-full ${
                  isFilled
                    ? 'bg-amber-500'
                    : isNext
                    ? 'bg-amber-900/50 border border-amber-600/50'
                    : 'bg-gray-700'
                }`}
              />
              <span className="text-[9px] text-gray-600 mt-0.5">{level}</span>
            </div>
          )
        })}
      </div>

      {/* Unlock info for completed levels */}
      {Object.entries(unlocks).map(([lvl, text]) => {
        const unlockLevel = Number(lvl)
        const isUnlocked = currentLevel >= unlockLevel
        return (
          <div
            key={lvl}
            className={`text-xs mb-1 flex items-center gap-1.5 ${
              isUnlocked ? 'text-green-400' : 'text-gray-600'
            }`}
          >
            <span>{isUnlocked ? 'o' : '-'}</span>
            <span>
              Lv{lvl}: {text}
            </span>
          </div>
        )
      })}

      {/* Cost and research button */}
      {!isMaxed && cost && (
        <div className="mt-3">
          <div className="flex items-center gap-3 text-xs text-gray-400 mb-2 flex-wrap">
            <span>Lv{nextLevel}:</span>
            {cost.ore && (
              <span className={resources && resources.ore < cost.ore ? 'text-red-400' : ''}>
                {cost.ore} ore
              </span>
            )}
            {cost.lumber && (
              <span className={resources && resources.lumber < cost.lumber ? 'text-red-400' : ''}>
                {cost.lumber} lumber
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
            {cost.mana && (
              <span className={resources && resources.mana < cost.mana ? 'text-red-400' : ''}>
                {cost.mana} mana
              </span>
            )}
            {cost.timeSeconds && <span>({formatTime(cost.timeSeconds)})</span>}
          </div>
          <button
            onClick={() => onResearch(track)}
            disabled={!canAfford || isResearching || actionLoading === track}
            className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded px-4 py-2 transition-colors"
          >
            {actionLoading === track
              ? 'Starting...'
              : isResearching && !isThisActive
              ? 'Research in progress'
              : isThisActive
              ? 'Researching...'
              : 'Research'}
          </button>
        </div>
      )}

      {isMaxed && (
        <p className="text-xs text-green-400 mt-2">Mastered</p>
      )}
    </div>
  )
}

function formatTrackName(track: string): string {
  return track
    .replace(/_/g, ' ')
    .replace(/TRACK/g, '')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
