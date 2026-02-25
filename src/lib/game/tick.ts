import { Prisma } from '@prisma/client'
import { prisma } from '../db'
import {
  BASE_ORE_PER_TICK,
  BASE_PROVISIONS_PER_TICK,
  BASE_GOLD_PER_TICK,
  BASE_LUMBER_PER_TICK,
  BASE_MANA_PER_TICK,
  TICK_INTERVAL_MS,
  MINE_LEVEL_MULTIPLIERS,
  CROP_MASTERY_MULTIPLIERS,
  SAWMILL_BASE_PER_TICK,
  SAWMILL_LEVEL_MULTIPLIERS,
  FORESTRY_MULTIPLIERS,
  FARM_LEVEL_MULTIPLIERS,
  UNIT_UPKEEP_PER_TICK,
  UNIT_STATS,
  PVP_LOOT_PERCENT,
  PROTECTION_DURATION_MS,
} from './constants'
import type { UnitType } from './constants'
import { resolveCombat } from './combat'
import type { ArmyForCombat } from './combat'
import { generateNPCDefenders, generateScoutEstimate } from './npc'

/** Minimum elapsed time (ms) before we process another tick for a player. */
const DEBOUNCE_MS = 5_000

/**
 * Processes a single game tick for one player.
 *
 * This is the core economic and production loop. It:
 *   1. Accrues resources based on buildings and elapsed time
 *   2. Completes finished building upgrades
 *   3. Completes finished research
 *   4. Completes finished unit training queues
 *   5. Resolves army arrivals
 *   6. Stamps lastTickAt
 *
 * Everything runs inside a single Prisma interactive transaction to
 * guarantee consistency.
 */
