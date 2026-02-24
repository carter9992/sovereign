'use client'

import { useGameStore } from '@/store/game'

interface GameEvent {
  id: string
  type: string
  message: string
  data: string | null
  createdAt: string
  read: boolean
}

interface UnitLoss {
  unitType: string
  lost: number
}

interface BattleData {
  attackerLosses?: UnitLoss[]
  defenderLosses?: UnitLoss[]
  loot?: { ore: number; provisions: number; gold: number }
  defensesDestroyed?: { type: string; level: number }[]
}

const EVENT_ICONS: Record<string, string> = {
  WELCOME: '👋',
  BUILD_COMPLETE: '🏗️',
  UPGRADE_COMPLETE: '⬆️',
  RESEARCH_COMPLETE: '📚',
  TRAINING_COMPLETE: '⚔️',
  RAID_INCOMING: '🚨',
  RAID_VICTORY: '🏆',
  RAID_DEFEAT: '💀',
  BATTLE_WON: '🏆',
  BATTLE_LOST: '💀',
  ARMY_ARRIVED: '🏁',
  ARMY_RETURNED: '🏁',
  SCOUT_REPORT: '👁️',
  SCOUT_LOST: '💀',
  SETTLEMENT_ATTACKED: '🚨',
  SETTLEMENT_DEFENDED: '🛡️',
  COMBAT_RESULT: '⚔️',
  TRADE_COMPLETE: '💱',
  TRADE_INTERCEPTED: '🏴‍☠️',
  RESOURCE_CAP: '📦',
}

const UNIT_LABELS: Record<string, string> = {
  INFANTRY: 'Infantry',
  ARCHER: 'Archers',
  HEAVY_INFANTRY: 'Heavy Infantry',
  WARDEN: 'Wardens',
  CARAVAN: 'Caravans',
  SCOUT: 'Scouts',
  CAVALRY: 'Cavalry',
}

function parseBattleData(data: string | null): BattleData | null {
  if (!data) return null
  try {
    return JSON.parse(data)
  } catch {
    return null
  }
}

function BattleReport({ event }: { event: GameEvent }) {
  if (event.type === 'BATTLE_LOST') return null

  const battle = parseBattleData(event.data)
  if (!battle) return null

  const hasLosses = battle.attackerLosses?.some((l) => l.lost > 0)
  const hasKills = battle.defenderLosses?.some((l) => l.lost > 0)
  const hasLoot =
    battle.loot &&
    (battle.loot.ore > 0 || battle.loot.provisions > 0 || battle.loot.gold > 0)

  return (
    <div className="mt-1.5 space-y-1 text-[10px] border-t border-gray-700 pt-1.5">
      {hasLosses && (
        <div>
          <span className="text-red-400 font-medium">Casualties: </span>
          {battle.attackerLosses!
            .filter((l) => l.lost > 0)
            .map((l) => `${l.lost} ${UNIT_LABELS[l.unitType] ?? l.unitType}`)
            .join(', ')}
        </div>
      )}
      {!hasLosses && (
        <div>
          <span className="text-green-400 font-medium">No casualties</span>
        </div>
      )}

      {hasKills && (
        <div>
          <span className="text-amber-400 font-medium">Enemies killed: </span>
          {battle.defenderLosses!
            .filter((l) => l.lost > 0)
            .map((l) => `${l.lost} ${UNIT_LABELS[l.unitType] ?? l.unitType}`)
            .join(', ')}
        </div>
      )}

      {battle.defensesDestroyed && battle.defensesDestroyed.length > 0 && (
        <div>
          <span className="text-amber-400 font-medium">Defenses destroyed: </span>
          {battle.defensesDestroyed
            .map((d) => `${d.type} (Lv${d.level})`)
            .join(', ')}
        </div>
      )}

      {hasLoot && (
        <div>
          <span className="text-yellow-400 font-medium">Loot secured: </span>
          {[
            battle.loot!.ore > 0 && `${Math.floor(battle.loot!.ore)} ore`,
            battle.loot!.provisions > 0 && `${Math.floor(battle.loot!.provisions)} provisions`,
            battle.loot!.gold > 0 && `${Math.floor(battle.loot!.gold)} gold`,
          ]
            .filter(Boolean)
            .join(', ')}
        </div>
      )}
    </div>
  )
}

export default function EventLog() {
  const events = useGameStore((s) => s.events) as GameEvent[]

  if (!events.length) {
    return (
      <div className="text-gray-500 text-sm text-center py-4">
        No events yet.
      </div>
    )
  }

  return (
    <div className="max-h-64 overflow-y-auto space-y-1">
      {events.map((event) => {
        const icon = EVENT_ICONS[event.type] ?? '📜'
        const time = formatTime(event.createdAt)

        return (
          <div
            key={event.id}
            className={`flex items-start gap-2 p-2 rounded text-xs ${
              event.read ? 'bg-gray-800/50 text-gray-500' : 'bg-gray-800 text-gray-300'
            }`}
          >
            <span className="text-sm leading-none mt-0.5">{icon}</span>
            <div className="flex-1 min-w-0">
              <p className="leading-snug">{event.message}</p>
              {event.type === 'BATTLE_WON' && <BattleReport event={event} />}
              <p className="text-gray-600 text-[10px] mt-0.5">{time}</p>
            </div>
            {!event.read && (
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full mt-1 shrink-0" />
            )}
          </div>
        )
      })}
    </div>
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`

  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`

  return d.toLocaleDateString()
}
