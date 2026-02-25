'use client'

import { useEffect, useState } from 'react'
import { useGameStore } from '@/store/game'

// ---------------------------------------------------------------------------
// Crown Market exchange rates
// ---------------------------------------------------------------------------

const EXCHANGE_RATES: Record<string, Record<string, number>> = {
  ore: { provisions: 1.5, gold: 0.25, lumber: 1.2, mana: 0.2 },
  provisions: { ore: 0.667, gold: 0.2, lumber: 0.8, mana: 0.15 },
  lumber: { ore: 0.8, provisions: 1.2, gold: 0.25, mana: 0.2 },
  gold: { ore: 4, provisions: 5, lumber: 4, mana: 0.5 },
  mana: { ore: 5, provisions: 7, lumber: 5, gold: 2 },
}

const RESOURCE_ICONS: Record<string, string> = {
  ore: '⛏️',
  lumber: '🪵',
  provisions: '🌾',
  gold: '💰',
  mana: '🔮',
}

const RESOURCE_NAMES = ['ore', 'lumber', 'provisions', 'gold', 'mana']

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeRemaining(finishAt: string | null | undefined): string {
  if (!finishAt) return ''
  const ms = new Date(finishAt).getTime() - Date.now()
  if (ms <= 0) return 'Arriving...'
  const totalSeconds = Math.ceil(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TradePage() {
  const { fetchState, executeTrade, resources, events } = useGameStore()

  const [sendResource, setSendResource] = useState('ore')
  const [receiveResource, setReceiveResource] = useState('gold')
  const [sendAmount, setSendAmount] = useState(100)
  const [tradeLoading, setTradeLoading] = useState(false)
  const [tradeError, setTradeError] = useState('')
  const [tradeSuccess, setTradeSuccess] = useState('')

  useEffect(() => {
    fetchState()
  }, [fetchState])

  // Ensure send and receive are not the same resource
  useEffect(() => {
    if (sendResource === receiveResource) {
      const alternatives = RESOURCE_NAMES.filter((r) => r !== sendResource)
      setReceiveResource(alternatives[0])
    }
  }, [sendResource, receiveResource])

  const rate = EXCHANGE_RATES[sendResource]?.[receiveResource] ?? 0
  const receiveAmount = Math.floor(sendAmount * rate)

  const canAfford =
    resources &&
    sendAmount > 0 &&
    (resources as any)[sendResource] >= sendAmount

  const handleTrade = async () => {
    setTradeLoading(true)
    setTradeError('')
    setTradeSuccess('')
    try {
      await executeTrade({
        type: 'CROWN_MARKET',
        resourceSend: sendResource,
        amountSend: sendAmount,
        resourceReceive: receiveResource,
      })
      setTradeSuccess(
        `Traded ${sendAmount} ${sendResource} for ~${receiveAmount} ${receiveResource}`
      )
      setSendAmount(100)
    } catch (err) {
      setTradeError(err instanceof Error ? err.message : 'Trade failed')
    } finally {
      setTradeLoading(false)
    }
  }

  // Trade events from event log
  const tradeEvents = (events ?? []).filter(
    (e: any) =>
      e.type === 'TRADE_COMPLETE' ||
      e.type === 'TRADE_INTERCEPTED' ||
      e.type === 'TRADE_SENT'
  )

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-amber-400">Crown Market</h1>
      <p className="text-sm text-gray-500">
        Exchange resources at the Crown Market. Rates vary by resource type.
      </p>

      {/* Exchange Rates Table */}
      <div className="bg-[#1e2538] rounded-lg p-4 border border-[#2a3248]">
        <h2 className="text-sm font-bold text-gray-300 mb-3">Exchange Rates</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-700">
                <th className="text-left py-1.5 pr-2">Send</th>
                <th className="text-left py-1.5 pr-2">Receive</th>
                <th className="text-right py-1.5">Rate</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(EXCHANGE_RATES).map(([from, toRates]) =>
                Object.entries(toRates).map(([to, r]) => (
                  <tr
                    key={`${from}-${to}`}
                    className="border-b border-gray-800/50"
                  >
                    <td className="py-1.5 pr-2 text-gray-300">
                      {RESOURCE_ICONS[from]} {from}
                    </td>
                    <td className="py-1.5 pr-2 text-gray-300">
                      {RESOURCE_ICONS[to]} {to}
                    </td>
                    <td className="py-1.5 text-right text-amber-400">
                      1 : {r}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trade Panel */}
      <div className="bg-[#1e2538] rounded-lg p-4 border border-[#2a3248]">
        <h2 className="text-sm font-bold text-gray-300 mb-3">Make a Trade</h2>

        <div className="space-y-3">
          {/* Send */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">You Send</label>
            <div className="flex items-center gap-2">
              <select
                value={sendResource}
                onChange={(e) => setSendResource(e.target.value)}
                className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
              >
                {RESOURCE_NAMES.map((r) => (
                  <option key={r} value={r}>
                    {RESOURCE_ICONS[r]} {r}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={sendAmount}
                onChange={(e) =>
                  setSendAmount(Math.max(1, Number(e.target.value) || 1))
                }
                className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
            {resources && (
              <p className="text-xs text-gray-500 mt-1">
                Available: {Math.floor((resources as any)[sendResource] ?? 0)}
              </p>
            )}
          </div>

          {/* Arrow */}
          <div className="text-center text-gray-500 text-lg">
            ↓
          </div>

          {/* Receive */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">You Receive</label>
            <div className="flex items-center gap-2">
              <select
                value={receiveResource}
                onChange={(e) => setReceiveResource(e.target.value)}
                className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
              >
                {RESOURCE_NAMES
                  .filter((r) => r !== sendResource)
                  .map((r) => (
                    <option key={r} value={r}>
                      {RESOURCE_ICONS[r]} {r}
                    </option>
                  ))}
              </select>
              <div className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-amber-400 text-sm font-mono">
                ~{receiveAmount}
              </div>
            </div>
            {rate === 0 && (
              <p className="text-xs text-red-400 mt-1">
                This trade route is not available.
              </p>
            )}
          </div>

          {/* Rate display */}
          {rate > 0 && (
            <p className="text-xs text-gray-500 text-center">
              Rate: 1 {sendResource} = {rate} {receiveResource}
            </p>
          )}

          {/* Error / Success */}
          {tradeError && (
            <p className="text-sm text-red-400 text-center">{tradeError}</p>
          )}
          {tradeSuccess && (
            <p className="text-sm text-green-400 text-center">{tradeSuccess}</p>
          )}

          {/* Trade button */}
          <button
            onClick={handleTrade}
            disabled={!canAfford || rate === 0 || tradeLoading || receiveAmount <= 0}
            className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded px-4 py-2.5 transition-colors"
          >
            {tradeLoading ? 'Trading...' : 'Execute Trade'}
          </button>
        </div>
      </div>

      {/* Trade History */}
      <div className="bg-[#1e2538] rounded-lg p-4 border border-[#2a3248]">
        <h2 className="text-sm font-bold text-gray-300 mb-3">Trade History</h2>
        {tradeEvents.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-2">
            No trade history yet.
          </p>
        ) : (
          <div className="space-y-2">
            {tradeEvents.slice(0, 10).map((event: any) => (
              <div
                key={event.id}
                className="text-sm border-l-2 border-gray-600 pl-3 py-1"
              >
                <p className="text-gray-300">{event.message}</p>
                <p className="text-gray-600 text-xs mt-0.5">
                  {new Date(event.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Trade Agreements (future feature) */}
      <div className="bg-[#1e2538] rounded-lg p-4 border border-[#2a3248] opacity-50">
        <h2 className="text-sm font-bold text-gray-300 mb-2">Trade Agreements</h2>
        <p className="text-sm text-gray-500 text-center">
          Negotiate trade agreements with other players and NPC factions. Coming soon.
        </p>
      </div>
    </div>
  )
}