export async function processPlayerTick(playerId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const now = new Date()

    // ------------------------------------------------------------------
    // 1. Load player state
    // ------------------------------------------------------------------

    const resources = await tx.playerResources.findUnique({
      where: { playerId },
    })

    if (!resources) {
      return // Player has no resource record yet; nothing to tick.
    }

    // ------------------------------------------------------------------
    // 2. Calculate elapsed time & debounce
    // ------------------------------------------------------------------

    const elapsedMs = now.getTime() - resources.lastTickAt.getTime()

    if (elapsedMs < DEBOUNCE_MS) {
      return // Too soon since last tick.
    }

    const tickMultiplier = elapsedMs / TICK_INTERVAL_MS

    // ------------------------------------------------------------------
    // 3. Load settlements, buildings, research, queues, armies
    // ------------------------------------------------------------------

    const settlements = await tx.settlement.findMany({
      where: { playerId },
      include: {
        buildings: true,
        unitQueues: true,
        settlementUnits: true,
      },
    })

    const activeResearch = await tx.activeResearch.findUnique({
      where: { playerId },
    })

    const researchStates = await tx.researchState.findMany({
      where: { playerId },
    })

    const armies = await tx.army.findMany({
      where: { playerId, status: { in: ['MARCHING', 'RETURNING', 'IDLE'] } },
      include: { armyUnits: true },
    })

    // ------------------------------------------------------------------
    // 4. Accrue resources
    // ------------------------------------------------------------------

    // Gather all buildings across all settlements into a flat list.
    const allBuildings = settlements.flatMap((s) => s.buildings)

    // Determine mine state for ore production.
    const mine = allBuildings.find((b) => b.type === 'MINE')
    const mineIsUpgrading =
      mine?.upgradeFinishAt != null && mine.upgradeFinishAt > now
    const mineLevel = mine?.level ?? 0
    const mineMultiplier =
      (MINE_LEVEL_MULTIPLIERS as Record<number, number>)[mineLevel] ?? 1

    // Determine crop mastery from research.
    const cropMasteryState = researchStates.find(
      (r) => r.track === 'CROP_MASTERY',
    )
    const cropMasteryLevel = cropMasteryState?.level ?? 0
    const cropMultiplier =
      (CROP_MASTERY_MULTIPLIERS as Record<number, number>)[cropMasteryLevel] ?? 1

    // Determine Sawmill state for lumber production (mirrors mine pattern).
    const sawmill = allBuildings.find((b) => b.type === 'SAWMILL')
    const sawmillIsUpgrading =
      sawmill?.upgradeFinishAt != null && sawmill.upgradeFinishAt > now
    const sawmillLevel = sawmill?.level ?? 0
    const sawmillMultiplier =
      (SAWMILL_LEVEL_MULTIPLIERS as Record<number, number>)[sawmillLevel] ?? 1

    // Determine forestry research multiplier.
    const forestryState = researchStates.find(
      (r) => r.track === 'FORESTRY',
    )
    const forestryLevel = forestryState?.level ?? 0
    const forestryMultiplier =
      (FORESTRY_MULTIPLIERS as Record<number, number>)[forestryLevel] ?? 1

    // Determine farm state for provisions production.
    const farm = allBuildings.find((b) => b.type === 'FARM')
    const farmIsUpgrading =
      farm?.upgradeFinishAt != null && farm.upgradeFinishAt > now
    const farmLevel = farm?.level ?? 0
    const farmMultiplier =
      (FARM_LEVEL_MULTIPLIERS as Record<number, number>)[farmLevel] ?? 1

    // Determine mana eligibility: observatory must be built AND mana must
    // be "discovered" (player owns or is adjacent to a mana node tile, or
    // has researched HOLY/NECROTIC). We simplify here to: observatory is
    // built and player has a manaCap > 0.
    const observatory = allBuildings.find(
      (b) => b.type === 'OBSERVATORY' && b.isBuilt,
    )
    const manaDiscovered = observatory != null && resources.manaCap > 0

    // Calculate deltas.
    const oreDelta = mineIsUpgrading
      ? 0
      : BASE_ORE_PER_TICK * mineMultiplier * tickMultiplier
    const provisionsProduction = farmIsUpgrading
      ? 0
      : BASE_PROVISIONS_PER_TICK * farmMultiplier * cropMultiplier * tickMultiplier
    const goldDelta = BASE_GOLD_PER_TICK * tickMultiplier
    const lumberDelta =
      sawmill?.isBuilt && !sawmillIsUpgrading
        ? SAWMILL_BASE_PER_TICK * sawmillMultiplier * forestryMultiplier * tickMultiplier
        : BASE_LUMBER_PER_TICK * tickMultiplier
    const manaDelta = manaDiscovered
      ? BASE_MANA_PER_TICK * tickMultiplier
      : 0

    // Calculate unit upkeep from garrison + armies.
    let totalUpkeep = 0
    for (const settlement of settlements) {
      for (const unit of settlement.settlementUnits) {
        const upkeep = (UNIT_UPKEEP_PER_TICK as Record<string, number>)[unit.unitType] ?? 0
        totalUpkeep += unit.quantity * upkeep
      }
    }
    for (const army of armies) {
      for (const unit of army.armyUnits) {
        const upkeep = (UNIT_UPKEEP_PER_TICK as Record<string, number>)[unit.unitType] ?? 0
        totalUpkeep += unit.quantity * upkeep
      }
    }
    const upkeepDrain = totalUpkeep * tickMultiplier
    const provisionsDelta = provisionsProduction - upkeepDrain

    // Apply deltas, capping at resource caps.
    const newOre = Math.min(resources.ore + oreDelta, resources.oreCap)
    const newProvisions = Math.max(0, Math.min(
      resources.provisions + provisionsDelta,
      resources.provisionsCap,
    ))
    const newGold = Math.min(resources.gold + goldDelta, resources.goldCap)
    const newLumber = Math.min(
      resources.lumber + lumberDelta,
      resources.lumberCap,
    )
    const newMana = Math.min(resources.mana + manaDelta, resources.manaCap)

    // ------------------------------------------------------------------
    // 5. Complete building upgrades
    // ------------------------------------------------------------------

    const completedBuildings = allBuildings.filter(
      (b) => b.upgradeFinishAt != null && b.upgradeFinishAt <= now,
    )

    for (const building of completedBuildings) {
      await tx.building.update({
        where: { id: building.id },
        data: {
          isBuilt: true,
          level: building.level + 1,
          upgradeStartedAt: null,
          upgradeFinishAt: null,
        },
      })
    }

    // ------------------------------------------------------------------
    // 6. Complete research
    // ------------------------------------------------------------------

    if (activeResearch && activeResearch.finishAt <= now) {
      // Upsert the research state — increment if exists, create at level 1
      // if first time.
      const existingState = researchStates.find(
        (r) => r.track === activeResearch.track,
      )

      if (existingState) {
        await tx.researchState.update({
          where: { id: existingState.id },
          data: { level: existingState.level + 1 },
        })
      } else {
        await tx.researchState.create({
          data: {
            playerId,
            track: activeResearch.track,
            level: 1,
          },
        })
      }

      await tx.activeResearch.delete({
        where: { id: activeResearch.id },
      })

      await tx.gameEvent.create({
        data: {
          playerId,
          type: 'RESEARCH_COMPLETE',
          message: `Research in ${activeResearch.track} has completed.`,
          data: JSON.stringify({
            track: activeResearch.track,
            newLevel: (existingState?.level ?? 0) + 1,
          }),
        },
      })
    }

    // ------------------------------------------------------------------
    // 7. Complete unit training queues
    // ------------------------------------------------------------------

    for (const settlement of settlements) {
      const completedQueues = settlement.unitQueues.filter(
        (q) => q.finishAt <= now,
      )

      for (const queue of completedQueues) {
        // Find or create the SettlementUnits record for this unit type.
        const existingUnits = settlement.settlementUnits.find(
          (u) => u.unitType === queue.unitType,
        )

        if (existingUnits) {
          await tx.settlementUnits.update({
            where: { id: existingUnits.id },
            data: { quantity: existingUnits.quantity + queue.quantity },
          })
          // Update in-memory reference so subsequent queue completions
          // for the same unit type in the same settlement stack correctly.
          existingUnits.quantity += queue.quantity
        } else {
          const created = await tx.settlementUnits.create({
            data: {
              settlementId: settlement.id,
              unitType: queue.unitType,
              quantity: queue.quantity,
            },
          })
          // Push into in-memory list for subsequent iterations.
          settlement.settlementUnits.push(created)
        }

        await tx.unitQueue.delete({
          where: { id: queue.id },
        })

        await tx.gameEvent.create({
          data: {
            playerId,
            type: 'TRAINING_COMPLETE',
            message: `${queue.quantity}x ${queue.unitType} training complete at ${settlement.name}.`,
            data: JSON.stringify({
              settlementId: settlement.id,
              unitType: queue.unitType,
              quantity: queue.quantity,
            }),
          },
        })
      }
    }

    // ------------------------------------------------------------------
    // 8. Army arrivals
    // ------------------------------------------------------------------

    for (const army of armies) {
      if (army.arrivesAt == null || army.arrivesAt > now) continue

      // --- RETURNING armies: arrive home ---
      if (army.status === 'RETURNING') {
        // Return all surviving units to garrison
        const fromSettlement = settlements.find(
          (s) => s.tileId === army.fromTileId,
        )
        if (fromSettlement) {
          for (const armyUnit of army.armyUnits) {
            if (armyUnit.quantity <= 0) continue
            const existing = fromSettlement.settlementUnits.find(
              (u) => u.unitType === armyUnit.unitType,
            )
            if (existing) {
              await tx.settlementUnits.update({
                where: { id: existing.id },
                data: { quantity: existing.quantity + armyUnit.quantity },
              })
              existing.quantity += armyUnit.quantity
            } else {
              const created = await tx.settlementUnits.create({
                data: {
                  settlementId: fromSettlement.id,
                  unitType: armyUnit.unitType,
                  quantity: armyUnit.quantity,
                },
              })
              fromSettlement.settlementUnits.push(created)
            }
          }
        }

        // Delete the army (it's just a temporary marching entity)
        await tx.armyUnit.deleteMany({ where: { armyId: army.id } })
        await tx.army.delete({ where: { id: army.id } })

        await tx.gameEvent.create({
          data: {
            playerId,
            type: 'ARMY_RETURNED',
            message: `Army "${army.name}" has returned home.`,
            data: JSON.stringify({ armyId: army.id }),
          },
        })
        continue
      }

      // --- MARCHING armies: determine what happens on arrival ---
      const isScoutMission = army.name.startsWith('Scout Mission')

      // Load destination tile with NPC faction and settlement data
      const destTile = army.toTileId
        ? await tx.mapTile.findUnique({
            where: { id: army.toTileId },
            include: {
              npcFaction: true,
              settlements: {
                include: {
                  defenses: true,
                  settlementUnits: true,
                },
              },
            },
          })
        : null

      if (isScoutMission) {
        // ---- Scout Mission Arrival ----
        const faction = destTile?.npcFaction
        const lossChance = faction ? faction.aggressionLevel * 0.05 : 0

        if (Math.random() < lossChance) {
          // Scout lost
          await tx.armyUnit.deleteMany({ where: { armyId: army.id } })
          await tx.army.delete({ where: { id: army.id } })

          await tx.gameEvent.create({
            data: {
              playerId,
              type: 'SCOUT_LOST',
              message: `Scout mission to (${destTile?.x ?? '?'}, ${destTile?.y ?? '?'}) was intercepted. The scout was lost.`,
              data: JSON.stringify({
                toTileId: army.toTileId,
                tileX: destTile?.x,
                tileY: destTile?.y,
              }),
            },
          })
        } else {
          // Scout success — generate report
          const reportData = faction
            ? generateScoutEstimate(faction, destTile?.isHideout ?? false)
            : {
                factionName: 'None',
                estimatedTroops: [],
                hasDefenses: false,
                resourceEstimate: { ore: 0, provisions: 0, gold: 0, lumber: 0 },
              }

          await tx.gameEvent.create({
            data: {
              playerId,
              type: 'SCOUT_REPORT',
              message: `Scout report from (${destTile?.x ?? '?'}, ${destTile?.y ?? '?'}): ${faction ? faction.name + ' forces spotted.' : 'Area is clear.'}`,
              data: JSON.stringify({
                toTileId: army.toTileId,
                tileX: destTile?.x,
                tileY: destTile?.y,
                ...reportData,
              }),
            },
          })

          // Set scout army to RETURNING to home tile
          const departedAt = army.departedAt!
          const originalTripMs = army.arrivesAt!.getTime() - departedAt.getTime()
          const returnArrivesAt = new Date(now.getTime() + originalTripMs)

          await tx.army.update({
            where: { id: army.id },
            data: {
              status: 'RETURNING',
              toTileId: army.fromTileId,
              departedAt: now,
              arrivesAt: returnArrivesAt,
            },
          })
        }
      } else if (destTile?.npcFactionId && destTile.npcFaction) {
        // ---- Combat Arrival (NPC tile) ----
        const faction = destTile.npcFaction
        const npcDefenders = generateNPCDefenders(
          faction,
          destTile.isHideout,
        )

        const attackerArmy = {
          units: army.armyUnits.map((u) => ({
            unitType: u.unitType,
            quantity: u.quantity,
          })),
          provisions: army.provisions,
          isDefending: false,
        }

        const result = resolveCombat(attackerArmy, npcDefenders)

        if (result.attackerWins) {
          // Apply attacker losses
          for (const loss of result.attackerLosses) {
            const armyUnit = army.armyUnits.find(
              (u) => u.unitType === loss.unitType,
            )
            if (armyUnit) {
              const remaining = armyUnit.quantity - loss.lost
              if (remaining <= 0) {
                await tx.armyUnit.delete({ where: { id: armyUnit.id } })
              } else {
                await tx.armyUnit.update({
                  where: { id: armyUnit.id },
                  data: { quantity: remaining },
                })
              }
            }
          }

          // Grant loot to player resources
          if (result.loot.ore > 0 || result.loot.provisions > 0 || result.loot.gold > 0 || result.loot.lumber > 0) {
            await tx.playerResources.update({
              where: { playerId },
              data: {
                ore: { increment: result.loot.ore },
                provisions: { increment: result.loot.provisions },
                gold: { increment: result.loot.gold },
                lumber: { increment: result.loot.lumber },
              },
            })
          }

          // Clear NPC from tile
          await tx.mapTile.update({
            where: { id: destTile.id },
            data: {
              npcFactionId: null,
              isHideout: false,
            },
          })

          // Set army RETURNING
          const departedAt = army.departedAt!
          const originalTripMs = army.arrivesAt!.getTime() - departedAt.getTime()
          const returnArrivesAt = new Date(now.getTime() + originalTripMs)

          await tx.army.update({
            where: { id: army.id },
            data: {
              status: 'RETURNING',
              toTileId: army.fromTileId,
              departedAt: now,
              arrivesAt: returnArrivesAt,
            },
          })

          await tx.gameEvent.create({
            data: {
              playerId,
              type: 'BATTLE_WON',
              message: `Victory! Army "${army.name}" defeated ${faction.name} at (${destTile.x}, ${destTile.y}).`,
              data: JSON.stringify({
                armyId: army.id,
                toTileId: army.toTileId,
                tileX: destTile.x,
                tileY: destTile.y,
                factionName: faction.name,
                isHideout: destTile.isHideout,
                defenderDefenses: npcDefenders.defenseStructures ?? [],
                attackerLosses: result.attackerLosses,
                defenderLosses: result.defenderLosses,
                loot: result.loot,
                phases: result.phases,
              }),
            },
          })
        } else {
          // Attacker lost — army destroyed
          await tx.armyUnit.deleteMany({ where: { armyId: army.id } })
          await tx.army.delete({ where: { id: army.id } })

          await tx.gameEvent.create({
            data: {
              playerId,
              type: 'BATTLE_LOST',
              message: `Defeat! Army "${army.name}" was destroyed by ${faction.name} at (${destTile.x}, ${destTile.y}).`,
              data: JSON.stringify({
                armyId: army.id,
                toTileId: army.toTileId,
                tileX: destTile.x,
                tileY: destTile.y,
                factionName: faction.name,
                attackerLosses: result.attackerLosses,
                defenderLosses: result.defenderLosses,
                phases: result.phases,
              }),
            },
          })
        }
      } else if (
        destTile?.hasSettlement &&
        destTile.ownerId &&
        destTile.ownerId !== playerId
      ) {
        // ---- PvP Combat Arrival (enemy player settlement) ----
        const targetSettlement = destTile.settlements[0]

        // Check protection — if still active, bounce army back
        if (
          targetSettlement?.protectedUntil &&
          targetSettlement.protectedUntil > now
        ) {
          const departedAt = army.departedAt!
          const originalTripMs =
            army.arrivesAt!.getTime() - departedAt.getTime()
          const returnArrivesAt = new Date(now.getTime() + originalTripMs)

          await tx.army.update({
            where: { id: army.id },
            data: {
              status: 'RETURNING',
              toTileId: army.fromTileId,
              departedAt: now,
              arrivesAt: returnArrivesAt,
            },
          })

          await tx.gameEvent.create({
            data: {
              playerId,
              type: 'ARMY_RETURNED',
              message: `Army "${army.name}" could not attack — settlement at (${destTile.x}, ${destTile.y}) is under protection. Returning home.`,
              data: JSON.stringify({
                armyId: army.id,
                toTileId: army.toTileId,
                reason: 'PROTECTION_ACTIVE',
              }),
            },
          })
          continue
        }

        // Build defender army from garrison SettlementUnits + defenses + mana
        const defenderUnits = targetSettlement
          ? targetSettlement.settlementUnits
              .filter((u) => u.quantity > 0)
              .map((u) => ({ unitType: u.unitType, quantity: u.quantity }))
          : []

        const defenseStructures = targetSettlement
          ? targetSettlement.defenses
              .filter((d) => d.level > 0)
              .map((d) => ({ type: d.type, level: d.level }))
          : []

        // Get defender's mana reserve
        const defenderResources = await tx.playerResources.findUnique({
          where: { playerId: destTile.ownerId },
        })
        const defenderMana = defenderResources?.mana ?? 0

        const defenderArmy: ArmyForCombat = {
          units: defenderUnits,
          provisions: 0,
          isDefending: true,
          defenseStructures,
          manaReserve: defenderMana,
        }

        const attackerArmy: ArmyForCombat = {
          units: army.armyUnits.map((u) => ({
            unitType: u.unitType,
            quantity: u.quantity,
          })),
          provisions: army.provisions,
          isDefending: false,
        }

        const result = resolveCombat(attackerArmy, defenderArmy)

        // Calculate PvP loot from defender's actual resources
        const carryCapacity = getCarryCapacityFromArmyUnits(army.armyUnits)
        let loot = { ore: 0, provisions: 0, gold: 0, lumber: 0 }

        if (result.attackerWins && defenderResources && carryCapacity > 0) {
          const rawOre = defenderResources.ore * PVP_LOOT_PERCENT
          const rawProvisions =
            defenderResources.provisions * PVP_LOOT_PERCENT
          const rawGold = defenderResources.gold * PVP_LOOT_PERCENT
          const rawLumber = defenderResources.lumber * PVP_LOOT_PERCENT
          const totalRawLoot = rawOre + rawProvisions + rawGold + rawLumber

          if (totalRawLoot > 0) {
            if (totalRawLoot <= carryCapacity) {
              loot = {
                ore: Math.floor(rawOre),
                provisions: Math.floor(rawProvisions),
                gold: Math.floor(rawGold),
                lumber: Math.floor(rawLumber),
              }
            } else {
              // Distribute proportionally within carry capacity
              const ratio = carryCapacity / totalRawLoot
              loot = {
                ore: Math.floor(rawOre * ratio),
                provisions: Math.floor(rawProvisions * ratio),
                gold: Math.floor(rawGold * ratio),
                lumber: Math.floor(rawLumber * ratio),
              }
            }
          }
        }

        if (result.attackerWins) {
          // Apply attacker losses to army units
          for (const loss of result.attackerLosses) {
            const armyUnit = army.armyUnits.find(
              (u) => u.unitType === loss.unitType,
            )
            if (armyUnit) {
              const remaining = armyUnit.quantity - loss.lost
              if (remaining <= 0) {
                await tx.armyUnit.delete({ where: { id: armyUnit.id } })
              } else {
                await tx.armyUnit.update({
                  where: { id: armyUnit.id },
                  data: { quantity: remaining },
                })
              }
            }
          }

          // Apply defender losses to SettlementUnits
          if (targetSettlement) {
            for (const loss of result.defenderLosses) {
              const sUnit = targetSettlement.settlementUnits.find(
                (u) => u.unitType === loss.unitType,
              )
              if (sUnit) {
                const remaining = sUnit.quantity - loss.lost
                await tx.settlementUnits.update({
                  where: { id: sUnit.id },
                  data: { quantity: Math.max(0, remaining) },
                })
              }
            }

            // Destroy ALL defense structures (level -> 0, cancel upgrades)
            for (const defense of targetSettlement.defenses) {
              if (defense.level > 0) {
                await tx.defense.update({
                  where: { id: defense.id },
                  data: {
                    level: 0,
                    upgradeStartedAt: null,
                    upgradeFinishAt: null,
                  },
                })
              }
            }

            // Set protection on settlement
            await tx.settlement.update({
              where: { id: targetSettlement.id },
              data: {
                protectedUntil: new Date(
                  now.getTime() + PROTECTION_DURATION_MS,
                ),
              },
            })
          }

          // Transfer loot: decrement defender, increment attacker
          if (loot.ore > 0 || loot.provisions > 0 || loot.gold > 0 || loot.lumber > 0) {
            await tx.playerResources.update({
              where: { playerId: destTile.ownerId },
              data: {
                ore: { decrement: loot.ore },
                provisions: { decrement: loot.provisions },
                gold: { decrement: loot.gold },
                lumber: { decrement: loot.lumber },
              },
            })
            await tx.playerResources.update({
              where: { playerId },
              data: {
                ore: { increment: loot.ore },
                provisions: { increment: loot.provisions },
                gold: { increment: loot.gold },
                lumber: { increment: loot.lumber },
              },
            })
          }

          // Set army RETURNING
          const departedAt = army.departedAt!
          const originalTripMs =
            army.arrivesAt!.getTime() - departedAt.getTime()
          const returnArrivesAt = new Date(now.getTime() + originalTripMs)

          await tx.army.update({
            where: { id: army.id },
            data: {
              status: 'RETURNING',
              toTileId: army.fromTileId,
              departedAt: now,
              arrivesAt: returnArrivesAt,
            },
          })

          // Create BATTLE_WON event for attacker
          await tx.gameEvent.create({
            data: {
              playerId,
              type: 'BATTLE_WON',
              message: `Victory! Army "${army.name}" conquered the settlement at (${destTile.x}, ${destTile.y}).`,
              data: JSON.stringify({
                armyId: army.id,
                toTileId: army.toTileId,
                tileX: destTile.x,
                tileY: destTile.y,
                isPvP: true,
                defenderPlayerId: destTile.ownerId,
                attackerLosses: result.attackerLosses,
                defenderLosses: result.defenderLosses,
                loot,
                defensesDestroyed: defenseStructures.length,
                phases: result.phases,
              }),
            },
          })

          // Create SETTLEMENT_ATTACKED event for defender
          await tx.gameEvent.create({
            data: {
              playerId: destTile.ownerId,
              type: 'SETTLEMENT_ATTACKED',
              message: `Your settlement at (${destTile.x}, ${destTile.y}) was attacked and defeated!`,
              data: JSON.stringify({
                tileX: destTile.x,
                tileY: destTile.y,
                attackerPlayerId: playerId,
                defenderLosses: result.defenderLosses,
                lootStolen: loot,
                defensesDestroyed: defenseStructures.length,
                protectedUntil: new Date(
                  now.getTime() + PROTECTION_DURATION_MS,
                ).toISOString(),
              }),
            },
          })
        } else {
          // Defender wins — attacker army destroyed
          // Apply defender losses to SettlementUnits
          if (targetSettlement) {
            for (const loss of result.defenderLosses) {
              const sUnit = targetSettlement.settlementUnits.find(
                (u) => u.unitType === loss.unitType,
              )
              if (sUnit) {
                const remaining = sUnit.quantity - loss.lost
                await tx.settlementUnits.update({
                  where: { id: sUnit.id },
                  data: { quantity: Math.max(0, remaining) },
                })
              }
            }
          }

          // Delete attacker army
          await tx.armyUnit.deleteMany({ where: { armyId: army.id } })
          await tx.army.delete({ where: { id: army.id } })

          // Create BATTLE_LOST event for attacker
          await tx.gameEvent.create({
            data: {
              playerId,
              type: 'BATTLE_LOST',
              message: `Defeat! Army "${army.name}" was destroyed attacking (${destTile.x}, ${destTile.y}).`,
              data: JSON.stringify({
                armyId: army.id,
                toTileId: army.toTileId,
                tileX: destTile.x,
                tileY: destTile.y,
                isPvP: true,
                defenderPlayerId: destTile.ownerId,
                attackerLosses: result.attackerLosses,
                defenderLosses: result.defenderLosses,
                phases: result.phases,
              }),
            },
          })

          // Create SETTLEMENT_DEFENDED event for defender
          await tx.gameEvent.create({
            data: {
              playerId: destTile.ownerId,
              type: 'SETTLEMENT_DEFENDED',
              message: `Your settlement at (${destTile.x}, ${destTile.y}) successfully repelled an attack!`,
              data: JSON.stringify({
                tileX: destTile.x,
                tileY: destTile.y,
                attackerPlayerId: playerId,
                defenderLosses: result.defenderLosses,
                attackerDestroyed: true,
              }),
            },
          })
        }
      } else {
        // ---- Peaceful Arrival (empty/own tile) ----
        await tx.army.update({
          where: { id: army.id },
          data: { status: 'IDLE' },
        })

        await tx.gameEvent.create({
          data: {
            playerId,
            type: 'ARMY_ARRIVED',
            message: `Army "${army.name}" has arrived at its destination.`,
            data: JSON.stringify({
              armyId: army.id,
              toTileId: army.toTileId,
            }),
          },
        })
      }
    }

    // ------------------------------------------------------------------
    // 9. Update resources & lastTickAt
    // ------------------------------------------------------------------

    await tx.playerResources.update({
      where: { playerId },
      data: {
        ore: newOre,
        provisions: newProvisions,
        gold: newGold,
        lumber: newLumber,
        mana: newMana,
        lastTickAt: now,
      },
    })
  })
}

/**
 * Calculate total carry capacity from army units (for PvP loot).
 */
function getCarryCapacityFromArmyUnits(
  armyUnits: { unitType: string; quantity: number }[],
): number {
  let capacity = 0
  for (const u of armyUnits) {
    const stats = UNIT_STATS[u.unitType as UnitType]
    if (stats && stats.carryCapacity > 0) {
      capacity += stats.carryCapacity * u.quantity
    }
  }
  return capacity
}

/**
 * Runs a tick for every player in the database.
 * Intended for cron-style background processing.
 */
export async function processWorldTick(): Promise<void> {
  const players = await prisma.player.findMany({
    select: { id: true },
  })

  // Process each player sequentially to avoid overwhelming the database
  // with concurrent transactions. For large player counts, consider
  // batching with Promise.allSettled in groups.
  for (const player of players) {
    try {
      await processPlayerTick(player.id)
    } catch (error) {
      // Log but do not let one player's failure abort the entire world tick.
      console.error(
        `[WorldTick] Failed to process tick for player ${player.id}:`,
        error,
      )
    }
  }
}
