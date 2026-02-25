#!/usr/bin/env npx tsx
// =============================================================================
// SOVEREIGN Economy Simulation — 10 Player Archetypes over 5 hours
// =============================================================================

const TICK_INTERVAL_S = 30;
const SIM_DURATION_S = 5 * 60 * 60; // 5 hours
const TOTAL_TICKS = Math.floor(SIM_DURATION_S / TICK_INTERVAL_S); // 600

// ---- Resource production constants ----
const BASE_ORE_PER_TICK = 5;
const BASE_PROVISIONS_PER_TICK = 5;
const BASE_GOLD_PER_TICK = 0;
const SAWMILL_BASE_PER_TICK = 4;

const MINE_LEVEL_MULT: Record<number, number> = { 0: 0, 1: 1.0, 2: 1.2, 3: 1.4, 4: 1.65, 5: 2.0, 6: 2.4, 7: 2.85, 8: 3.4 };
const SAWMILL_LEVEL_MULT: Record<number, number> = { 0: 0, 1: 1.0, 2: 1.3, 3: 1.6, 4: 2.0, 5: 2.5, 6: 3.0, 7: 3.6, 8: 4.3 };
const CROP_MASTERY_MULT: Record<number, number> = { 0: 1.0, 1: 1.3, 2: 1.6, 3: 2.0, 4: 2.5, 5: 3.0 };
const FORESTRY_MULT: Record<number, number> = { 0: 1.0, 1: 1.2, 2: 1.4, 3: 1.7, 4: 2.0, 5: 2.5 };
const FARM_LEVEL_MULT: Record<number, number> = { 0: 1.0, 1: 1.0, 2: 1.3, 3: 1.6, 4: 2.0, 5: 2.5 };
const BARRACKS_TRAINING_MULT: Record<number, number> = { 1: 1.0, 2: 0.85, 3: 0.70, 4: 0.55, 5: 0.40 };
const UNIT_UPKEEP: Record<string, number> = {
  INFANTRY: 0.5, ARCHER: 0.5, HEAVY_INFANTRY: 0.8,
  WARDEN: 0.3, CARAVAN: 1.0, SCOUT: 0.3, CAVALRY: 1.5,
};

// ---- Building costs ----
const BUILD_COSTS: Record<string, { ore?: number; lumber?: number; gold?: number; provisions?: number; time: number }> = {
  SAWMILL:      { lumber: 50,  ore: 30,  time: 30 },
  FARM:         { lumber: 80,  ore: 30,  time: 60 },
  MINE:         { lumber: 100, ore: 50,  time: 120 },
  OBSERVATORY:  { lumber: 150, ore: 50,  gold: 50, time: 180 },
  BARRACKS:     { lumber: 120, ore: 80,  time: 120 },
  STORAGE:      { lumber: 60,  ore: 40,  time: 60 },
};

// ---- Upgrade costs ----
const MINE_UPGRADE: Record<number, { ore: number; lumber: number; time: number }> = {
  2: { ore: 400, lumber: 200, time: 600 },
  3: { ore: 1000, lumber: 500, time: 1500 },
  4: { ore: 2500, lumber: 1200, time: 3600 },
  5: { ore: 5000, lumber: 2500, time: 7200 },
  6: { ore: 10000, lumber: 5000, time: 10800 },
  7: { ore: 18000, lumber: 9000, time: 18000 },
  8: { ore: 30000, lumber: 15000, time: 21600 },
};

const SAWMILL_UPGRADE: Record<number, { ore: number; lumber: number; time: number }> = {
  2: { lumber: 400, ore: 200, time: 480 },
  3: { lumber: 1000, ore: 500, time: 1200 },
  4: { lumber: 2500, ore: 1200, time: 2700 },
  5: { lumber: 5000, ore: 2500, time: 5400 },
  6: { lumber: 10000, ore: 5000, time: 10800 },
  7: { lumber: 18000, ore: 9000, time: 18000 },
  8: { lumber: 30000, ore: 15000, time: 21600 },
};

const CITADEL_UPGRADE: Record<number, { gold: number; lumber: number; ore: number; time: number }> = {
  2: { gold: 500, lumber: 800, ore: 400, time: 1800 },
  3: { gold: 1500, lumber: 2000, ore: 1000, time: 5400 },
  4: { gold: 4000, lumber: 5000, ore: 2500, time: 10800 },
};

const BARRACKS_UPGRADE: Record<number, { ore: number; lumber: number; time: number }> = {
  2: { ore: 300, lumber: 400, time: 600 },
  3: { ore: 800, lumber: 1000, time: 1500 },
  4: { ore: 2000, lumber: 2500, time: 3600 },
  5: { ore: 5000, lumber: 6000, time: 7200 },
};

const FARM_UPGRADE: Record<number, { ore: number; lumber: number; time: number }> = {
  2: { lumber: 300, ore: 150, time: 480 },
  3: { lumber: 800, ore: 400, time: 1200 },
  4: { lumber: 2000, ore: 1000, time: 2700 },
  5: { lumber: 5000, ore: 2500, time: 5400 },
};

// ---- Research costs ----
const WAR_TECH_COST: Record<number, { ore: number; time: number }> = {
  1: { ore: 150, time: 120 }, 2: { ore: 350, time: 300 }, 3: { ore: 700, time: 600 },
  4: { ore: 1400, time: 1200 }, 5: { ore: 2800, time: 2100 },
};

