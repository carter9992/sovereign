// =============================================================================
// SOVEREIGN - Phased Combat Resolution
// =============================================================================

import {
  UNIT_STATS,
  COMBAT_TRIANGLE,
  WALL_HP_PER_LEVEL,
  GUARD_TOWER_DAMAGE_PER_LEVEL,
  CAVALRY_CHARGE_MULTIPLIER,
} from './constants'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ArmyForCombat {
  units: { unitType: string; quantity: number }[]
  provisions: number
  isDefending: boolean
  defenseStructures?: { type: string; level: number }[]
  manaReserve?: number
}

export interface CombatResult {
  attackerWins: boolean
  attackerLosses: { unitType: string; lost: number }[]
  defenderLosses: { unitType: string; lost: number }[]
  loot: { ore: number; provisions: number; gold: number }
  phases: {
    ranged: {
      attackerCasualties: { unitType: string; lost: number }[]
      defenderCasualties: { unitType: string; lost: number }[]
      guardTowerDamage: number
    }
    melee: {
      attackerCasualties: { unitType: string; lost: number }[]
      defenderCasualties: { unitType: string; lost: number }[]
      wallDamageAbsorbed: number
    }
  }
}

// Internal mutable tracker for units surviving through combat phases
type UnitTracker = { unitType: string; quantity: number; lost: number }

// -----------------------------------------------------------------------------
// Unit Classification
// -----------------------------------------------------------------------------

/** Unit types that fire in the ranged phase */
const RANGED_TYPES = new Set(['ARCHER'])

/** Unit types that deal damage in the melee phase */
const MELEE_TYPES = new Set([
  'INFANTRY',
  'HEAVY_INFANTRY',
  'CAVALRY',
  'WARDEN',
  'SCOUT',
])

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function getStats(unitType: string) {
  return UNIT_STATS[unitType as keyof typeof UNIT_STATS]
}

/**
 * Mana reserve bonus: +1% per 100 mana, capped at 25%.
 */
function getManaDefenseMultiplier(manaReserve: number): number {
  const bonusPercent = Math.min(Math.floor(manaReserve / 100), 25)
  return 1 + bonusPercent / 100
}

function hasCaravans(
  units: { unitType: string; quantity: number }[]
): boolean {
  return units.some((u) => u.unitType === 'CARAVAN' && u.quantity > 0)
}

function getCarryCapacity(
  units: { unitType: string; quantity: number }[]
): number {
  let capacity = 0
  for (const u of units) {
    const stats = getStats(u.unitType)
    if (stats && stats.carryCapacity > 0) {
      capacity += stats.carryCapacity * u.quantity
    }
  }
  return capacity
}

// -----------------------------------------------------------------------------
// Damage Application Helpers
// -----------------------------------------------------------------------------

/**
 * Apply ranged damage proportionally across target units, weighted by HP pool.
 * Combat triangle (ARCHER vs target type) is applied per target.
 */
function applyRangedProportional(
  rawDamage: number,
  targets: UnitTracker[]
): void {
  const totalHp = targets.reduce((sum, u) => {
    const s = getStats(u.unitType)
    return sum + (s?.defense ?? 1) * u.quantity
  }, 0)
  if (totalHp <= 0) return

  for (const t of targets) {
    if (t.quantity <= 0) continue
    const s = getStats(t.unitType)
    if (!s) continue

    const share = (t.quantity * s.defense) / totalHp
    const triangle = COMBAT_TRIANGLE['ARCHER']?.[t.unitType] ?? 1.0
    const damage = rawDamage * share * triangle
    const killed = Math.min(Math.floor(damage / s.defense), t.quantity)

    t.quantity -= killed
    t.lost += killed
  }
}

/**
 * Apply ranged damage in speed order — slowest units die first.
 * Slow-moving units are easier to hit with ranged fire and absorb arrows
 * first. Fast cavalry ride through the volley and are targeted last.
 * Tracks a raw damage pool; the ARCHER combat triangle is applied per target
 * and the pool is consumed by the raw equivalent (damage / triangle).
 */
