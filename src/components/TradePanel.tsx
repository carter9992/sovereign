'use client'

import { useState } from 'react'
import { useGameStore } from '@/store/game'

const RESOURCES = ['ore', 'lumber', 'provisions', 'gold', 'mana'] as const
type Resource = (typeof RESOURCES)[number]

const RESOURCE_LABELS: Record<Resource, string> = {
  ore: '⛏️ Ore',
  lumber: '🪵 Lumber',
  provisions: '🌾 Provisions',
  gold: '💰 Gold',
  mana: '🔮 Mana',
}

// Simplified exchange rates (Crown Market)
const EXCHANGE_RATES: Record<string, number> = {
  'ore->provisions': 1.5,
  'ore->gold': 0.25,
  'ore->lumber': 1.2,
  'ore->mana': 0.2,
  'lumber->ore': 0.8,
  'lumber->provisions': 1.2,
  'lumber->gold': 0.25,
  'lumber->mana': 0.2,
  'provisions->ore': 0.667,
  'provisions->gold': 0.2,
  'provisions->lumber': 0.8,
  'provisions->mana': 0.15,
  'gold->ore': 4.0,
  'gold->provisions': 5.0,
  'gold->lumber': 4.0,
  'gold->mana': 0.5,
  'mana->ore': 5.0,
  'mana->provisions': 7.0,
  'mana->lumber': 5.0,
  'mana->gold': 2.0,
}

// Risk estimates based on distance / season
const BASE_RISK = 5

export default function TradePanel() {
  const executeTrade = useGameStore((s) => s.executeTrade)
  const resources = useGameStore((s) => s.resources)

  const [sendResource, setSendResource] = useState<Resource>('ore')
  const [receiveResource, setReceiveResource] = useState<Resource>('gold')
  const [amount, setAmount] = useState<number>(100)
  const [sending, setSending] = useState(false)

  const rateKey = `${sendResource}->${receiveResource}`
  const rate = EXCHANGE_RATES[rateKey] ?? 0
  const receiveAmount = Math.floor(amount * rate)
  const risk = BASE_RISK + Math.floor(amount / 500) * 2

  const canTrade =
    sendResource !== receiveResource &&
    amount > 0 &&
    rate > 0 &&
    resources &&
    resources[sendResource] >= amount

  const handleTrade = async () => {
    if (!canTrade) return
    setSending(true)
    try {
      await executeTrade({
        type: 'CROWN_MARKET',
        resourceSend: sendResource,
        amountSend: amount,
        resourceReceive: receiveResource,
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Crown Market Form */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <h3 className="text-white text-sm font-semibold mb-3">Crown Market</h3>

        {/* Send */}
        <div className="mb-3">
          <label className="text-gray-400 text-xs block mb-1">Send</label>
          <div className="flex gap-2">
            <select
              value={sendResource}
              onChange={(e) => setSendResource(e.target.value as Resource)}
              className="bg-gray-700 text-white text-xs rounded px-2 py-1.5 flex-1"
            >
              {RESOURCES.map((r) => (
                <option key={r} value={r}>
                  {RESOURCE_LABELS[r]}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
              className="bg-gray-700 text-white text-xs rounded px-2 py-1.5 w-24 text-right"
              min={0}
              step={50}
            />
          </div>
          {resources && (
            <p className="text-gray-600 text-[10px] mt-1">
              Available: {Math.floor(resources[sendResource])}
            </p>
          )}
        </div>

        {/* Receive */}
        <div className="mb-3">
          <label className="text-gray-400 text-xs block mb-1">Receive</label>
          <div className="flex gap-2 items-center">
            <select
              value={receiveResource}
              onChange={(e) => setReceiveResource(e.target.value as Resource)}
              className="bg-gray-700 text-white text-xs rounded px-2 py-1.5 flex-1"
            >
              {RESOURCES.filter((r) => r !== sendResource).map((r) => (
                <option key={r} value={r}>
                  {RESOURCE_LABELS[r]}
                </option>
              ))}
            </select>
            <span className="text-amber-300 text-xs font-mono w-24 text-right">
              ~{receiveAmount}
            </span>
          </div>
        </div>

        {/* Rate and Risk */}
        <div className="flex justify-between text-xs text-gray-500 mb-3">
          <span>Rate: 1 : {rate.toFixed(2)}</span>
          <span className={risk > 15 ? 'text-red-400' : ''}>
            Risk: {risk}%
          </span>
        </div>

        {sendResource === receiveResource && (
          <p className="text-red-400 text-xs mb-2">Cannot trade same resource.</p>
        )}

        <button
          onClick={handleTrade}
          disabled={!canTrade || sending}
          className={`w-full text-xs font-semibold py-2 px-3 rounded transition-colors ${
            canTrade && !sending
              ? 'bg-amber-700 hover:bg-amber-600 text-white'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          {sending ? 'Sending...' : 'Send Trade Caravan'}
        </button>
      </div>
    </div>
  )
}