const CROP_MASTERY_COST: Record<number, { provisions: number; time: number }> = {
  1: { provisions: 200, time: 180 }, 2: { provisions: 450, time: 360 }, 3: { provisions: 900, time: 720 },
  4: { provisions: 1800, time: 1440 }, 5: { provisions: 3200, time: 2400 },
};

const ANIMAL_HUSBANDRY_COST: Record<number, { provisions: number; time: number }> = {
  1: { provisions: 250, time: 240 }, 2: { provisions: 500, time: 480 }, 3: { provisions: 1000, time: 840 },
  4: { provisions: 2000, time: 1500 }, 5: { provisions: 3500, time: 2400 },
};

const FORESTRY_COST: Record<number, { lumber: number; time: number }> = {
  1: { lumber: 200, time: 180 }, 2: { lumber: 450, time: 360 }, 3: { lumber: 900, time: 720 },
  4: { lumber: 1800, time: 1440 }, 5: { lumber: 3200, time: 2400 },
};

// ---- Unit costs ----
const UNIT_COSTS: Record<string, { ore: number; provisions: number; gold: number; time: number }> = {
  INFANTRY:       { ore: 15, provisions: 10, gold: 0,  time: 75 },
  ARCHER:         { ore: 25, provisions: 12, gold: 0,  time: 112 },
  HEAVY_INFANTRY: { ore: 50, provisions: 20, gold: 0,  time: 225 },
  WARDEN:         { ore: 35, provisions: 25, gold: 0,  time: 150 },
  CARAVAN:        { ore: 10, provisions: 40, gold: 0,  time: 112 },
  SCOUT:          { ore: 15, provisions: 15, gold: 0,  time: 150 },
  CAVALRY:        { ore: 60, provisions: 35, gold: 15, time: 300 },
};

// ---- Defense costs (level 1 only for sim) ----
const DEFENSE_L1: Record<string, { lumber: number; ore: number; gold?: number; time: number }> = {
  WALLS:       { lumber: 150, ore: 80,  time: 300 },
  GUARD_TOWER: { lumber: 200, ore: 100, gold: 80, time: 300 },
  WATCH_TOWER: { lumber: 100, ore: 60,  gold: 40, time: 180 },
};

// ---- Simulation state ----
interface SimState {
  ore: number; provisions: number; gold: number; lumber: number; mana: number;
  oreCap: number; provisionsCap: number; goldCap: number; lumberCap: number;
  buildings: Record<string, { level: number; built: boolean; finishTick: number }>;
  research: Record<string, number>;
  activeResearch: { track: string; finishTick: number } | null;
  defenses: Record<string, number>;
  units: Record<string, number>;
  trainQueue: { unitType: string; qty: number; finishTick: number }[];
  buildQueue: { type: string; finishTick: number }[];
  raidGold: number; // total gold from raids
  totalUnits: number;
  events: string[];
  idleTicks: number;
}

function newState(): SimState {
  return {
    ore: 400, provisions: 400, gold: 200, lumber: 300, mana: 0,
    oreCap: 5000, provisionsCap: 5000, goldCap: 5000, lumberCap: 5000,
    buildings: {
      CITADEL: { level: 1, built: true, finishTick: 0 },
      SAWMILL: { level: 0, built: false, finishTick: 0 },
      FARM: { level: 0, built: false, finishTick: 0 },
      MINE: { level: 0, built: false, finishTick: 0 },
      OBSERVATORY: { level: 0, built: false, finishTick: 0 },
      BARRACKS: { level: 0, built: false, finishTick: 0 },
      STORAGE: { level: 1, built: true, finishTick: 0 },
    },
    research: { BALLISTICS: 0, DEFENSE_TRACK: 0, STRATEGY: 0, CROP_MASTERY: 0, ANIMAL_HUSBANDRY: 0, FORESTRY: 0 },
    activeResearch: null,
    defenses: {},
    units: {},
    trainQueue: [],
    buildQueue: [],
    raidGold: 0,
    totalUnits: 0,
    events: [],
    idleTicks: 0,
  };
}

function canAfford(s: SimState, cost: { ore?: number; lumber?: number; provisions?: number; gold?: number }): boolean {
  return s.ore >= (cost.ore ?? 0) && s.lumber >= (cost.lumber ?? 0) &&
         s.provisions >= (cost.provisions ?? 0) && s.gold >= (cost.gold ?? 0);
}

function spend(s: SimState, cost: { ore?: number; lumber?: number; provisions?: number; gold?: number }) {
  s.ore -= (cost.ore ?? 0);
  s.lumber -= (cost.lumber ?? 0);
  s.provisions -= (cost.provisions ?? 0);
  s.gold -= (cost.gold ?? 0);
}

