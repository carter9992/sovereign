import { NextResponse } from 'next/server'
import { getPlayerFromRequest } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  UNIT_TRAINING_COSTS,
  TUTORIAL_STEPS,
} from '@/lib/game/constants'
import type { UnitType } from '@/lib/game/constants'

const VALID_UNIT_TYPES: UnitType[] = [
  'INFANTRY',
  'ARCHER',
  'HEAVY_INFANTRY',
  'WARDEN',
  'CARAVAN',
  'SCOUT',
  'CAVALRY',
]

export async function POST(request: Request) {
  try {
    const player = await getPlayerFromRequest(request)
    if (!player) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { settlementId, unitType, quantity } = body

    if (!settlementId || !unitType || !quantity) {
      return NextResponse.json(
        { error: 'settlementId, unitType, and quantity are required' },
        { status: 400 },
      )
    }

    if (!VALID_UNIT_TYPES.includes(unitType as UnitType)) {
      return NextResponse.json(
        { error: `Invalid unit type: ${unitType}` },
        { status: 400 },
      )
    }

    if (typeof quantity !== 'number' || quantity < 1 || !Number.isInteger(quantity)) {
      return NextResponse.json(
        { error: 'quantity must be a positive integer' },
        { status: 400 },
      )
    }

    // Verify settlement ownership and barracks
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

    const barracks = settlement.buildings.find(
      (b) => b.type === 'BARRACKS' && b.isBuilt,
    )

    if (!barracks) {
      return NextResponse.json(
        { error: 'Barracks must be built to train units' },
        { status: 400 },
      )
    }

    // Check unit requirements
    const unitCost = UNIT_TRAINING_COSTS[unitType as UnitType]
    if (!unitCost) {
      return NextResponse.json(
        { error: `No training data for ${unitType}` },
        { status: 400 },
      )
    }

    if (unitCost.requires) {
      const requires = unitCost.requires as Record<string, number>

      // Load research states for research checks
      const researchStates = await prisma.researchState.findMany({
        where: { playerId: player.id },
      })

      for (const [reqKey, reqLevel] of Object.entries(requires)) {
        if (reqKey === 'totalWar') {
          // totalWar = sum of all war tech levels (BALLISTICS + DEFENSE_TRACK + STRATEGY)
          const warTracks = ['BALLISTICS', 'DEFENSE_TRACK', 'STRATEGY']
          const totalWar = researchStates
            .filter((r) => warTracks.includes(r.track))
            .reduce((sum, r) => sum + r.level, 0)

          if (totalWar < reqLevel) {
            return NextResponse.json(
              { error: `Requires total War research level ${reqLevel} (current: ${totalWar})` },
              { status: 400 },
            )
          }
        } else if (reqKey === 'mine') {
          // Mine level check
          const mine = settlement.buildings.find((b) => b.type === 'MINE')
          const mineLevel = mine?.isBuilt ? mine.level : 0

          if (mineLevel < reqLevel) {
            return NextResponse.json(
              { error: `Requires Mine level ${reqLevel} (current: ${mineLevel})` },
              { status: 400 },
            )
          }
        } else {
          // Direct research track check (e.g., BALLISTICS, DEFENSE_TRACK, etc.)
          const researchState = researchStates.find((r) => r.track === reqKey)
          const currentLevel = researchState?.level ?? 0

          if (currentLevel < reqLevel) {
            return NextResponse.json(
              { error: `Requires ${reqKey} research level ${reqLevel} (current: ${currentLevel})` },
              { status: 400 },
            )
          }
        }
      }
    }

    // Check resources
    const resources = player.playerResources
    if (!resources) {
      return NextResponse.json(
        { error: 'Player resources not found' },
        { status: 500 },
      )
    }

    const totalOreCost = unitCost.ore * quantity
    const totalProvisionsCost = unitCost.provisions * quantity
    const totalGoldCost = unitCost.gold * quantity

    if (totalOreCost > resources.ore) {
      return NextResponse.json({ error: 'Not enough ore' }, { status: 400 })
    }
    if (totalProvisionsCost > resources.provisions) {
      return NextResponse.json({ error: 'Not enough provisions' }, { status: 400 })
    }
    if (totalGoldCost > resources.gold) {
      return NextResponse.json({ error: 'Not enough gold' }, { status: 400 })
    }

    // Training time = base time * quantity
    const now = new Date()
    const trainingTimeSeconds = unitCost.timeSeconds * quantity
    const finishAt = new Date(now.getTime() + trainingTimeSeconds * 1000)

    // Deduct resources and create unit queue entry
    const [queueEntry] = await prisma.$transaction([
      prisma.unitQueue.create({
        data: {
          settlementId,
          unitType,
          quantity,
          startedAt: now,
          finishAt,
        },
      }),
      prisma.playerResources.update({
        where: { playerId: player.id },
        data: {
          ore: resources.ore - totalOreCost,
          provisions: resources.provisions - totalProvisionsCost,
          gold: resources.gold - totalGoldCost,
        },
      }),
    ])

    // Tutorial progression: training infantry advances to step 6
    if (
      unitType === 'INFANTRY' &&
      player.tutorialStep < TUTORIAL_STEPS.TRAIN_INFANTRY
    ) {
      await prisma.player.update({
        where: { id: player.id },
        data: { tutorialStep: TUTORIAL_STEPS.TRAIN_INFANTRY },
      })
    }

    return NextResponse.json({
      queueEntry,
      message: `Training ${quantity}x ${unitType}. Completes at ${finishAt.toISOString()}`,
    })
  } catch (error) {
    console.error('[Train] Error:', error)
    return NextResponse.json(
      { error: 'Failed to train units' },
      { status: 500 },
    )
  }
}
