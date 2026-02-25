'use client'

import { useState } from 'react'
import { useGameStore } from '@/store/game'

export default function DebugPanel() {
  const debugFastForward = useGameStore((s) => s.debugFastForward)
  const debugAddResources = useGameStore((s) => s.debugAddResources)

  const [open, setOpen] = useState(false)
  const [minutes, setMinutes] = useState(10)

  // Only render in development
  if (process.env.NODE_ENV !== 'development') return null

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-3 z-50 bg-red-900/80 text-red-300 text-xs px-2 py-1 rounded hover:bg-red-800 transition-colors"
      >
        Debug
      </button>
    )
  }

  return (
    <div className="fixed bottom-20 right-3 z-50 bg-gray-900 border border-red-800 rounded-lg p-3 w-56 shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <span className="text-red-400 text-xs font-semibold">Debug Panel</span>
        <button
          onClick={() => setOpen(false)}
          className="text-gray-500 hover:text-gray-300 text-xs"
        >
          Close
        </button>
      </div>

      {/* Fast Forward */}
      <div className="mb-3">
        <label className="text-gray-400 text-xs block mb-1">Fast Forward</label>
        <div className="flex gap-1">
          <input
            type="number"
            value={minutes}
            onChange={(e) => setMinutes(Math.max(1, Number(e.target.value)))}
            className="bg-gray-800 text-white text-xs rounded px-2 py-1 w-16"
            min={1}
          />
          <span className="text-gray-500 text-xs self-center">min</span>
          <button
            onClick={() => debugFastForward(minutes)}
            className="bg-red-800 hover:bg-red-700 text-white text-xs px-2 py-1 rounded flex-1 transition-colors"
          >
            Go
          </button>
        </div>
      </div>

      {/* Add Resources */}
      <div>
        <label className="text-gray-400 text-xs block mb-1">Add Resources</label>
        <div className="grid grid-cols-2 gap-1">
          <button
            onClick={() => debugAddResources({ ore: 1000 })}
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs py-1 rounded transition-colors"
          >
            +1k Ore
          </button>
          <button
            onClick={() => debugAddResources({ provisions: 1000 })}
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs py-1 rounded transition-colors"
          >
            +1k Food
          </button>
          <button
            onClick={() => debugAddResources({ lumber: 1000 })}
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs py-1 rounded transition-colors"
          >
            +1k Lumber
          </button>
          <button
            onClick={() => debugAddResources({ gold: 1000 })}
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs py-1 rounded transition-colors"
          >
            +1k Gold
          </button>
          <button
            onClick={() => debugAddResources({ mana: 500 })}
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs py-1 rounded transition-colors"
          >
            +500 Mana
          </button>
          <button
            onClick={() =>
              debugAddResources({ ore: 5000, provisions: 5000, gold: 5000, lumber: 5000, mana: 1000 })
            }
            className="col-span-2 bg-red-900 hover:bg-red-800 text-red-300 text-xs py-1 rounded transition-colors"
          >
            +All Max
          </button>
        </div>
      </div>
    </div>
  )
}