function accrue(s: SimState) {
  const mine = s.buildings.MINE;
  const mineUp = mine.finishTick > 0;
  const mineLevel = mine.built ? mine.level : 0;
  const oreDelta = mineUp ? 0 : BASE_ORE_PER_TICK * (MINE_LEVEL_MULT[mineLevel] ?? 0);

  const sawmill = s.buildings.SAWMILL;
  const sawUp = sawmill.finishTick > 0;
  const sawLevel = sawmill.built ? sawmill.level : 0;
  const forestryLevel = s.research.FORESTRY ?? 0;
  const lumberDelta = (sawmill.built && !sawUp)
    ? SAWMILL_BASE_PER_TICK * (SAWMILL_LEVEL_MULT[sawLevel] ?? 1) * (FORESTRY_MULT[forestryLevel] ?? 1)
    : 0;

  const farm = s.buildings.FARM;
  const farmUp = farm.finishTick > 0;
  const farmLevel = farm.built ? farm.level : 0;
  const farmMult = FARM_LEVEL_MULT[farmLevel] ?? 1;
  const cropLevel = s.research.CROP_MASTERY ?? 0;
  const provProduction = farmUp ? 0 : BASE_PROVISIONS_PER_TICK * farmMult * (CROP_MASTERY_MULT[cropLevel] ?? 1);

  // Unit upkeep
  let totalUpkeep = 0;
  for (const [type, qty] of Object.entries(s.units)) {
    totalUpkeep += qty * (UNIT_UPKEEP[type] ?? 0);
  }
  const provDelta = provProduction - totalUpkeep;

  s.ore = Math.min(s.ore + oreDelta, s.oreCap);
  s.provisions = Math.max(0, Math.min(s.provisions + provDelta, s.provisionsCap));
  s.gold = Math.min(s.gold + BASE_GOLD_PER_TICK, s.goldCap);
  s.lumber = Math.min(s.lumber + lumberDelta, s.lumberCap);
}

function completeBuildQueue(s: SimState, tick: number) {
  s.buildQueue = s.buildQueue.filter((q) => {
    if (tick >= q.finishTick) {
      const b = s.buildings[q.type];
      if (b) {
        if (!b.built) { b.built = true; b.level = 1; }
        else { b.level++; }
        b.finishTick = 0;
      }
      s.events.push(`t=${tick}: ${q.type} -> Lv${b?.level}`);
      return false;
    }
    return true;
  });
}

function completeResearch(s: SimState, tick: number) {
  if (s.activeResearch && tick >= s.activeResearch.finishTick) {
    s.research[s.activeResearch.track]++;
    s.events.push(`t=${tick}: ${s.activeResearch.track} -> Lv${s.research[s.activeResearch.track]}`);
    s.activeResearch = null;
  }
}

function completeTraining(s: SimState, tick: number) {
  s.trainQueue = s.trainQueue.filter((q) => {
    if (tick >= q.finishTick) {
      s.units[q.unitType] = (s.units[q.unitType] ?? 0) + q.qty;
      s.totalUnits += q.qty;
      return false;
    }
    return true;
  });
}

function tryBuild(s: SimState, type: string, tick: number): boolean {
  const cost = BUILD_COSTS[type];
  if (!cost) return false;
  const b = s.buildings[type];
  if (!b || b.built || b.finishTick > 0) return false;
  if (!canAfford(s, cost)) return false;
  spend(s, cost);
  b.finishTick = tick + Math.ceil(cost.time / TICK_INTERVAL_S);
  s.buildQueue.push({ type, finishTick: b.finishTick });
  return true;
}

function tryUpgrade(s: SimState, type: string, costs: Record<number, any>, tick: number): boolean {
  const b = s.buildings[type];
  if (!b || !b.built || b.finishTick > 0) return false;
  const nextLevel = b.level + 1;
  const cost = costs[nextLevel];
  if (!cost) return false;
  if (!canAfford(s, cost)) return false;
  spend(s, cost);
  b.finishTick = tick + Math.ceil(cost.time / TICK_INTERVAL_S);
  s.buildQueue.push({ type, finishTick: b.finishTick });
  return true;
}

function tryResearch(s: SimState, track: string, costs: Record<number, any>, tick: number): boolean {
  if (s.activeResearch) return false;
  const nextLevel = (s.research[track] ?? 0) + 1;
  const cost = costs[nextLevel];
  if (!cost) return false;
  if (!canAfford(s, cost)) return false;
  spend(s, cost);
  s.activeResearch = { track, finishTick: tick + Math.ceil(cost.time / TICK_INTERVAL_S) };
  return true;
}

function tryTrain(s: SimState, unitType: string, qty: number, tick: number): boolean {
  const cost = UNIT_COSTS[unitType];
  if (!cost) return false;
  const total = { ore: cost.ore * qty, provisions: cost.provisions * qty, gold: cost.gold * qty };
  if (!canAfford(s, total)) return false;
  spend(s, total);
  const barracksLevel = s.buildings.BARRACKS.built ? s.buildings.BARRACKS.level : 1;
  const trainMult = BARRACKS_TRAINING_MULT[barracksLevel] ?? 1.0;
  const trainTime = Math.ceil(cost.time * qty * trainMult);
  s.trainQueue.push({ unitType, qty, finishTick: tick + Math.ceil(trainTime / TICK_INTERVAL_S) });
  return true;
}

function tryDefense(s: SimState, type: string, tick: number): boolean {
  if ((s.defenses[type] ?? 0) > 0) return false;
  const cost = DEFENSE_L1[type];
  if (!cost) return false;
  if (!canAfford(s, cost)) return false;
  spend(s, cost);
  s.defenses[type] = 1;
  s.events.push(`t=${tick}: Built ${type} L1`);
  return true;
}

// Simulate a raid returning ~gold proportional to army size
function simulateRaid(s: SimState, tick: number) {
  const armyPower = Object.entries(s.units).reduce((sum, [type, qty]) => {
    if (type === 'CARAVAN' || type === 'SCOUT') return sum;
    return sum + qty;
  }, 0);
  if (armyPower < 5) return;
  const goldLoot = Math.floor(50 + armyPower * 8);
  const oreLoot = Math.floor(40 + armyPower * 5);
  const provLoot = Math.floor(30 + armyPower * 4);
  const lumberLoot = Math.floor(20 + armyPower * 3);
  s.gold = Math.min(s.gold + goldLoot, s.goldCap);
  s.ore = Math.min(s.ore + oreLoot, s.oreCap);
  s.provisions = Math.min(s.provisions + provLoot, s.provisionsCap);
  s.lumber = Math.min(s.lumber + lumberLoot, s.lumberCap);
  s.raidGold += goldLoot;
  // Lose ~10% units
  for (const type of Object.keys(s.units)) {
    const loss = Math.ceil(s.units[type] * 0.1);
    s.units[type] = Math.max(0, s.units[type] - loss);
  }
  s.events.push(`t=${tick}: RAID -> +${goldLoot}g +${oreLoot}ore +${provLoot}prov +${lumberLoot}lum`);
}