function applyRangedSpeedOrder(
  totalDamage: number,
  targets: UnitTracker[]
): void {
  const sorted = targets
    .filter((u) => u.quantity > 0)
    .sort((a, b) => {
      const sa = getStats(a.unitType)?.speed ?? 0
      const sb = getStats(b.unitType)?.speed ?? 0
      return sa - sb
    })

  let remaining = totalDamage

  for (const unit of sorted) {
    if (remaining <= 0) break
    const s = getStats(unit.unitType)
    if (!s || unit.quantity <= 0) continue

    const triangle = COMBAT_TRIANGLE['ARCHER']?.[unit.unitType] ?? 1.0
    const hpPool = unit.quantity * s.defense
    const effectiveDamage = remaining * triangle

    if (effectiveDamage >= hpPool) {
      // Wipe this unit type, consume raw equivalent
      unit.lost += unit.quantity
      unit.quantity = 0
      remaining -= hpPool / triangle
    } else {
      const killed = Math.floor(effectiveDamage / s.defense)
      unit.lost += killed
      unit.quantity -= killed
      remaining = 0
    }
  }
}

/**
 * Apply melee damage proportionally across target units, with a weighted-
 * average combat triangle derived from the attacking composition.
 *
 * @param totalDamage  Total damage to distribute (may include mana bonus)
 * @param attackers    Snapshot of melee attackers (for triangle weighting)
 * @param targets      Live target trackers to apply kills to
 */
function applyMeleeProportional(
  totalDamage: number,
  attackers: UnitTracker[],
  targets: UnitTracker[]
): void {
  const totalRaw = attackers.reduce((sum, u) => {
    const s = getStats(u.unitType)
    return sum + (s?.attack ?? 0) * u.quantity
  }, 0)

  const totalTargetHp = targets.reduce((sum, u) => {
    const s = getStats(u.unitType)
    return sum + (s?.defense ?? 1) * u.quantity
  }, 0)

  if (totalTargetHp <= 0 || totalRaw <= 0) return

  for (const t of targets) {
    if (t.quantity <= 0) continue
    const tStats = getStats(t.unitType)
    if (!tStats) continue

    const share = (t.quantity * tStats.defense) / totalTargetHp

    // Weighted average combat triangle from all melee attackers vs this target
    let weightedDamage = 0
    for (const a of attackers) {
      const aStats = getStats(a.unitType)
      if (!aStats) continue
      const tri = COMBAT_TRIANGLE[a.unitType]?.[t.unitType] ?? 1.0
      weightedDamage += aStats.attack * a.quantity * tri
    }
    const avgTriangle = weightedDamage / totalRaw

    const damage = totalDamage * share * avgTriangle
    const killed = Math.min(Math.floor(damage / tStats.defense), t.quantity)

    t.quantity -= killed
    t.lost += killed
  }
}

// -----------------------------------------------------------------------------
// Main Combat Resolution
// -----------------------------------------------------------------------------

/** Safety cap to prevent infinite loops (e.g. rounding prevents kills). */
const MAX_ROUNDS = 50

