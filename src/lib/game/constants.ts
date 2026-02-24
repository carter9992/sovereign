// =============================================================================
// SOVEREIGN - Game Constants
// =============================================================================

// -----------------------------------------------------------------------------
// Helper Types
// -----------------------------------------------------------------------------

export type ResourceCost = {
  readonly ore?: number;
  readonly provisions?: number;
  readonly gold?: number;
  readonly mana?: number;
  readonly timeSeconds: number;
};

export type UnitType =
  | "INFANTRY"
  | "ARCHER"
  | "HEAVY_INFANTRY"
  | "WARDEN"
  | "CARAVAN"
  | "SCOUT"
  | "CAVALRY";

export type DefenseStructureType =
  | "WALLS"
  | "GUARD_TOWER"
  | "WATCH_TOWER"
  | "BALLISTA";

// -----------------------------------------------------------------------------
// 1. Tick & Season Timing
// -----------------------------------------------------------------------------

export const TICK_INTERVAL_MS = 30_000;

export const SEASON_DURATION_DAYS: number =
  typeof process !== "undefined" && process.env.SEASON_DURATION_DAYS
    ? Number(process.env.SEASON_DURATION_DAYS)
    : 14;

// -----------------------------------------------------------------------------
// 3. Resource Production Rates (per tick)
// -----------------------------------------------------------------------------

export const BASE_ORE_PER_TICK = 5;
export const BASE_PROVISIONS_PER_TICK = 8;
export const BASE_GOLD_PER_TICK = 2;
export const BASE_MANA_PER_TICK = 0;

// -----------------------------------------------------------------------------
// 4. Mine Level Multipliers
// -----------------------------------------------------------------------------

export const MINE_LEVEL_MULTIPLIERS = {
  1: 1.0,
  2: 1.2,
  3: 1.4,
  4: 1.65,
  5: 2.0,
} as const;

// -----------------------------------------------------------------------------
// 5. Crop Mastery Multipliers
// -----------------------------------------------------------------------------

export const CROP_MASTERY_MULTIPLIERS = {
  0: 1.0,
  1: 1.3,
  2: 1.6,
  3: 2.0,
  4: 2.5,
  5: 3.0,
} as const;

// -----------------------------------------------------------------------------
// 6. War Tech Costs
//    Tracks: BALLISTICS, DEFENSE_TRACK, STRATEGY (levels 1-5)
// -----------------------------------------------------------------------------

const WAR_TECH_LEVEL_COSTS: Record<number, ResourceCost> = {
  1: { ore: 200, timeSeconds: 3 * 60 },
  2: { ore: 400, timeSeconds: 6 * 60 },
  3: { ore: 800, timeSeconds: 12 * 60 },
  4: { ore: 1600, timeSeconds: 25 * 60 },
  5: { ore: 3000, timeSeconds: 45 * 60 },
} as const;

export const WAR_TECH_COSTS = {
  BALLISTICS: { ...WAR_TECH_LEVEL_COSTS },
  DEFENSE_TRACK: { ...WAR_TECH_LEVEL_COSTS },
  STRATEGY: { ...WAR_TECH_LEVEL_COSTS },
} as const;

// -----------------------------------------------------------------------------
// 7. Agriculture Costs
// -----------------------------------------------------------------------------

export const AGRICULTURE_COSTS = {
  CROP_MASTERY: {
    1: { provisions: 300, timeSeconds: 4 * 60 },
    2: { provisions: 600, timeSeconds: 8 * 60 },
    3: { provisions: 1200, timeSeconds: 15 * 60 },
    4: { provisions: 2400, timeSeconds: 30 * 60 },
    5: { provisions: 4000, timeSeconds: 50 * 60 },
  },
  ANIMAL_HUSBANDRY: {
    1: { provisions: 300, timeSeconds: 5 * 60 },
    2: { provisions: 700, timeSeconds: 10 * 60 },
    3: { provisions: 1400, timeSeconds: 18 * 60 },
    4: { provisions: 2800, timeSeconds: 35 * 60 },
    5: { provisions: 5000, timeSeconds: 60 * 60 },
  },
} as const;

// -----------------------------------------------------------------------------
// 8. Mine Upgrade Costs
// -----------------------------------------------------------------------------

export const MINE_UPGRADE_COSTS = {
  2: { ore: 600, timeSeconds: 10 * 60 } as ResourceCost,
  3: { ore: 1500, timeSeconds: 25 * 60 } as ResourceCost,
  4: { ore: 3500, timeSeconds: 60 * 60 } as ResourceCost,
  5: { ore: 7000, timeSeconds: 120 * 60 } as ResourceCost,
} as const;

// -----------------------------------------------------------------------------
// 9. Citadel Upgrade Costs
// -----------------------------------------------------------------------------

export const CITADEL_UPGRADE_COSTS = {
  2: { gold: 3000, timeSeconds: 30 * 60 } as ResourceCost,
  3: { gold: 8000, timeSeconds: 90 * 60 } as ResourceCost,
  4: { gold: 20000, timeSeconds: 180 * 60 } as ResourceCost,
} as const;