// ============================================================================
// ARCHETYPES
// ============================================================================

type ArchetypeAI = (s: SimState, tick: number) => void;

// 1. Balanced Builder — does everything in tutorial order
const balancedBuilder: ArchetypeAI = (s, tick) => {
  // Build order: Sawmill > Farm > Mine > Observatory > Barracks > Storage
  if (!s.buildings.SAWMILL.built && s.buildings.SAWMILL.finishTick === 0) tryBuild(s, 'SAWMILL', tick);
  else if (s.buildings.SAWMILL.built && !s.buildings.FARM.built && s.buildings.FARM.finishTick === 0) tryBuild(s, 'FARM', tick);
  else if (s.buildings.FARM.built && !s.buildings.MINE.built && s.buildings.MINE.finishTick === 0) tryBuild(s, 'MINE', tick);
  else if (s.buildings.MINE.built && !s.buildings.BARRACKS.built && s.buildings.BARRACKS.finishTick === 0) tryBuild(s, 'BARRACKS', tick);
  else if (s.buildings.BARRACKS.built && !s.buildings.OBSERVATORY.built && s.buildings.OBSERVATORY.finishTick === 0) tryBuild(s, 'OBSERVATORY', tick);

  // Upgrade sawmill/mine/farm when possible
  if (s.buildings.SAWMILL.built && s.buildings.SAWMILL.finishTick === 0) tryUpgrade(s, 'SAWMILL', SAWMILL_UPGRADE, tick);
  if (s.buildings.MINE.built && s.buildings.MINE.finishTick === 0) tryUpgrade(s, 'MINE', MINE_UPGRADE, tick);
  if (s.buildings.FARM.built && s.buildings.FARM.finishTick === 0) tryUpgrade(s, 'FARM', FARM_UPGRADE, tick);

  // Research: Forestry first, then Crop Mastery, then Ballistics
  if (!s.activeResearch) {
    if (s.research.FORESTRY < 3 && s.buildings.SAWMILL.built) tryResearch(s, 'FORESTRY', FORESTRY_COST, tick);
    else if (s.research.CROP_MASTERY < 3) tryResearch(s, 'CROP_MASTERY', CROP_MASTERY_COST, tick);
    else if (s.research.BALLISTICS < 2) tryResearch(s, 'BALLISTICS', WAR_TECH_COST, tick);
    else if (s.research.STRATEGY < 1) tryResearch(s, 'STRATEGY', WAR_TECH_COST, tick);
  }

  // Train mixed army
  if (s.buildings.BARRACKS.built && s.trainQueue.length === 0) {
    if (s.totalUnits < 10) tryTrain(s, 'INFANTRY', 5, tick);
    else if (s.research.BALLISTICS >= 1) tryTrain(s, 'ARCHER', 3, tick);
  }

  // Raid every ~40 min once army is big enough
  if (tick > 0 && tick % 80 === 0 && s.totalUnits >= 8) simulateRaid(s, tick);
};

// 2. Rush Raider — builds barracks ASAP, raids often
const rushRaider: ArchetypeAI = (s, tick) => {
  if (!s.buildings.SAWMILL.built && s.buildings.SAWMILL.finishTick === 0) tryBuild(s, 'SAWMILL', tick);
  else if (s.buildings.SAWMILL.built && !s.buildings.MINE.built && s.buildings.MINE.finishTick === 0) tryBuild(s, 'MINE', tick);
  else if (s.buildings.MINE.built && !s.buildings.BARRACKS.built && s.buildings.BARRACKS.finishTick === 0) tryBuild(s, 'BARRACKS', tick);
  else if (s.buildings.BARRACKS.built && !s.buildings.FARM.built && s.buildings.FARM.finishTick === 0) tryBuild(s, 'FARM', tick);

  // Upgrade barracks for faster training
  if (s.buildings.BARRACKS.built && s.buildings.BARRACKS.finishTick === 0) tryUpgrade(s, 'BARRACKS', BARRACKS_UPGRADE, tick);

  // All research into war
  if (!s.activeResearch) {
    if (s.research.BALLISTICS < 3) tryResearch(s, 'BALLISTICS', WAR_TECH_COST, tick);
    else if (s.research.STRATEGY < 1) tryResearch(s, 'STRATEGY', WAR_TECH_COST, tick);
    else if (s.research.DEFENSE_TRACK < 2) tryResearch(s, 'DEFENSE_TRACK', WAR_TECH_COST, tick);
  }

  // Train infantry aggressively
  if (s.buildings.BARRACKS.built && s.trainQueue.length === 0) {
    tryTrain(s, 'INFANTRY', 5, tick);
  }

  // Raid every ~20 min
  if (tick > 0 && tick % 40 === 0 && s.totalUnits >= 5) simulateRaid(s, tick);
};

