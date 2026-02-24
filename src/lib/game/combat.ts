// =============================================================================
// SOVEREIGN - Phased Combat Resolution
// =============================================================================

import {
  UNIT_STATS,
  COMBAT_TRIANGLE,
  WALL_HP_PER_LEVEL,
  GUARD_TOWER_DAMAGE_PER_LEVEL,
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
 * Apply ranged damage in speed order — fastest attacker units die first.
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
      return sb - sa
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

  // ===================================================================
  // PHASE 1 — RANGED VOLLEY (simultaneous)
  // Both sides' archers fire at the same time. Defender guard towers
  // add flat damage to the defending ranged volley.
  // ===================================================================

  // Pre-compute ranged damage from both sides using pre-casualty quantities
  const atkArcherRaw = atkUnits
    .filter((u) => RANGED_TYPES.has(u.unitType))
    .reduce((sum, u) => {
      const s = getStats(u.unitType)
      return sum + (s?.attack ?? 0) * u.quantity
    }, 0)

  const defArcherRaw = defUnits
    .filter((u) => RANGED_TYPES.has(u.unitType))
    .reduce((sum, u) => {
      const s = getStats(u.unitType)
      return sum + (s?.attack ?? 0) * u.quantity
    }, 0)

  const guardTowerDmg = GUARD_TOWER_DAMAGE_PER_LEVEL * guardTowerLevel
  const totalDefRanged = defArcherRaw + guardTowerDmg

  // Attacking archers → defender units (proportional, bypass walls)
  if (atkArcherRaw > 0) {
    applyRangedProportional(atkArcherRaw, defUnits)
  }

  // Defending archers + guard towers → attacker units (speed order, fastest die first)
  if (totalDefRanged > 0) {
    applyRangedSpeedOrder(totalDefRanged, atkUnits)
  }

  // Snapshot losses after ranged phase
  const atkRangedLosses = atkUnits
    .filter((u) => u.lost > 0)
    .map((u) => ({ unitType: u.unitType, lost: u.lost }))
  const defRangedLosses = defUnits
    .filter((u) => u.lost > 0)
    .map((u) => ({ unitType: u.unitType, lost: u.lost }))
  const atkLostAfterRanged = new Map(atkUnits.map((u) => [u.unitType, u.lost]))
  const defLostAfterRanged = new Map(defUnits.map((u) => [u.unitType, u.lost]))

  // ===================================================================
  // PHASE 2 — MELEE (simultaneous)
  // Surviving melee units fight. Archers do NOT deal melee damage but
  // CAN be killed. Attacker melee hits walls first, overflow to units.
  // Mana reserve bonus applies to defender melee output.
  // ===================================================================

  // Compute melee damage from post-Phase-1 surviving melee units
  const atkMelee = atkUnits.filter(
    (u) => MELEE_TYPES.has(u.unitType) && u.quantity > 0
  )
  const totalAtkMeleeRaw = atkMelee.reduce((sum, u) => {
    const s = getStats(u.unitType)
    return sum + (s?.attack ?? 0) * u.quantity
  }, 0)

  const defMelee = defUnits.filter(
    (u) => MELEE_TYPES.has(u.unitType) && u.quantity > 0
  )
  let totalDefMeleeRaw = defMelee.reduce((sum, u) => {
    const s = getStats(u.unitType)
    return sum + (s?.attack ?? 0) * u.quantity
  }, 0)

  // Mana reserve bonus: boost defender melee damage
  if (defender.isDefending && defender.manaReserve) {
    totalDefMeleeRaw *= getManaDefenseMultiplier(defender.manaReserve)
  }

  // Snapshot melee compositions before casualties for triangle weighting
  // (melee is simultaneous — both sides use pre-melee-casualty compositions)
  const atkMeleeSnap = atkMelee.map((u) => ({ ...u }))
  const defMeleeSnap = defMelee.map((u) => ({ ...u }))

  // Attacker melee → wall HP → overflow to defender units
  const wallHp = WALL_HP_PER_LEVEL * wallLevel
  const dmgAfterWall = Math.max(0, totalAtkMeleeRaw - wallHp)

  if (dmgAfterWall > 0) {
    applyMeleeProportional(dmgAfterWall, atkMeleeSnap, defUnits)
  }

  // Defender melee → attacker units (proportional)
  if (totalDefMeleeRaw > 0) {
    applyMeleeProportional(totalDefMeleeRaw, defMeleeSnap, atkUnits)
  }

  // ===================================================================
  // PHASE 3 — DETERMINE WINNER & LOOT
  // Attacker wins if all defender units are dead. If both sides have
  // survivors, higher remaining attack power wins.
  // ===================================================================

  const anyDefSurvivors = defUnits.some((u) => u.quantity > 0)
  const anyAtkSurvivors = atkUnits.some((u) => u.quantity > 0)

  let attackerWins: boolean
  if (!anyDefSurvivors) {
    attackerWins = true
  } else if (!anyAtkSurvivors) {
    attackerWins = false
  } else {
    // Both sides have survivors — compare remaining combat power
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

  // Loot calculation (unchanged — 20% of provisions, capped by caravan capacity)
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

  // Compute melee-phase loss deltas
  const atkMeleeLosses = atkUnits
    .filter((u) => u.lost - (atkLostAfterRanged.get(u.unitType) ?? 0) > 0)
    .map((u) => ({
      unitType: u.unitType,
      lost: u.lost - (atkLostAfterRanged.get(u.unitType) ?? 0),
    }))
  const defMeleeLosses = defUnits
    .filter((u) => u.lost - (defLostAfterRanged.get(u.unitType) ?? 0) > 0)
    .map((u) => ({
      unitType: u.unitType,
      lost: u.lost - (defLostAfterRanged.get(u.unitType) ?? 0),
    }))

  const wallDamageAbsorbed = Math.min(totalAtkMeleeRaw, wallHp)

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
        wallDamageAbsorbed,
      },
    },
  }
}