// -----------------------------------------------------------------------------
// 10. Scout Cap by Citadel Level
// -----------------------------------------------------------------------------

export const SCOUT_CAP_BY_CITADEL = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
} as const;

// -----------------------------------------------------------------------------
// 11. Frontier Cap by Citadel Level
// -----------------------------------------------------------------------------

export const FRONTIER_CAP_BY_CITADEL = {
  1: 0,
  2: 1,
  3: 2,
  4: 3,
} as const;

// -----------------------------------------------------------------------------
// 12. Unit Training Costs
//     Each entry: ore, provisions, gold, timeSeconds, and prerequisites
// -----------------------------------------------------------------------------

export const UNIT_TRAINING_COSTS = {
  INFANTRY: {
    ore: 20,
    provisions: 10,
    gold: 0,
    timeSeconds: 30,
    requires: null,
  },
  ARCHER: {
    ore: 30,
    provisions: 15,
    gold: 0,
    timeSeconds: 45,
    requires: { BALLISTICS: 1 },
  },
  HEAVY_INFANTRY: {
    ore: 60,
    provisions: 25,
    gold: 0,
    timeSeconds: 90,
    requires: { totalWar: 3, mine: 3 },
  },
  WARDEN: {
    ore: 40,
    provisions: 30,
    gold: 0,
    timeSeconds: 60,
    requires: { DEFENSE_TRACK: 3 },
  },
  CARAVAN: {
    ore: 10,
    provisions: 50,
    gold: 0,
    timeSeconds: 45,
    requires: { ANIMAL_HUSBANDRY: 2 },
  },
  SCOUT: {
    ore: 15,
    provisions: 20,
    gold: 10,
    timeSeconds: 60,
    requires: { STRATEGY: 1 },
  },
  CAVALRY: {
    ore: 80,
    provisions: 40,
    gold: 20,
    timeSeconds: 120,
    requires: { totalWar: 5, ANIMAL_HUSBANDRY: 4 },
  },
} as const;

// -----------------------------------------------------------------------------
// 13. Unit Stats
//     attack, defense, speed (tiles per minute), carryCapacity
// -----------------------------------------------------------------------------

export const UNIT_STATS = {
  INFANTRY: { attack: 10, defense: 8, speed: 0.5, carryCapacity: 0, provisionPerTile: 2 },
  ARCHER: { attack: 12, defense: 5, speed: 0.5, carryCapacity: 0, provisionPerTile: 2 },
  HEAVY_INFANTRY: { attack: 8, defense: 15, speed: 0.3, carryCapacity: 0, provisionPerTile: 3 },
  WARDEN: { attack: 3, defense: 25, speed: 0.1, carryCapacity: 0, provisionPerTile: 1 },
  CARAVAN: { attack: 0, defense: 2, speed: 0.4, carryCapacity: 200, provisionPerTile: 4 },
  SCOUT: { attack: 2, defense: 2, speed: 2.0, carryCapacity: 0, provisionPerTile: 1 },
  CAVALRY: { attack: 15, defense: 10, speed: 1.0, carryCapacity: 0, provisionPerTile: 5 },
} as const;

// -----------------------------------------------------------------------------
// PvP Constants
// -----------------------------------------------------------------------------

export const PVP_LOOT_PERCENT = 0.15;
export const PROTECTION_DURATION_MS = 24 * 60 * 60 * 1000;

// -----------------------------------------------------------------------------
// Combat Structure Constants (used by phased combat)
// -----------------------------------------------------------------------------

export const WALL_HP_PER_LEVEL = 100
export const GUARD_TOWER_DAMAGE_PER_LEVEL = 20

// -----------------------------------------------------------------------------
// 14. Combat Triangle
//     Damage multiplier when attacker engages defender.
//     Values > 1.0 = attacker has advantage.
//     Values < 1.0 = attacker has disadvantage (defender takes less damage).
// -----------------------------------------------------------------------------

export const COMBAT_TRIANGLE: Record<string, Record<string, number>> = {
  CAVALRY: {
    ARCHER: 1.25,
    INFANTRY: 0.8,
    HEAVY_INFANTRY: 0.75,
  },
  ARCHER: {
    INFANTRY: 1.25,
    CAVALRY: 0.8,
  },
  INFANTRY: {
    CAVALRY: 1.25,
    ARCHER: 0.8,
  },
  HEAVY_INFANTRY: {
    CAVALRY: 1.18, // 0.85 damage taken -> 1/0.85 ~ 1.18 effective multiplier
  },
} as const;

// -----------------------------------------------------------------------------
// 15. Defense Structure Bonuses (per level)
// -----------------------------------------------------------------------------

export const DEFENSE_STRUCTURE_BONUSES = {
  WALLS: { defensePercent: 5 },
  GUARD_TOWER: { attackPercent: 3 },
  WATCH_TOWER: { detectionRangePercent: 10 },
  BALLISTA: { attackVsLargePercent: 8 },
} as const;