// 3. Turtle Defender — walls, towers, wardens
const turtleDefender: ArchetypeAI = (s, tick) => {
  if (!s.buildings.SAWMILL.built && s.buildings.SAWMILL.finishTick === 0) tryBuild(s, 'SAWMILL', tick);
  else if (s.buildings.SAWMILL.built && !s.buildings.FARM.built && s.buildings.FARM.finishTick === 0) tryBuild(s, 'FARM', tick);
  else if (s.buildings.FARM.built && !s.buildings.MINE.built && s.buildings.MINE.finishTick === 0) tryBuild(s, 'MINE', tick);
  else if (s.buildings.MINE.built && !s.buildings.BARRACKS.built && s.buildings.BARRACKS.finishTick === 0) tryBuild(s, 'BARRACKS', tick);

  // Upgrade sawmill for lumber income
  if (s.buildings.SAWMILL.built && s.buildings.SAWMILL.finishTick === 0) tryUpgrade(s, 'SAWMILL', SAWMILL_UPGRADE, tick);

  // Research defense track + forestry
  if (!s.activeResearch) {
    if (s.research.FORESTRY < 2 && s.buildings.SAWMILL.built) tryResearch(s, 'FORESTRY', FORESTRY_COST, tick);
    else if (s.research.DEFENSE_TRACK < 3) tryResearch(s, 'DEFENSE_TRACK', WAR_TECH_COST, tick);
    else if (s.research.BALLISTICS < 1) tryResearch(s, 'BALLISTICS', WAR_TECH_COST, tick);
    else if (s.research.CROP_MASTERY < 2) tryResearch(s, 'CROP_MASTERY', CROP_MASTERY_COST, tick);
  }

  // Build defenses
  tryDefense(s, 'WALLS', tick);
  tryDefense(s, 'WATCH_TOWER', tick);

  // Train wardens + infantry
  if (s.buildings.BARRACKS.built && s.trainQueue.length === 0) {
    if (s.research.DEFENSE_TRACK >= 2 && (s.units.WARDEN ?? 0) < 5) tryTrain(s, 'WARDEN', 2, tick);
    else tryTrain(s, 'INFANTRY', 3, tick);
  }
};

// 4. Economy Optimizer — maxes sawmill, mine, farm upgrades
const economyOptimizer: ArchetypeAI = (s, tick) => {
  if (!s.buildings.SAWMILL.built && s.buildings.SAWMILL.finishTick === 0) tryBuild(s, 'SAWMILL', tick);
  else if (s.buildings.SAWMILL.built && !s.buildings.FARM.built && s.buildings.FARM.finishTick === 0) tryBuild(s, 'FARM', tick);
  else if (s.buildings.FARM.built && !s.buildings.MINE.built && s.buildings.MINE.finishTick === 0) tryBuild(s, 'MINE', tick);
  else if (!s.buildings.STORAGE.built) {} // already built
  else if (s.buildings.MINE.built && !s.buildings.BARRACKS.built && s.buildings.BARRACKS.finishTick === 0) tryBuild(s, 'BARRACKS', tick);

  // Aggressive upgrades
  if (s.buildings.SAWMILL.built && s.buildings.SAWMILL.finishTick === 0) tryUpgrade(s, 'SAWMILL', SAWMILL_UPGRADE, tick);
  if (s.buildings.MINE.built && s.buildings.MINE.finishTick === 0) tryUpgrade(s, 'MINE', MINE_UPGRADE, tick);
  if (s.buildings.FARM.built && s.buildings.FARM.finishTick === 0) tryUpgrade(s, 'FARM', FARM_UPGRADE, tick);

  // Research: Forestry > Crop Mastery > AH for caravans
  if (!s.activeResearch) {
    if (s.research.FORESTRY < 5 && s.buildings.SAWMILL.built) tryResearch(s, 'FORESTRY', FORESTRY_COST, tick);
    else if (s.research.CROP_MASTERY < 5) tryResearch(s, 'CROP_MASTERY', CROP_MASTERY_COST, tick);
    else if (s.research.ANIMAL_HUSBANDRY < 2) tryResearch(s, 'ANIMAL_HUSBANDRY', ANIMAL_HUSBANDRY_COST, tick);
  }

  // Light military, focus on caravans
  if (s.buildings.BARRACKS.built && s.trainQueue.length === 0) {
    if (s.totalUnits < 5) tryTrain(s, 'INFANTRY', 3, tick);
  }
};

