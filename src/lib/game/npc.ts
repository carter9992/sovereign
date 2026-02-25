// =============================================================================
// SOVEREIGN - NPC Defender Generation & Scout Estimates
// =============================================================================

import type { ArmyForCombat } from './combat'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ScoutEstimate {
  factionName: string
  estimatedTroops: { unitType: string; quantity: number }[]
  hasDefenses: boolean
  resourceEstimate: { ore: number; provisions: number; gold: number; lumber: number }
}

// -----------------------------------------------------------------------------
// NPC Defender Generation
// -----------------------------------------------------------------------------

/**
 * Generate NPC defenders for a tile based on its faction's strength.
 * Hideouts get a 1.5x multiplier and WALLS defense structure.
 */
export function generateNPCDefenders(
  faction: { strength: number; aggressionLevel: number },
  isHideout: boolean
): ArmyForCombat {
  const mult = isHideout ? 1.5 : 1.0
  const s = faction.strength

  const units: { unitType: string; quantity: number }[] = [
    { unitType: 'INFANTRY', quantity: Math.round(s * 5 * mult) },
    { unitType: 'ARCHER', quantity: Math.round(s * 2 * mult) },
  ]

  if (s >= 5) {
    units.push({
      unitType: 'HEAVY_INFANTRY',
      quantity: Math.round(s * 1 * mult),
    })
  }

  const defenseStructures: { type: string; level: number }[] = []
  if (isHideout) {
    defenseStructures.push({ type: 'WALLS', level: Math.min(s, 3) })
  }

  return {
    units,
    provisions: s * 200 * mult,
    isDefending: true,
    defenseStructures: defenseStructures.length > 0 ? defenseStructures : undefined,
  }
}

// -----------------------------------------------------------------------------
// Scout Estimate (fuzzed troop counts)
// -----------------------------------------------------------------------------

/**
 * Generate a scout report with fuzzed troop counts (+/-20%).
 */
export function generateScoutEstimate(
  faction: { name: string; strength: number; aggressionLevel: number },
  isHideout: boolean
): ScoutEstimate {
  const defenders = generateNPCDefenders(faction, isHideout)

  const estimatedTroops = defenders.units.map((u) => {
    const fuzz = 0.8 + Math.random() * 0.4 // 0.8 to 1.2
    return {
      unitType: u.unitType,
      quantity: Math.round(u.quantity * fuzz),
    }
  })

  const s = faction.strength
  const resFuzz = () => 0.8 + Math.random() * 0.4

  return {
    factionName: faction.name,
    estimatedTroops,
    hasDefenses: isHideout,
    resourceEstimate: {
      ore: Math.round(s * 100 * resFuzz()),
      provisions: Math.round(s * 150 * resFuzz()),
      gold: Math.round(s * 50 * resFuzz()),
      lumber: Math.round(s * 80 * resFuzz()),
    },
  }
}