export function resolveCombat(
  attacker: ArmyForCombat,
  defender: ArmyForCombat
): CombatResult {
  // Create mutable trackers for each unit group
  const atkUnits: UnitTracker[] = attacker.units
    .filter((u) => u.quantity > 0)
    .map((u) => ({ unitType: u.unitType, quantity: u.quantity, lost: 0 }))

  const defUnits: UnitTracker[] = defender.units
    .filter((u) => u.quantity > 0)
    .map((u) => ({ unitType: u.unitType, quantity: u.quantity, lost: 0 }))

  // Extract defense structure levels
  let wallLevel = 0
  let guardTowerLevel = 0
  if (defender.isDefending && defender.defenseStructures) {
    for (const s of defender.defenseStructures) {
      if (s.type === 'WALLS') wallLevel = s.level
      if (s.type === 'GUARD_TOWER') guardTowerLevel = s.level
    }
  }

  const guardTowerDmg = GUARD_TOWER_DAMAGE_PER_LEVEL * guardTowerLevel

  // Wall HP is a depletable pool across rounds
  let wallHpRemaining = WALL_HP_PER_LEVEL * wallLevel

  // Mana defense multiplier (computed once, applies every melee round)
  const manaMultiplier =
    defender.isDefending && defender.manaReserve
      ? getManaDefenseMultiplier(defender.manaReserve)
      : 1

  // Accumulators for phase-breakdown tracking
  let totalRangedAtkLost = new Map<string, number>()
  let totalRangedDefLost = new Map<string, number>()
  let totalWallDamageAbsorbed = 0

  // =================================================================
  // COMBAT LOOP — Ranged volley + Melee each round, until one side
  // is wiped out or MAX_ROUNDS is reached.
  // =================================================================

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const atkAlive = atkUnits.some((u) => u.quantity > 0)
    const defAlive = defUnits.some((u) => u.quantity > 0)
    if (!atkAlive || !defAlive) break

    const totalLostBefore = sumLost(atkUnits) + sumLost(defUnits)

    // ---------------------------------------------------------------
    // RANGED VOLLEY (simultaneous)
    // Both sides' surviving archers fire. Guard tower fires every
    // round. Ranged bypasses walls.
    // ---------------------------------------------------------------

    const lostBeforeRanged = snapshotLost(atkUnits, defUnits)

    const atkArcherRaw = atkUnits
      .filter((u) => RANGED_TYPES.has(u.unitType) && u.quantity > 0)
      .reduce((sum, u) => {
        const s = getStats(u.unitType)
        return sum + (s?.attack ?? 0) * u.quantity
      }, 0)

    const defArcherRaw = defUnits
      .filter((u) => RANGED_TYPES.has(u.unitType) && u.quantity > 0)
      .reduce((sum, u) => {
        const s = getStats(u.unitType)
        return sum + (s?.attack ?? 0) * u.quantity
      }, 0)

    const totalDefRanged = defArcherRaw + guardTowerDmg

    if (atkArcherRaw > 0) {
      applyRangedProportional(atkArcherRaw, defUnits)
    }
    if (totalDefRanged > 0) {
      applyRangedSpeedOrder(totalDefRanged, atkUnits)
    }

    // Accumulate ranged-phase losses
    accumulateDelta(atkUnits, lostBeforeRanged.atk, totalRangedAtkLost)
    accumulateDelta(defUnits, lostBeforeRanged.def, totalRangedDefLost)

    // Check for wipe after ranged
    if (!atkUnits.some((u) => u.quantity > 0) || !defUnits.some((u) => u.quantity > 0)) break

    // ---------------------------------------------------------------
    // MELEE (simultaneous)
    // Surviving melee units fight. Archers do NOT deal melee damage
    // but CAN be killed. Attacker melee hits remaining wall HP first,
    // overflow damages defender units.
    // ---------------------------------------------------------------

    const atkMelee = atkUnits.filter(
      (u) => MELEE_TYPES.has(u.unitType) && u.quantity > 0
    )
    const totalAtkMeleeRaw = atkMelee.reduce((sum, u) => {
      const s = getStats(u.unitType)
      let atk = (s?.attack ?? 0) * u.quantity
      if (round === 0 && u.unitType === 'CAVALRY') atk *= CAVALRY_CHARGE_MULTIPLIER
      return sum + atk
    }, 0)

    const defMelee = defUnits.filter(
      (u) => MELEE_TYPES.has(u.unitType) && u.quantity > 0
    )
    let totalDefMeleeRaw = defMelee.reduce((sum, u) => {
      const s = getStats(u.unitType)
      return sum + (s?.attack ?? 0) * u.quantity
    }, 0)

    totalDefMeleeRaw *= manaMultiplier

    // Snapshot melee compositions before casualties (simultaneous)
    const atkMeleeSnap = atkMelee.map((u) => ({ ...u }))
    const defMeleeSnap = defMelee.map((u) => ({ ...u }))

    // Attacker melee → wall HP pool → overflow to units
    const wallAbsorbed = Math.min(totalAtkMeleeRaw, wallHpRemaining)
    wallHpRemaining -= wallAbsorbed
    totalWallDamageAbsorbed += wallAbsorbed
    const dmgAfterWall = totalAtkMeleeRaw - wallAbsorbed

    if (dmgAfterWall > 0) {
      applyMeleeProportional(dmgAfterWall, atkMeleeSnap, defUnits)
    }

    if (totalDefMeleeRaw > 0) {
      applyMeleeProportional(totalDefMeleeRaw, defMeleeSnap, atkUnits)
    }

    // If no kills happened this entire round, break to avoid infinite loop
    const totalLostAfter = sumLost(atkUnits) + sumLost(defUnits)
    if (totalLostAfter === totalLostBefore) break
  }

  // =================================================================
  // DETERMINE WINNER & LOOT
  // =================================================================

  const anyDefSurvivors = defUnits.some((u) => u.quantity > 0)
  const anyAtkSurvivors = atkUnits.some((u) => u.quantity > 0)

  let attackerWins: boolean
  if (!anyDefSurvivors) {
    attackerWins = true
  } else if (!anyAtkSurvivors) {
    attackerWins = false
  } else {
    // Both sides survived MAX_ROUNDS — compare remaining combat power
    const atkPower = atkUnits.reduce((sum, u) => {
      const s = getStats(u.unitType)
      return sum + (s?.attack ?? 0) * u.quantity
    }, 0)
    const defPower = defUnits.reduce((sum, u) => {
      const s = getStats(u.unitType)
      return sum + (s?.attack ?? 0) * u.quantity
    }, 0)
    attackerWins = atkPower > defPower
  }

  // Loot calculation (20% of provisions, capped by caravan capacity)
  let loot = { ore: 0, provisions: 0, gold: 0 }
  if (attackerWins && hasCaravans(attacker.units)) {
    const lootPool = defender.provisions * 0.2
    const capacity = getCarryCapacity(attacker.units)
    const actualLoot = Math.min(lootPool, capacity)

    loot = {
      ore: Math.floor(actualLoot * 0.4),
      provisions: Math.floor(actualLoot * 0.4),
      gold: Math.floor(actualLoot * 0.2),
    }
  }

  // Build phase breakdown from accumulated totals
  const atkRangedLosses = mapToLossArray(totalRangedAtkLost)
  const defRangedLosses = mapToLossArray(totalRangedDefLost)

  // Melee losses = total losses minus ranged losses
  const atkMeleeLosses = atkUnits
    .filter((u) => u.lost - (totalRangedAtkLost.get(u.unitType) ?? 0) > 0)
    .map((u) => ({
      unitType: u.unitType,
      lost: u.lost - (totalRangedAtkLost.get(u.unitType) ?? 0),
    }))
  const defMeleeLosses = defUnits
    .filter((u) => u.lost - (totalRangedDefLost.get(u.unitType) ?? 0) > 0)
    .map((u) => ({
      unitType: u.unitType,
      lost: u.lost - (totalRangedDefLost.get(u.unitType) ?? 0),
    }))

  return {
    attackerWins,
    attackerLosses: atkUnits
      .filter((u) => u.lost > 0)
      .map((u) => ({ unitType: u.unitType, lost: u.lost })),
    defenderLosses: defUnits
      .filter((u) => u.lost > 0)
      .map((u) => ({ unitType: u.unitType, lost: u.lost })),
    loot,
    phases: {
      ranged: {
        attackerCasualties: atkRangedLosses,
        defenderCasualties: defRangedLosses,
        guardTowerDamage: guardTowerDmg,
      },
      melee: {
        attackerCasualties: atkMeleeLosses,
        defenderCasualties: defMeleeLosses,
        wallDamageAbsorbed: totalWallDamageAbsorbed,
      },
    },
  }
}

// -----------------------------------------------------------------------------
// Combat Loop Helpers
// -----------------------------------------------------------------------------

function sumLost(units: UnitTracker[]): number {
  return units.reduce((sum, u) => sum + u.lost, 0)
}

function snapshotLost(
  atkUnits: UnitTracker[],
  defUnits: UnitTracker[]
): { atk: Map<string, number>; def: Map<string, number> } {
  return {
    atk: new Map(atkUnits.map((u) => [u.unitType, u.lost])),
    def: new Map(defUnits.map((u) => [u.unitType, u.lost])),
  }
}

function accumulateDelta(
  units: UnitTracker[],
  before: Map<string, number>,
  accumulator: Map<string, number>
): void {
  for (const u of units) {
    const delta = u.lost - (before.get(u.unitType) ?? 0)
    if (delta > 0) {
      accumulator.set(u.unitType, (accumulator.get(u.unitType) ?? 0) + delta)
    }
  }
}

function mapToLossArray(
  map: Map<string, number>
): { unitType: string; lost: number }[] {
  const result: { unitType: string; lost: number }[] = []
  for (const [unitType, lost] of map) {
    if (lost > 0) result.push({ unitType, lost })
  }
  return result
}
