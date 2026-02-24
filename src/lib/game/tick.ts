import { Prisma } from '@prisma/client'
import { prisma } from '../db'
import {
  BASE_ORE_PER_TICK,
  BASE_PROVISIONS_PER_TICK,
  BASE_GOLD_PER_TICK,
  BASE_MANA_PER_TICK,
  TICK_INTERVAL_MS,
  MINE_LEVEL_MULTIPLIERS,
  CROP_MASTERY_MULTIPLIERS,
} from './constants'
import { resolveCombat } from './combat'
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
      where: { playerId, status: { in: ['MARCHING', 'RETURNING'] } },
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
    const provisionsDelta =
      BASE_PROVISIONS_PER_TICK * cropMultiplier * tickMultiplier
    const goldDelta = BASE_GOLD_PER_TICK * tickMultiplier
    const manaDelta = manaDiscovered
      ? BASE_MANA_PER_TICK * tickMultiplier
      : 0

    // Apply deltas, capping at resource caps.
    const newOre = Math.min(resources.ore + oreDelta, resources.oreCap)
    const newProvisions = Math.min(
      resources.provisions + provisionsDelta,
      resources.provisionsCap,
    )
    const newGold = Math.min(resources.gold + goldDelta, resources.goldCap)
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
        // Return scout units to garrison if this was a scout mission
        if (army.name.startsWith('Scout Mission')) {
          const fromSettlement = settlements.find(
            (s) => s.tileId === army.fromTileId,
          )
          if (fromSettlement) {
            const existingScout = fromSettlement.settlementUnits.find(
              (u) => u.unitType === 'SCOUT',
            )
            if (existingScout) {
              await tx.settlementUnits.update({
                where: { id: existingScout.id },
                data: { quantity: existingScout.quantity + 1 },
              })
              existingScout.quantity += 1
            } else {
              const created = await tx.settlementUnits.create({
                data: {
                  settlementId: fromSettlement.id,
                  unitType: 'SCOUT',
                  quantity: 1,
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

      // Load destination tile with NPC faction data
      const destTile = army.toTileId
        ? await tx.mapTile.findUnique({
            where: { id: army.toTileId },
            include: { npcFaction: true },
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
                resourceEstimate: { ore: 0, provisions: 0, gold: 0 },
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
          if (result.loot.ore > 0 || result.loot.provisions > 0 || result.loot.gold > 0) {
            await tx.playerResources.update({
              where: { playerId },
              data: {
                ore: { increment: result.loot.ore },
                provisions: { increment: result.loot.provisions },
                gold: { increment: result.loot.gold },
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
                attackerLosses: result.attackerLosses,
                defenderLosses: result.defenderLosses,
                loot: result.loot,
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
        mana: newMana,
        lastTickAt: now,
      },
    })
  })
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