// 5. Cavalry Rusher — rushes to cavalry ASAP
const cavalryRusher: ArchetypeAI = (s, tick) => {
  if (!s.buildings.SAWMILL.built && s.buildings.SAWMILL.finishTick === 0) tryBuild(s, 'SAWMILL', tick);
  else if (s.buildings.SAWMILL.built && !s.buildings.MINE.built && s.buildings.MINE.finishTick === 0) tryBuild(s, 'MINE', tick);
  else if (s.buildings.MINE.built && !s.buildings.FARM.built && s.buildings.FARM.finishTick === 0) tryBuild(s, 'FARM', tick);
  else if (s.buildings.FARM.built && !s.buildings.BARRACKS.built && s.buildings.BARRACKS.finishTick === 0) tryBuild(s, 'BARRACKS', tick);

  // Need totalWar 5 + AH 3 for cavalry
  if (!s.activeResearch) {
    const tw = s.research.BALLISTICS + s.research.DEFENSE_TRACK + s.research.STRATEGY;
    if (s.research.ANIMAL_HUSBANDRY < 3) tryResearch(s, 'ANIMAL_HUSBANDRY', ANIMAL_HUSBANDRY_COST, tick);
    else if (tw < 5) {
      if (s.research.BALLISTICS < 2) tryResearch(s, 'BALLISTICS', WAR_TECH_COST, tick);
      else if (s.research.DEFENSE_TRACK < 2) tryResearch(s, 'DEFENSE_TRACK', WAR_TECH_COST, tick);
      else if (s.research.STRATEGY < 1) tryResearch(s, 'STRATEGY', WAR_TECH_COST, tick);
    }
    else if (s.research.FORESTRY < 1 && s.buildings.SAWMILL.built) tryResearch(s, 'FORESTRY', FORESTRY_COST, tick);
  }

  // Train infantry early, cavalry once unlocked
  if (s.buildings.BARRACKS.built && s.trainQueue.length === 0) {
    const tw = s.research.BALLISTICS + s.research.DEFENSE_TRACK + s.research.STRATEGY;
    if (tw >= 5 && s.research.ANIMAL_HUSBANDRY >= 3 && s.gold >= 15) {
      tryTrain(s, 'CAVALRY', 1, tick);
    } else {
      tryTrain(s, 'INFANTRY', 3, tick);
    }
  }

  // Raid for gold (needed for cavalry)
  if (tick > 0 && tick % 60 === 0 && s.totalUnits >= 6) simulateRaid(s, tick);
};

// 6. Scout & Expand — Strategy-first, scouts early
const scoutExpander: ArchetypeAI = (s, tick) => {
  if (!s.buildings.SAWMILL.built && s.buildings.SAWMILL.finishTick === 0) tryBuild(s, 'SAWMILL', tick);
  else if (s.buildings.SAWMILL.built && !s.buildings.FARM.built && s.buildings.FARM.finishTick === 0) tryBuild(s, 'FARM', tick);
  else if (s.buildings.FARM.built && !s.buildings.MINE.built && s.buildings.MINE.finishTick === 0) tryBuild(s, 'MINE', tick);
  else if (s.buildings.MINE.built && !s.buildings.BARRACKS.built && s.buildings.BARRACKS.finishTick === 0) tryBuild(s, 'BARRACKS', tick);
  else if (!s.buildings.OBSERVATORY.built && s.buildings.OBSERVATORY.finishTick === 0) tryBuild(s, 'OBSERVATORY', tick);

  if (!s.activeResearch) {
    if (s.research.STRATEGY < 1) tryResearch(s, 'STRATEGY', WAR_TECH_COST, tick);
    else if (s.research.FORESTRY < 2 && s.buildings.SAWMILL.built) tryResearch(s, 'FORESTRY', FORESTRY_COST, tick);
    else if (s.research.BALLISTICS < 1) tryResearch(s, 'BALLISTICS', WAR_TECH_COST, tick);
    else if (s.research.CROP_MASTERY < 2) tryResearch(s, 'CROP_MASTERY', CROP_MASTERY_COST, tick);
  }

  if (s.buildings.BARRACKS.built && s.trainQueue.length === 0) {
    if (s.research.STRATEGY >= 1 && (s.units.SCOUT ?? 0) < 2) tryTrain(s, 'SCOUT', 1, tick);
    else tryTrain(s, 'INFANTRY', 3, tick);
  }
};

// 7. Citadel Rusher — aims for Citadel L2 ASAP
const citadelRusher: ArchetypeAI = (s, tick) => {
  if (!s.buildings.SAWMILL.built && s.buildings.SAWMILL.finishTick === 0) tryBuild(s, 'SAWMILL', tick);
  else if (s.buildings.SAWMILL.built && !s.buildings.MINE.built && s.buildings.MINE.finishTick === 0) tryBuild(s, 'MINE', tick);
  else if (s.buildings.MINE.built && !s.buildings.FARM.built && s.buildings.FARM.finishTick === 0) tryBuild(s, 'FARM', tick);
  else if (s.buildings.FARM.built && !s.buildings.BARRACKS.built && s.buildings.BARRACKS.finishTick === 0) tryBuild(s, 'BARRACKS', tick);

  // Upgrade sawmill for lumber
  if (s.buildings.SAWMILL.built && s.buildings.SAWMILL.finishTick === 0) tryUpgrade(s, 'SAWMILL', SAWMILL_UPGRADE, tick);

  // Try citadel upgrade (needs gold from raids)
  if (s.buildings.CITADEL.finishTick === 0) tryUpgrade(s, 'CITADEL', CITADEL_UPGRADE, tick);

  if (!s.activeResearch) {
    if (s.research.FORESTRY < 1 && s.buildings.SAWMILL.built) tryResearch(s, 'FORESTRY', FORESTRY_COST, tick);
    else if (s.research.BALLISTICS < 1) tryResearch(s, 'BALLISTICS', WAR_TECH_COST, tick);
  }

  // Train for raids (gold source)
  if (s.buildings.BARRACKS.built && s.trainQueue.length === 0) {
    tryTrain(s, 'INFANTRY', 5, tick);
  }

  // Raid for gold
  if (tick > 0 && tick % 50 === 0 && s.totalUnits >= 5) simulateRaid(s, tick);
};

