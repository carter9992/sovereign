import { NextResponse } from 'next/server'
import { getPlayerFromRequest } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { DEFENSE_UPGRADE_COSTS } from '@/lib/game/constants'
import type { DefenseStructureType } from '@/lib/game/constants'

const VALID_DEFENSE_TYPES: DefenseStructureType[] = [
  'WALLS',
  'GUARD_TOWER',
  'WATCH_TOWER',
  'BALLISTA',
]

export async function POST(request: Request) {
  try {
    const player = await getPlayerFromRequest(request)
    if (!player) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { settlementId, defenseType, action } = body

    if (!settlementId || !defenseType || !action) {
      return NextResponse.json(
        { error: 'settlementId, defenseType, and action are required' },
        { status: 400 },
      )
    }

    if (action !== 'build' && action !== 'upgrade') {
      return NextResponse.json(
        { error: 'action must be "build" or "upgrade"' },
        { status: 400 },
      )
    }

    if (!VALID_DEFENSE_TYPES.includes(defenseType as DefenseStructureType)) {
      return NextResponse.json(
        { error: `Invalid defense type: ${defenseType}` },
        { status: 400 },
      )
    }

    // Verify settlement ownership
    const settlement = await prisma.settlement.findFirst({
      where: { id: settlementId, playerId: player.id },
      include: { defenses: true },
    })

    if (!settlement) {
      return NextResponse.json(
        { error: 'Settlement not found or not owned by you' },
        { status: 404 },
      )
    }

    const resources = player.playerResources
    if (!resources) {
      return NextResponse.json(
        { error: 'Player resources not found' },
        { status: 500 },
      )
    }

    // Check BALLISTA requirements: Ballistics 4 + Defense 3
    if (defenseType === 'BALLISTA') {
      const researchStates = await prisma.researchState.findMany({
        where: { playerId: player.id },
      })

      const ballisticsLevel =
        researchStates.find((r) => r.track === 'BALLISTICS')?.level ?? 0
      const defenseTrackLevel =
        researchStates.find((r) => r.track === 'DEFENSE_TRACK')?.level ?? 0

      if (ballisticsLevel < 4) {
        return NextResponse.json(
          { error: 'BALLISTA requires Ballistics research level 4' },
          { status: 400 },
        )
      }
      if (defenseTrackLevel < 3) {
        return NextResponse.json(
          { error: 'BALLISTA requires Defense research level 3' },
          { status: 400 },
        )
      }
    }

    const now = new Date()
    const existingDefense = settlement.defenses.find(
      (d) => d.type === defenseType,
    )

    if (action === 'build') {
      // ---------------------------------------------------------------
      // BUILD new defense structure (level 0 -> 1)
      // ---------------------------------------------------------------
      if (existingDefense && existingDefense.level > 0) {
        return NextResponse.json(
          { error: `${defenseType} already exists. Use action "upgrade" instead.` },
          { status: 400 },
        )
      }

      // If already in progress
      if (
        existingDefense?.upgradeFinishAt &&
        existingDefense.upgradeFinishAt > now
      ) {
        return NextResponse.json(
          { error: `${defenseType} is already being built` },
          { status: 400 },
        )
      }

      const typeCosts = DEFENSE_UPGRADE_COSTS[defenseType as DefenseStructureType]
      const cost = (typeCosts as Record<number, { ore?: number; provisions?: number; gold?: number; lumber?: number; mana?: number; timeSeconds: number }>)[1]

      if (!cost) {
        return NextResponse.json(
          { error: `No build cost defined for ${defenseType} level 1` },
          { status: 400 },
        )
      }

      // Check resources
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

      const finishAt = new Date(now.getTime() + cost.timeSeconds * 1000)

      if (existingDefense) {
        // Defense record exists at level 0, update it
        const [updatedDefense] = await prisma.$transaction([
          prisma.defense.update({
            where: { id: existingDefense.id },
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
            },
          }),
        ])

        return NextResponse.json({ defense: updatedDefense })
      } else {
        // Create new defense record
        const [newDefense] = await prisma.$transaction([
          prisma.defense.create({
            data: {
              settlementId,
              type: defenseType,
              level: 0,
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
            },
          }),
        ])

        return NextResponse.json({ defense: newDefense })
      }
    } else {
      // ---------------------------------------------------------------
      // UPGRADE existing defense
      // ---------------------------------------------------------------
      if (!existingDefense || existingDefense.level === 0) {
        return NextResponse.json(
          { error: `${defenseType} must be built before upgrading` },
          { status: 400 },
        )
      }

      if (
        existingDefense.upgradeFinishAt &&
        existingDefense.upgradeFinishAt > now
      ) {
        return NextResponse.json(
          { error: `${defenseType} is already being upgraded` },
          { status: 400 },
        )
      }

      const nextLevel = existingDefense.level + 1
      const typeCosts = DEFENSE_UPGRADE_COSTS[defenseType as DefenseStructureType]
      const cost = (typeCosts as Record<number, { ore?: number; provisions?: number; gold?: number; lumber?: number; mana?: number; timeSeconds: number }>)[nextLevel]

      if (!cost) {
        return NextResponse.json(
          { error: `No upgrade available for ${defenseType} to level ${nextLevel}` },
          { status: 400 },
        )
      }

      // Check resources
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

      const finishAt = new Date(now.getTime() + cost.timeSeconds * 1000)

      const [updatedDefense] = await prisma.$transaction([
        prisma.defense.update({
          where: { id: existingDefense.id },
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
          },
        }),
      ])

      return NextResponse.json({ defense: updatedDefense })
    }
  } catch (error) {
    console.error('[Defense] Error:', error)
    return NextResponse.json(
      { error: 'Failed to process defense request' },
      { status: 500 },
    )
  }
}