// -----------------------------------------------------------------------------
// 16. Arcana Costs (gold + mana)
// -----------------------------------------------------------------------------

export const ARCANA_COSTS = {
  TIER_1: { mana: 500, gold: 1000, timeSeconds: 10 * 60 },
  TIER_2: { mana: 1500, gold: 3000, timeSeconds: 25 * 60 },
  TIER_3: { mana: 4000, gold: 7000, timeSeconds: 45 * 60 },
  TIER_4: { mana: 8000, gold: 15000, timeSeconds: 75 * 60 },
  DRAGON: { mana: 25000, gold: 40000, timeSeconds: 180 * 60 },
} as const;

// -----------------------------------------------------------------------------
// 17. Building Build Times (seconds)
// -----------------------------------------------------------------------------

export const BUILDING_BUILD_TIMES = {
  FARM: 1 * 60,
  MINE: 2 * 60,
  OBSERVATORY: 3 * 60,
  BARRACKS: 2 * 60,
  STORAGE: 1 * 60,
} as const;

// -----------------------------------------------------------------------------
// 18. Storage Caps by Level
// -----------------------------------------------------------------------------

export const STORAGE_CAPS_BY_LEVEL = {
  1: 5000,
  2: 10000,
  3: 20000,
  4: 40000,
  5: 75000,
} as const;

// -----------------------------------------------------------------------------
// 19. Tutorial Steps
// -----------------------------------------------------------------------------

export const TUTORIAL_STEPS = {
  START: 0,
  BUILD_FARM: 1,
  BUILD_MINE: 2,
  BUILD_OBSERVATORY: 3,
  RESEARCH_IRRIGATION: 4,
  BUILD_BARRACKS: 5,
  TRAIN_INFANTRY: 6,
  NPC_RAID: 7,
  RAID_WON: 8,
  UNLOCK_SCOUTS: 9,
  SCOUT_HIDEOUT: 10,
  ATTACK_HIDEOUT: 11,
  HIDEOUT_DESTROYED: 12,
  TUTORIAL_COMPLETE: 13,
} as const;

// -----------------------------------------------------------------------------
// 20. Storage Upgrade Costs
// -----------------------------------------------------------------------------

export const STORAGE_UPGRADE_COSTS = {
  2: { ore: 300, provisions: 200, timeSeconds: 5 * 60 } as ResourceCost,
  3: { ore: 800, provisions: 500, timeSeconds: 15 * 60 } as ResourceCost,
  4: { ore: 2000, provisions: 1200, timeSeconds: 30 * 60 } as ResourceCost,
  5: { ore: 5000, provisions: 3000, timeSeconds: 60 * 60 } as ResourceCost,
} as const;

// -----------------------------------------------------------------------------
// 21. Defense Upgrade Costs (per structure type, per level)
// -----------------------------------------------------------------------------

export const DEFENSE_UPGRADE_COSTS = {
  WALLS: {
    1: { ore: 200, provisions: 100, timeSeconds: 5 * 60 } as ResourceCost,
    2: { ore: 500, provisions: 250, timeSeconds: 10 * 60 } as ResourceCost,
    3: { ore: 1200, provisions: 600, timeSeconds: 20 * 60 } as ResourceCost,
    4: { ore: 2800, provisions: 1400, timeSeconds: 40 * 60 } as ResourceCost,
    5: { ore: 6000, provisions: 3000, timeSeconds: 75 * 60 } as ResourceCost,
  },
  GUARD_TOWER: {
    1: { ore: 300, gold: 100, timeSeconds: 5 * 60 } as ResourceCost,
    2: { ore: 700, gold: 300, timeSeconds: 12 * 60 } as ResourceCost,
    3: { ore: 1500, gold: 700, timeSeconds: 25 * 60 } as ResourceCost,
    4: { ore: 3500, gold: 1500, timeSeconds: 50 * 60 } as ResourceCost,
    5: { ore: 7000, gold: 3000, timeSeconds: 90 * 60 } as ResourceCost,
  },
  WATCH_TOWER: {
    1: { ore: 150, gold: 50, timeSeconds: 3 * 60 } as ResourceCost,
    2: { ore: 400, gold: 150, timeSeconds: 8 * 60 } as ResourceCost,
    3: { ore: 900, gold: 400, timeSeconds: 18 * 60 } as ResourceCost,
    4: { ore: 2000, gold: 900, timeSeconds: 35 * 60 } as ResourceCost,
    5: { ore: 4500, gold: 2000, timeSeconds: 65 * 60 } as ResourceCost,
  },
  BALLISTA: {
    1: { ore: 500, gold: 200, timeSeconds: 8 * 60 } as ResourceCost,
    2: { ore: 1200, gold: 500, timeSeconds: 18 * 60 } as ResourceCost,
    3: { ore: 2800, gold: 1200, timeSeconds: 35 * 60 } as ResourceCost,
    4: { ore: 6000, gold: 2500, timeSeconds: 60 * 60 } as ResourceCost,
    5: { ore: 12000, gold: 5000, timeSeconds: 100 * 60 } as ResourceCost,
  },
} as const;
