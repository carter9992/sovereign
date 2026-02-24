'use client'

import { useEffect, useState } from 'react'
import { useGameStore } from '@/store/game'

// ---------------------------------------------------------------------------
// Terrain and region colors
// ---------------------------------------------------------------------------

const TERRAIN_COLORS: Record<string, string> = {
  PLAINS: 'bg-green-900/60',
  FOREST: 'bg-emerald-900/70',
  MOUNTAINS: 'bg-gray-700/70',
  COAST: 'bg-cyan-900/60',
  RIVER: 'bg-blue-900/60',
  OCEAN: 'bg-blue-950/80',
}

const TERRAIN_LABELS: Record<string, string> = {
  PLAINS: 'Plains',
  FOREST: 'Forest',
  MOUNTAINS: 'Mountains',
  COAST: 'Coast',
  RIVER: 'River',
  OCEAN: 'Ocean',
}

const INTEL_EVENT_TYPES = ['SCOUT_REPORT', 'SCOUT_LOST', 'BATTLE_WON', 'BATTLE_LOST', 'SETTLEMENT_ATTACKED', 'SETTLEMENT_DEFENDED']

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MapPage() {
  const {
    fetchState,
    fetchMap,
    marchArmy,
    scoutTile,
    mapTiles,
    armies,
    player,
    settlements,
    events,
  } = useGameStore()

  const [selectedTile, setSelectedTile] = useState<any>(null)
  const [marchArmyId, setMarchArmyId] = useState<string>('')
  const [expandedReport, setExpandedReport] = useState<string | null>(null)
  const [scouting, setScouting] = useState(false)

  useEffect(() => {
    fetchState()
    fetchMap()
  }, [fetchState, fetchMap])

  // Build a 5x5 grid from tiles. Tiles have x,y coordinates.
  // Find bounds from available tiles, or default to 0-4.
  const minX = mapTiles.length > 0 ? Math.min(...mapTiles.map((t: any) => t.x)) : 0
  const minY = mapTiles.length > 0 ? Math.min(...mapTiles.map((t: any) => t.y)) : 0

  // We display a 5x5 window. If the player has a settlement, center on it.
  const playerTile = mapTiles.find((t: any) => t.ownerId === player?.id && t.hasSettlement)
  const centerX = playerTile?.x ?? minX + 2
  const centerY = playerTile?.y ?? minY + 2

  const gridStartX = centerX - 2
  const gridStartY = centerY - 2

  const grid: (any | null)[][] = []
  for (let row = 0; row < 5; row++) {
    grid[row] = []
    for (let col = 0; col < 5; col++) {
      const x = gridStartX + col
      const y = gridStartY + row
      const tile = mapTiles.find((t: any) => t.x === x && t.y === y)
      grid[row][col] = tile ?? null
    }
  }

  const idleArmies = armies.filter((a: any) => a.status === 'IDLE')

  // Count available scouts across all settlements
  const totalScouts = settlements.reduce((sum: number, s: any) => {
    const scoutUnit = s.settlementUnits?.find((u: any) => u.unitType === 'SCOUT')
    return sum + (scoutUnit?.quantity ?? 0)
  }, 0)

  // Get primary settlement for scouting
  const primarySettlement = settlements[0]

  const isNPCTile = !!selectedTile?.npcFactionId
  const isEnemyPlayerTile = selectedTile?.ownerId && selectedTile.ownerId !== player?.id && selectedTile.hasSettlement
  const isProtected = isEnemyPlayerTile && selectedTile?.protectedUntil && new Date(selectedTile.protectedUntil) > new Date()

  // Intelligence reports from events
  const intelReports = events.filter((e: any) => INTEL_EVENT_TYPES.includes(e.type))

  const handleMarchToTile = async () => {
    if (!marchArmyId || !selectedTile) return
    await marchArmy(marchArmyId, selectedTile.id)
    setMarchArmyId('')
  }

  const handleScoutTile = async () => {
    if (!selectedTile || !primarySettlement || scouting) return
    setScouting(true)
    try {
      await scoutTile(selectedTile.id, primarySettlement.id)
    } finally {
      setScouting(false)
    }
  }

  const parseEventData = (e: any) => {
    try {
      return JSON.parse(e.data)
    } catch {
      return {}
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-amber-400">World Map</h1>

      {/* 5x5 grid */}
      {mapTiles.length > 0 ? (
        <div className="bg-[#1e2538] rounded-lg p-3 border border-[#2a3248]">
          <div className="grid grid-cols-5 gap-1">
            {grid.map((row, rowIdx) =>
              row.map((tile, colIdx) => {
                if (!tile) {
                  return (
                    <div
                      key={`${rowIdx}-${colIdx}`}
                      className="aspect-square bg-gray-900/50 rounded border border-gray-800/30"
                    />
                  )
                }

                const isOwned = tile.ownerId === player?.id
                const isEnemy = tile.ownerId && tile.ownerId !== player?.id
                const isSelected = selectedTile?.id === tile.id
                const hasSettlement = tile.hasSettlement
                const isNPC = !!tile.npcFactionId
                const isHideout = tile.isHideout
                const hasMana = tile.hasManaNode
                const tileProtected = tile.protectedUntil && new Date(tile.protectedUntil) > new Date()
                const terrainColor = TERRAIN_COLORS[tile.terrain] ?? 'bg-gray-800'

                return (
                  <button
                    key={tile.id}
                    onClick={() => setSelectedTile(tile)}
                    className={`aspect-square rounded border-2 transition-all flex flex-col items-center justify-center text-xs relative ${terrainColor} ${
                      isSelected
                        ? 'border-amber-400 ring-1 ring-amber-400/30'
                        : isOwned
                        ? 'border-blue-500/60'
                        : isEnemy
                        ? 'border-purple-500/60'
                        : isNPC
                        ? 'border-red-500/40'
                        : 'border-gray-700/40'
                    }`}
                  >
                    {/* Settlement indicator */}
                    {hasSettlement && isOwned && (
                      <span className="text-[10px]">🏰</span>
                    )}
                    {hasSettlement && !isOwned && (
                      <span className="text-[10px]">🏘️</span>
                    )}

                    {/* Protection shield indicator */}
                    {tileProtected && hasSettlement && (
                      <span className="text-[10px] absolute top-0 right-0.5">🛡️</span>
                    )}

                    {/* NPC/hideout indicator */}
                    {isHideout && <span className="text-[10px]">💀</span>}

                    {/* Mana node indicator */}
                    {hasMana && <span className="text-[10px]">✨</span>}

                    {/* Coordinates */}
                    <span className="text-[8px] text-gray-500 absolute bottom-0 right-0.5">
                      {tile.x},{tile.y}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      ) : (
        <div className="bg-[#1e2538] rounded-lg p-8 border border-[#2a3248] text-center">
          <p className="text-gray-500 text-sm">Loading map data...</p>
        </div>
      )}

      {/* Legend */}
      <div className="bg-[#1e2538] rounded-lg p-3 border border-[#2a3248]">
        <h3 className="text-xs font-bold text-gray-400 mb-2">Legend</h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded border-2 border-blue-500/60 bg-gray-800" />
            <span className="text-gray-400">Your territory</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded border-2 border-red-500/40 bg-gray-800" />
            <span className="text-gray-400">NPC faction</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px]">🏰</span>
            <span className="text-gray-400">Your settlement</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px]">💀</span>
            <span className="text-gray-400">Hideout</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px]">✨</span>
            <span className="text-gray-400">Mana node</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px]">🛡️</span>
            <span className="text-gray-400">Protected</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded border-2 border-purple-500/60 bg-gray-800" />
            <span className="text-gray-400">Enemy player</span>
          </div>
          {Object.entries(TERRAIN_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded ${TERRAIN_COLORS[key]}`} />
              <span className="text-gray-400">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Selected tile info */}
      {selectedTile && (
        <div className="bg-[#1e2538] rounded-lg p-4 border border-amber-600/30">
          <h3 className="text-sm font-bold text-white mb-2">
            Tile ({selectedTile.x}, {selectedTile.y})
          </h3>
          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Region</span>
              <span className="text-gray-200">{selectedTile.region}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Terrain</span>
              <span className="text-gray-200">
                {TERRAIN_LABELS[selectedTile.terrain] ?? selectedTile.terrain}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Owner</span>
              <span className="text-gray-200">
                {selectedTile.ownerId === player?.id
                  ? 'You'
                  : selectedTile.ownerId
                  ? 'Another Player'
                  : 'Unclaimed'}
              </span>
            </div>
            {selectedTile.npcFactionId && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400">NPC Faction</span>
                <span className="text-red-400">Hostile</span>
              </div>
            )}
            {selectedTile.hasSettlement && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Settlement</span>
                <span className="text-blue-400">Yes</span>
              </div>
            )}
            {selectedTile.hasManaNode && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Mana Node</span>
                <span className="text-purple-400">Yes</span>
              </div>
            )}
            {selectedTile.isHideout && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Hideout</span>
                <span className="text-red-400">Yes</span>
              </div>
            )}
            {isProtected && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Protection</span>
                <span className="text-cyan-400">
                  Until {new Date(selectedTile.protectedUntil).toLocaleTimeString()}
                </span>
              </div>
            )}
          </div>

          {/* Actions */}
          {selectedTile.ownerId !== player?.id && selectedTile.terrain !== 'OCEAN' && (
            <div className="mt-3 space-y-2">
              {/* March / Deploy / Attack army here */}
              {isProtected && (
                <div className="bg-cyan-900/30 border border-cyan-700/40 rounded p-2 text-center">
                  <span className="text-cyan-400 text-xs font-medium">Protected — cannot attack</span>
                </div>
              )}
              {idleArmies.length > 0 && !isProtected && (
                <div>
                  <label className="text-xs text-gray-400 block mb-1">
                    {isEnemyPlayerTile ? 'Deploy army to attack settlement' : isNPCTile ? 'Deploy army to attack' : 'March army here'}
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      value={marchArmyId}
                      onChange={(e) => setMarchArmyId(e.target.value)}
                      className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-amber-500"
                    >
                      <option value="">Select army...</option>
                      {idleArmies.map((a: any) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleMarchToTile}
                      disabled={!marchArmyId}
                      className={`${
                        isEnemyPlayerTile
                          ? 'bg-purple-600 hover:bg-purple-500'
                          : isNPCTile
                          ? 'bg-red-600 hover:bg-red-500'
                          : 'bg-amber-600 hover:bg-amber-500'
                      } disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded px-3 py-1.5 transition-colors`}
                    >
                      {isEnemyPlayerTile ? 'Attack Settlement' : isNPCTile ? 'Deploy (Attack)' : 'March'}
                    </button>
                  </div>
                </div>
              )}

              {/* Scout button */}
              <button
                onClick={handleScoutTile}
                disabled={totalScouts < 1 || scouting || !primarySettlement}
                className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-300 text-sm font-medium rounded px-4 py-2 transition-colors"
              >
                {scouting
                  ? 'Dispatching scout...'
                  : `Scout this tile (${totalScouts} available)`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Intelligence Reports */}
      {intelReports.length > 0 && (
        <div className="bg-[#1e2538] rounded-lg p-4 border border-[#2a3248]">
          <h3 className="text-sm font-bold text-amber-400 mb-3">Intelligence Reports</h3>
          <div className="space-y-2">
            {intelReports.map((event: any) => {
              const data = parseEventData(event)
              const isExpanded = expandedReport === event.id
              const typeColors: Record<string, string> = {
                SCOUT_REPORT: 'text-cyan-400 border-cyan-800/40',
                SCOUT_LOST: 'text-red-400 border-red-800/40',
                BATTLE_WON: 'text-green-400 border-green-800/40',
                BATTLE_LOST: 'text-red-400 border-red-800/40',
                SETTLEMENT_ATTACKED: 'text-red-400 border-red-800/40',
                SETTLEMENT_DEFENDED: 'text-green-400 border-green-800/40',
              }
              const typeLabels: Record<string, string> = {
                SCOUT_REPORT: 'Scout Report',
                SCOUT_LOST: 'Scout Lost',
                BATTLE_WON: 'Victory',
                BATTLE_LOST: 'Defeat',
                SETTLEMENT_ATTACKED: 'Settlement Attacked',
                SETTLEMENT_DEFENDED: 'Settlement Defended',
              }

              return (
                <button
                  key={event.id}
                  onClick={() =>
                    setExpandedReport(isExpanded ? null : event.id)
                  }
                  className={`w-full text-left bg-gray-800/50 rounded border ${
                    typeColors[event.type] ?? 'text-gray-400 border-gray-700/40'
                  } p-2 transition-colors hover:bg-gray-800/80`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">
                      {typeLabels[event.type] ?? event.type}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {data.tileX != null ? `(${data.tileX}, ${data.tileY})` : ''}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{event.message}</p>

                  {isExpanded && (
                    <div className="mt-2 pt-2 border-t border-gray-700/50 text-xs space-y-1">
                      {/* Scout Report details */}
                      {event.type === 'SCOUT_REPORT' && data.estimatedTroops && (
                        <>
                          <p className="text-gray-300">
                            Faction: <span className="text-amber-400">{data.factionName ?? 'Unknown'}</span>
                          </p>
                          {data.estimatedTroops.length > 0 ? (
                            <div>
                              <p className="text-gray-400 mb-1">Estimated troops:</p>
                              {data.estimatedTroops.map((t: any, i: number) => (
                                <p key={i} className="text-gray-300 pl-2">
                                  {t.unitType}: ~{t.quantity}
                                </p>
                              ))}
                            </div>
                          ) : (
                            <p className="text-gray-400">No troops detected</p>
                          )}
                          {data.hasDefenses && (
                            <p className="text-yellow-400">Defensive structures detected</p>
                          )}
                          {data.resourceEstimate && (
                            <p className="text-gray-400">
                              Resources: ~{data.resourceEstimate.ore} ore, ~{data.resourceEstimate.provisions} provisions, ~{data.resourceEstimate.gold} gold
                            </p>
                          )}
                        </>
                      )}

                      {/* Battle Won details */}
                      {event.type === 'BATTLE_WON' && (
                        <>
                          <p className="text-gray-300">
                            Against: <span className="text-red-400">
                              {data.isPvP ? 'Enemy Player Settlement' : (data.factionName ?? 'Unknown')}
                            </span>
                          </p>
                          {data.attackerLosses?.length > 0 && (
                            <div>
                              <p className="text-gray-400 mb-1">Your losses:</p>
                              {data.attackerLosses.map((l: any, i: number) => (
                                <p key={i} className="text-red-300 pl-2">
                                  {l.unitType}: -{l.lost}
                                </p>
                              ))}
                            </div>
                          )}
                          {data.isPvP && data.defensesDestroyed > 0 && (
                            <p className="text-yellow-400">
                              {data.defensesDestroyed} defense structure{data.defensesDestroyed > 1 ? 's' : ''} destroyed
                            </p>
                          )}
                          {data.loot && (
                            <p className="text-green-300">
                              Loot: {data.loot.ore > 0 ? `${data.loot.ore} ore ` : ''}
                              {data.loot.provisions > 0 ? `${data.loot.provisions} provisions ` : ''}
                              {data.loot.gold > 0 ? `${data.loot.gold} gold` : ''}
                              {data.loot.ore === 0 && data.loot.provisions === 0 && data.loot.gold === 0 ? 'None (no caravans)' : ''}
                            </p>
                          )}
                        </>
                      )}

                      {/* Battle Lost details */}
                      {event.type === 'BATTLE_LOST' && (
                        <>
                          <p className="text-gray-300">
                            Against: <span className="text-red-400">{data.factionName ?? 'Unknown'}</span>
                          </p>
                          {data.attackerLosses?.length > 0 && (
                            <div>
                              <p className="text-gray-400 mb-1">Your losses:</p>
                              {data.attackerLosses.map((l: any, i: number) => (
                                <p key={i} className="text-red-300 pl-2">
                                  {l.unitType}: -{l.lost}
                                </p>
                              ))}
                            </div>
                          )}
                          <p className="text-red-400">Army destroyed</p>
                        </>
                      )}

                      {/* Scout Lost - no extra details needed */}
                      {event.type === 'SCOUT_LOST' && (
                        <p className="text-red-300">Scout was intercepted by hostile forces.</p>
                      )}

                      {/* Settlement Attacked (defender view) */}
                      {event.type === 'SETTLEMENT_ATTACKED' && (
                        <>
                          {data.defenderLosses?.length > 0 && (
                            <div>
                              <p className="text-gray-400 mb-1">Garrison losses:</p>
                              {data.defenderLosses.map((l: any, i: number) => (
                                <p key={i} className="text-red-300 pl-2">
                                  {l.unitType}: -{l.lost}
                                </p>
                              ))}
                            </div>
                          )}
                          {data.defensesDestroyed > 0 && (
                            <p className="text-yellow-400">
                              {data.defensesDestroyed} defense structure{data.defensesDestroyed > 1 ? 's' : ''} destroyed
                            </p>
                          )}
                          {data.lootStolen && (
                            <p className="text-red-300">
                              Stolen: {data.lootStolen.ore > 0 ? `${data.lootStolen.ore} ore ` : ''}
                              {data.lootStolen.provisions > 0 ? `${data.lootStolen.provisions} provisions ` : ''}
                              {data.lootStolen.gold > 0 ? `${data.lootStolen.gold} gold` : ''}
                            </p>
                          )}
                          {data.protectedUntil && (
                            <p className="text-cyan-400">
                              Protection active until {new Date(data.protectedUntil).toLocaleTimeString()}
                            </p>
                          )}
                        </>
                      )}

                      {/* Settlement Defended (defender view — victory) */}
                      {event.type === 'SETTLEMENT_DEFENDED' && (
                        <>
                          {data.defenderLosses?.length > 0 && (
                            <div>
                              <p className="text-gray-400 mb-1">Garrison losses:</p>
                              {data.defenderLosses.map((l: any, i: number) => (
                                <p key={i} className="text-red-300 pl-2">
                                  {l.unitType}: -{l.lost}
                                </p>
                              ))}
                            </div>
                          )}
                          <p className="text-green-400">Enemy army destroyed!</p>
                        </>
                      )}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