// 8. Passive Farmer — never attacks, just farms
const passiveFarmer: ArchetypeAI = (s, tick) => {
  if (!s.buildings.SAWMILL.built && s.buildings.SAWMILL.finishTick === 0) tryBuild(s, 'SAWMILL', tick);
  else if (s.buildings.SAWMILL.built && !s.buildings.FARM.built && s.buildings.FARM.finishTick === 0) tryBuild(s, 'FARM', tick);
  else if (s.buildings.FARM.built && !s.buildings.MINE.built && s.buildings.MINE.finishTick === 0) tryBuild(s, 'MINE', tick);

  if (s.buildings.SAWMILL.built && s.buildings.SAWMILL.finishTick === 0) tryUpgrade(s, 'SAWMILL', SAWMILL_UPGRADE, tick);
  if (s.buildings.MINE.built && s.buildings.MINE.finishTick === 0) tryUpgrade(s, 'MINE', MINE_UPGRADE, tick);
  if (s.buildings.FARM.built && s.buildings.FARM.finishTick === 0) tryUpgrade(s, 'FARM', FARM_UPGRADE, tick);

  if (!s.activeResearch) {
    if (s.research.CROP_MASTERY < 5) tryResearch(s, 'CROP_MASTERY', CROP_MASTERY_COST, tick);
    else if (s.research.FORESTRY < 5 && s.buildings.SAWMILL.built) tryResearch(s, 'FORESTRY', FORESTRY_COST, tick);
  }
};

// 9. Late Game Whale — builds everything, gets cavalry + defenses
const lateGameWhale: ArchetypeAI = (s, tick) => {
  // Build everything
  for (const type of ['SAWMILL', 'FARM', 'MINE', 'BARRACKS', 'OBSERVATORY', 'STORAGE'] as const) {
    if (!s.buildings[type].built && s.buildings[type].finishTick === 0) { tryBuild(s, type, tick); break; }
  }

  // Upgrade production + barracks + farm
  if (s.buildings.SAWMILL.built && s.buildings.SAWMILL.finishTick === 0) tryUpgrade(s, 'SAWMILL', SAWMILL_UPGRADE, tick);
  if (s.buildings.MINE.built && s.buildings.MINE.finishTick === 0) tryUpgrade(s, 'MINE', MINE_UPGRADE, tick);
  if (s.buildings.BARRACKS.built && s.buildings.BARRACKS.finishTick === 0) tryUpgrade(s, 'BARRACKS', BARRACKS_UPGRADE, tick);
  if (s.buildings.FARM.built && s.buildings.FARM.finishTick === 0) tryUpgrade(s, 'FARM', FARM_UPGRADE, tick);

  // Research everything
  if (!s.activeResearch) {
    if (s.research.FORESTRY < 2 && s.buildings.SAWMILL.built) tryResearch(s, 'FORESTRY', FORESTRY_COST, tick);
    else if (s.research.CROP_MASTERY < 2) tryResearch(s, 'CROP_MASTERY', CROP_MASTERY_COST, tick);
    else if (s.research.BALLISTICS < 2) tryResearch(s, 'BALLISTICS', WAR_TECH_COST, tick);
    else if (s.research.DEFENSE_TRACK < 2) tryResearch(s, 'DEFENSE_TRACK', WAR_TECH_COST, tick);
    else if (s.research.STRATEGY < 1) tryResearch(s, 'STRATEGY', WAR_TECH_COST, tick);
    else if (s.research.ANIMAL_HUSBANDRY < 3) tryResearch(s, 'ANIMAL_HUSBANDRY', ANIMAL_HUSBANDRY_COST, tick);
  }

  // Defenses
  tryDefense(s, 'WALLS', tick);
  tryDefense(s, 'GUARD_TOWER', tick);

  // Train mixed
  if (s.buildings.BARRACKS.built && s.trainQueue.length === 0) {
    if (s.totalUnits < 15) tryTrain(s, 'INFANTRY', 5, tick);
    else if (s.research.BALLISTICS >= 1) tryTrain(s, 'ARCHER', 3, tick);
  }

  // Raid every ~30 min
  if (tick > 0 && tick % 60 === 0 && s.totalUnits >= 8) simulateRaid(s, tick);
};

// 10. AFK Player — logs in, builds sawmill + farm, then goes AFK
const afkPlayer: ArchetypeAI = (s, tick) => {
  if (tick < 20) {
    if (!s.buildings.SAWMILL.built && s.buildings.SAWMILL.finishTick === 0) tryBuild(s, 'SAWMILL', tick);
    else if (s.buildings.SAWMILL.built && !s.buildings.FARM.built && s.buildings.FARM.finishTick === 0) tryBuild(s, 'FARM', tick);
    else if (s.buildings.FARM.built && !s.buildings.MINE.built && s.buildings.MINE.finishTick === 0) tryBuild(s, 'MINE', tick);
  }
  // Otherwise AFK — just accrues passively
};

// ============================================================================
// RUN SIMULATION
// ============================================================================

interface ArchetypeDef {
  name: string;
  ai: ArchetypeAI;
}

const archetypes: ArchetypeDef[] = [
  { name: '1. Balanced Builder',  ai: balancedBuilder },
  { name: '2. Rush Raider',       ai: rushRaider },
  { name: '3. Turtle Defender',   ai: turtleDefender },
  { name: '4. Economy Optimizer', ai: economyOptimizer },
  { name: '5. Cavalry Rusher',    ai: cavalryRusher },
  { name: '6. Scout & Expand',    ai: scoutExpander },
  { name: '7. Citadel Rusher',    ai: citadelRusher },
  { name: '8. Passive Farmer',    ai: passiveFarmer },
  { name: '9. Late Game Whale',   ai: lateGameWhale },
  { name: '10. AFK Player',       ai: afkPlayer },
];

function formatRes(s: SimState): string {
  return `ore=${Math.floor(s.ore)} lum=${Math.floor(s.lumber)} prov=${Math.floor(s.provisions)} gold=${Math.floor(s.gold)}`;
}

