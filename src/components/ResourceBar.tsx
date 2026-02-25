'use client'

import { useGameStore } from '@/store/game'

export default function ResourceBar() {
  const resources = useGameStore((s) => s.resources)

  if (!resources) return null

  const showMana = resources.mana > 0 || resources.manaCap > 0

  return (
    <div className="sticky top-0 z-40 bg-gray-900 border-b border-gray-700 px-2 py-1.5">
      <div className="flex items-center justify-between gap-1 max-w-md mx-auto">
        <ResourceItem
          icon="⛏️"
          label="Ore"
          current={resources.ore}
          cap={resources.oreCap}
        />
        <ResourceItem
          icon="🪵"
          label="Lumber"
          current={resources.lumber}
          cap={resources.lumberCap}
        />
        <ResourceItem
          icon="🌾"
          label="Provisions"
          current={resources.provisions}
          cap={resources.provisionsCap}
        />
        <ResourceItem
          icon="💰"
          label="Gold"
          current={resources.gold}
          cap={resources.goldCap}
        />
        {showMana && (
          <ResourceItem
            icon="🔮"
            label="Mana"
            current={resources.mana}
            cap={resources.manaCap}
          />
        )}
      </div>
    </div>
  )
}

function ResourceItem({
  icon,
  label,
  current,
  cap,
}: {
  icon: string
  label: string
  current: number
  cap: number
}) {
  const pct = cap > 0 ? (current / cap) * 100 : 0
  const isFull = pct >= 95

  return (
    <div className="flex items-center gap-1 min-w-0" title={label}>
      <span className="text-sm leading-none">{icon}</span>
      <span
        className={`text-xs font-mono whitespace-nowrap ${
          isFull ? 'text-amber-400' : 'text-white'
        }`}
      >
        {Math.floor(current)}{' '}
        <span className="text-gray-500">/ {formatCap(cap)}</span>
      </span>
    </div>
  )
}

function formatCap(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return String(n)
}
