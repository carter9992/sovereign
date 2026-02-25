import { NextResponse } from 'next/server'
import { getPlayerFromRequest } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  BUILDING_BUILD_TIMES,
  BUILDING_BUILD_COSTS,
  MINE_UPGRADE_COSTS,
  CITADEL_UPGRADE_COSTS,
  STORAGE_UPGRADE_COSTS,
  SAWMILL_UPGRADE_COSTS,
  BARRACKS_UPGRADE_COSTS,
  FARM_UPGRADE_COSTS,
  TUTORIAL_STEPS,
} from '@/lib/game/constants'

type BuildingType = 'SAWMILL' | 'FARM' | 'MINE' | 'OBSERVATORY' | 'BARRACKS' | 'STORAGE'
type UpgradeableType = 'MINE' | 'CITADEL' | 'STORAGE' | 'SAWMILL' | 'BARRACKS' | 'FARM'

export async function POST(request: Request) {
  try {
    const player = await getPlayerFromRequest(request)
    if (!player) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { settlementId, buildingType, action } = body

    if (!settlementId || !buildingType) {
      return NextResponse.json(
        { error: 'settlementId and buildingType are required' },
        { status: 400 },
      )
    }

    // Verify settlement ownership
    const settlement = await prisma.settlement.findFirst({
      where: { id: settlementId, playerId: player.id },
      include: { buildings: true },
    })

    if (!settlement) {
      return NextResponse.json(
        { error: 'Settlement not found or not owned by you' },
        { status: 404 },
      )
    }

    const building = settlement.buildings.find((b) => b.type === buildingType)
    if (!building) {
      return NextResponse.json(
        { error: `Building type ${buildingType} not found in settlement` },
        { status: 404 },
      )
    }

    // Check if building is already upgrading
    if (building.upgradeFinishAt && building.upgradeFinishAt > new Date()) {
      return NextResponse.json(
        { error: 'Building is already being constructed/upgraded' },
        { status: 400 },
      )
    }

    const resources = player.playerResources
    if (!resources) {
      return NextResponse.json(
        { error: 'Player resources not found' },
        { status: 500 },
      )
    }

    const now = new Date()

    if (action === 'upgrade') {
      // ---------------------------------------------------------------
      // UPGRADE existing building
      // ---------------------------------------------------------------
      if (!building.isBuilt) {
        return NextResponse.json(
          { error: 'Building must be built before upgrading' },
          { status: 400 },
        )
      }

      const nextLevel = building.level + 1
      let cost: { ore?: number; provisions?: number; gold?: number; lumber?: number; mana?: number; timeSeconds: number } | undefined

      if (buildingType === 'CITADEL') {
        cost = (CITADEL_UPGRADE_COSTS as Record<number, typeof cost>)[nextLevel]
      } else if (buildingType === 'MINE') {
        cost = (MINE_UPGRADE_COSTS as Record<number, typeof cost>)[nextLevel]
      } else if (buildingType === 'STORAGE') {
        cost = (STORAGE_UPGRADE_COSTS as Record<number, typeof cost>)[nextLevel]
      } else if (buildingType === 'SAWMILL') {
        cost = (SAWMILL_UPGRADE_COSTS as Record<number, typeof cost>)[nextLevel]
      } else if (buildingType === 'BARRACKS') {
        cost = (BARRACKS_UPGRADE_COSTS as Record<number, typeof cost>)[nextLevel]
      } else if (buildingType === 'FARM') {
        cost = (FARM_UPGRADE_COSTS as Record<number, typeof cost>)[nextLevel]
      } else {
        return NextResponse.json(
          { error: `Building type ${buildingType} cannot be upgraded` },
          { status: 400 },
        )
      }

      if (!cost) {
        return NextResponse.json(
          { error: `No upgrade available for ${buildingType} to level ${nextLevel}` },
          { status: 400 },
        )
      }

      // Check resource costs
      if ((cost.ore ?? 0) > resources.ore) {
        return NextResponse.json({ error: 'Not enough ore' }, { status: 400 })
      }
      if ((cost.provisions ?? 0) > resources.provisions) {
        return NextResponse.json({ error: 'Not enough provisions' }, { status: 400 })
      }
      if ((cost.gold ?? 0) > resources.gold) {
        return NextResponse.json({ error: 'Not enough gold' }, { status: 400 })
      }
      if ((cost.lumber ?? 0) > resources.lumber) {
        return NextResponse.json({ error: 'Not enough lumber' }, { status: 400 })
      }
      if ((cost.mana ?? 0) > resources.mana) {
        return NextResponse.json({ error: 'Not enough mana' }, { status: 400 })
      }

      const finishAt = new Date(now.getTime() + cost.timeSeconds * 1000)

      // Deduct resources and start upgrade in a transaction
      const [updatedBuilding] = await prisma.$transaction([
        prisma.building.update({
          where: { id: building.id },
          data: {
            upgradeStartedAt: now,
            upgradeFinishAt: finishAt,
          },
        }),
        prisma.playerResources.update({
          where: { playerId: player.id },
          data: {
            ore: resources.ore - (cost.ore ?? 0),
            provisions: resources.provisions - (cost.provisions ?? 0),
            gold: resources.gold - (cost.gold ?? 0),
            lumber: resources.lumber - (cost.lumber ?? 0),
            mana: resources.mana - (cost.mana ?? 0),
          },
        }),
      ])

      return NextResponse.json({ building: updatedBuilding })
    } else {
      // ---------------------------------------------------------------
      // NEW BUILD (initial construction)
      // ---------------------------------------------------------------
      if (building.isBuilt) {
        return NextResponse.json(
          { error: 'Building is already built' },
          { status: 400 },
        )
      }

      // Already constructing
      if (building.upgradeFinishAt && building.upgradeFinishAt > now) {
        return NextResponse.json(
          { error: 'Building is already under construction' },
          { status: 400 },
        )
      }

      const validTypes: BuildingType[] = ['SAWMILL', 'FARM', 'MINE', 'OBSERVATORY', 'BARRACKS', 'STORAGE']
      if (!validTypes.includes(buildingType as BuildingType)) {
        return NextResponse.json(
          { error: `Invalid building type: ${buildingType}` },
          { status: 400 },
        )
      }

      const buildCost = BUILDING_BUILD_COSTS[buildingType as BuildingType]
      const buildTimeSeconds = BUILDING_BUILD_TIMES[buildingType as keyof typeof BUILDING_BUILD_TIMES]

      if (!buildCost || !buildTimeSeconds) {
        return NextResponse.json(
          { error: `No build data for ${buildingType}` },
          { status: 400 },
        )
      }

      // Check resource costs
      if ((buildCost.ore ?? 0) > resources.ore) {
        return NextResponse.json({ error: 'Not enough ore' }, { status: 400 })
      }
      if ((buildCost.provisions ?? 0) > resources.provisions) {
        return NextResponse.json({ error: 'Not enough provisions' }, { status: 400 })
      }
      if ((buildCost.gold ?? 0) > resources.gold) {
        return NextResponse.json({ error: 'Not enough gold' }, { status: 400 })
      }
      if ((buildCost.lumber ?? 0) > resources.lumber) {
        return NextResponse.json({ error: 'Not enough lumber' }, { status: 400 })
      }

      const finishAt = new Date(now.getTime() + buildTimeSeconds * 1000)

      const [updatedBuilding] = await prisma.$transaction([
        prisma.building.update({
          where: { id: building.id },
          data: {
            upgradeStartedAt: now,
            upgradeFinishAt: finishAt,
          },
        }),
        prisma.playerResources.update({
          where: { playerId: player.id },
          data: {
            ore: resources.ore - (buildCost.ore ?? 0),
            provisions: resources.provisions - (buildCost.provisions ?? 0),
            gold: resources.gold - (buildCost.gold ?? 0),
            lumber: resources.lumber - (buildCost.lumber ?? 0),
          },
        }),
      ])

      // Tutorial progression
      const tutorialAdvance: Record<string, number> = {
        SAWMILL: TUTORIAL_STEPS.BUILD_SAWMILL,
        FARM: TUTORIAL_STEPS.BUILD_FARM,
        MINE: TUTORIAL_STEPS.BUILD_MINE,
        OBSERVATORY: TUTORIAL_STEPS.BUILD_OBSERVATORY,
        BARRACKS: TUTORIAL_STEPS.BUILD_BARRACKS,
      }

      const nextStep = tutorialAdvance[buildingType]
      if (nextStep !== undefined && player.tutorialStep < nextStep) {
        await prisma.player.update({
          where: { id: player.id },
          data: { tutorialStep: nextStep },
        })
      }

      return NextResponse.json({ building: updatedBuilding })
    }
  } catch (error) {
    console.error('[Build] Error:', error)
    return NextResponse.json(
      { error: 'Failed to process build request' },
      { status: 500 },
    )
  }
}