function tickToTime(tick: number): string {
  const totalSec = tick * TICK_INTERVAL_S;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return `${h}h${String(m).padStart(2, '0')}m`;
}

console.log('='.repeat(80));
console.log('SOVEREIGN ECONOMY SIMULATION — 10 Archetypes x 5 Hours');
console.log(`Tick interval: ${TICK_INTERVAL_S}s | Total ticks: ${TOTAL_TICKS}`);
console.log('='.repeat(80));
console.log();

for (const arch of archetypes) {
  const s = newState();

  // Snapshot times
  const snapshots: { tick: number; ore: number; lumber: number; provisions: number; gold: number }[] = [];

  for (let tick = 0; tick < TOTAL_TICKS; tick++) {
    completeBuildQueue(s, tick);
    completeResearch(s, tick);
    completeTraining(s, tick);
    accrue(s);

    // Detect idle (nothing happening)
    const busy = s.buildQueue.length > 0 || s.activeResearch || s.trainQueue.length > 0;
    if (!busy) s.idleTicks++;

    arch.ai(s, tick);

    // Snapshots at 30m, 1h, 2h, 3h, 5h
    for (const target of [60, 120, 240, 360, 600]) {
      if (tick === target) {
        snapshots.push({ tick, ore: Math.floor(s.ore), lumber: Math.floor(s.lumber), provisions: Math.floor(s.provisions), gold: Math.floor(s.gold) });
      }
    }
  }

  // Final snapshot
  snapshots.push({ tick: TOTAL_TICKS, ore: Math.floor(s.ore), lumber: Math.floor(s.lumber), provisions: Math.floor(s.provisions), gold: Math.floor(s.gold) });

  console.log(`--- ${arch.name} ---`);
  console.log(`Final resources: ${formatRes(s)}`);

  const bldgs = Object.entries(s.buildings)
    .filter(([, v]) => v.built)
    .map(([k, v]) => `${k}(L${v.level})`)
    .join(', ');
  console.log(`Buildings: ${bldgs}`);

  const research = Object.entries(s.research)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
  console.log(`Research: ${research || 'none'}`);

  const units = Object.entries(s.units)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}x${v}`)
    .join(', ');
  console.log(`Units: ${units || 'none'} (total trained: ${s.totalUnits})`);

  const defs = Object.entries(s.defenses)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}(L${v})`)
    .join(', ');
  if (defs) console.log(`Defenses: ${defs}`);

  if (s.raidGold > 0) console.log(`Raid income: ${s.raidGold} gold total`);
  console.log(`Idle ticks: ${s.idleTicks}/${TOTAL_TICKS} (${Math.round(s.idleTicks/TOTAL_TICKS*100)}%)`);

  const citadelLevel = s.buildings.CITADEL.level;
  console.log(`Citadel level: ${citadelLevel}`);

  console.log('Resource snapshots:');
  for (const snap of snapshots) {
    console.log(`  ${tickToTime(snap.tick).padEnd(6)} ore=${String(snap.ore).padStart(5)} lum=${String(snap.lumber).padStart(5)} prov=${String(snap.provisions).padStart(5)} gold=${String(snap.gold).padStart(5)}`);
  }

  // Key events
  const keyEvents = s.events.filter(e =>
    e.includes('CITADEL') || e.includes('CAVALRY') || e.includes('RAID') ||
    e.includes('SAWMILL -> Lv') || e.includes('MINE -> Lv') || e.includes('Built')
  ).slice(0, 10);
  if (keyEvents.length > 0) {
    console.log('Key events:');
    for (const e of keyEvents) {
      const tickNum = parseInt(e.split('=')[1]);
      console.log(`  ${tickToTime(tickNum).padEnd(6)} ${e.split(': ').slice(1).join(': ')}`);
    }
  }

  console.log();
}

// ============================================================================
// SUMMARY TABLE
// ============================================================================

console.log('='.repeat(80));
console.log('SUMMARY TABLE');
console.log('='.repeat(80));
console.log(`${'Archetype'.padEnd(22)} ${'Ore'.padStart(5)} ${'Lum'.padStart(5)} ${'Prov'.padStart(5)} ${'Gold'.padStart(5)} ${'Units'.padStart(5)} ${'Cit'.padStart(3)} ${'Idle%'.padStart(5)} ${'RaidG'.padStart(6)}`);
console.log('-'.repeat(80));

for (const arch of archetypes) {
  const s = newState();
  for (let tick = 0; tick < TOTAL_TICKS; tick++) {
    completeBuildQueue(s, tick);
    completeResearch(s, tick);
    completeTraining(s, tick);
    accrue(s);
    const busy = s.buildQueue.length > 0 || s.activeResearch || s.trainQueue.length > 0;
    if (!busy) s.idleTicks++;
    arch.ai(s, tick);
  }

  const totalUnits = Object.values(s.units).reduce((a, b) => a + b, 0);
  console.log(
    `${arch.name.padEnd(22)} ${String(Math.floor(s.ore)).padStart(5)} ${String(Math.floor(s.lumber)).padStart(5)} ${String(Math.floor(s.provisions)).padStart(5)} ${String(Math.floor(s.gold)).padStart(5)} ${String(totalUnits).padStart(5)} ${String(s.buildings.CITADEL.level).padStart(3)} ${String(Math.round(s.idleTicks/TOTAL_TICKS*100) + '%').padStart(5)} ${String(s.raidGold).padStart(6)}`
  );
}
