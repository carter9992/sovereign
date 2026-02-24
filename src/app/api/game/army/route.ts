import { NextResponse } from 'next/server'
import { getPlayerFromRequest } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { UNIT_STATS, SCOUT_CAP_BY_CITADEL } from '@/lib/game/constants'
import type { UnitType } from '@/lib/game/constants'

export async function GET(request: Request) {
  try {
    const player = await getPlayerFromRequest(request)
    if (!player) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const armies = await prisma.army.findMany({
      where: { playerId: player.id },
      include: { armyUnits: true },
    })

    return NextResponse.json({ armies })
  } catch (error) {
    console.error('[Army GET] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch armies' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const player = await getPlayerFromRequest(request)
    if (!player) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action } = body

    if (!action) {
      return NextResponse.json(
        { error: 'action is required' },
        { status: 400 },
      )
    }

    switch (action) {
      case 'create':
        return await handleCreate(player, body)
      case 'march':
        return await handleMarch(player, body)
      case 'recall':
        return await handleRecall(player, body)
      case 'scout':
        return await handleScout(player, body)
      default:
        return NextResponse.json(
          { error: `Invalid action: ${action}` },
          { status: 400 },
        )
    }
  } catch (error) {
    console.error('[Army POST] Error:', error)
    return NextResponse.json(
      { error: 'Failed to process army request' },
      { status: 500 },
    )
  }
}

// -----------------------------------------------------------------------
// CREATE army from settlement units
// -----------------------------------------------------------------------
async function handleCreate(
  player: { id: string; playerResources: { id: string } | null },
  body: {
    name?: string
    settlementId?: string
    unitSelections?: { unitType: string; quantity: number }[]
  },
) {
  const { name, settlementId, unitSelections } = body

  if (!settlementId || !unitSelections || !Array.isArray(unitSelections) || unitSelections.length === 0) {
    return NextResponse.json(
      { error: 'settlementId and unitSelections are required' },
      { status: 400 },
    )
  }

  // Verify settlement ownership
  const settlement = await prisma.settlement.findFirst({
    where: { id: settlementId, playerId: player.id },
    include: { settlementUnits: true },
  })

  if (!settlement) {
    return NextResponse.json(
      { error: 'Settlement not found or not owned by you' },
      { status: 404 },
    )
  }

  // Validate that the settlement has enough units
  for (const sel of unitSelections) {
    if (!sel.unitType || !sel.quantity || sel.quantity < 1) {
      return NextResponse.json(
        { error: 'Each unitSelection must have unitType and quantity >= 1' },
        { status: 400 },
      )
    }

    const settlementUnit = settlement.settlementUnits.find(
      (u) => u.unitType === sel.unitType,
    )
    const available = settlementUnit?.quantity ?? 0

    if (sel.quantity > available) {
      return NextResponse.json(
        {
          error: `Not enough ${sel.unitType}. Available: ${available}, requested: ${sel.quantity}`,
        },
        { status: 400 },
      )
    }
  }

  // Create the army in a transaction
  const army = await prisma.$transaction(async (tx) => {
    // Deduct units from settlement
    for (const sel of unitSelections) {
      const settlementUnit = settlement.settlementUnits.find(
        (u) => u.unitType === sel.unitType,
      )!

      await tx.settlementUnits.update({
        where: { id: settlementUnit.id },
        data: { quantity: settlementUnit.quantity - sel.quantity },
      })
    }

    // Create army
    const newArmy = await tx.army.create({
      data: {
        playerId: player.id,
        name: name || `Army ${Date.now().toString(36)}`,
        status: 'IDLE',
        fromTileId: settlement.tileId,
        provisions: 0,
        armyUnits: {
          create: unitSelections.map((sel) => ({
            unitType: sel.unitType,
            quantity: sel.quantity,
          })),
        },
      },
      include: { armyUnits: true },
    })

    return newArmy
  })

  return NextResponse.json({ army })
}

// -----------------------------------------------------------------------
// MARCH army to a tile
// -----------------------------------------------------------------------
async function handleMarch(
  player: { id: string; playerResources: { id: string } | null },
  body: { armyId?: string; toTileId?: string },
) {
  const { armyId, toTileId } = body

  if (!armyId || !toTileId) {
    return NextResponse.json(
      { error: 'armyId and toTileId are required' },
      { status: 400 },
    )
  }

  const army = await prisma.army.findFirst({
    where: { id: armyId, playerId: player.id },
    include: { armyUnits: true, fromTile: true },
  })

  if (!army) {
    return NextResponse.json(
      { error: 'Army not found or not owned by you' },
      { status: 404 },
    )
  }

  if (army.status !== 'IDLE') {
    return NextResponse.json(
      { error: `Army is currently ${army.status} and cannot march` },
      { status: 400 },
    )
  }

  // Get destination tile
  const toTile = await prisma.mapTile.findUnique({
    where: { id: toTileId },
  })

  if (!toTile) {
    return NextResponse.json(
      { error: 'Destination tile not found' },
      { status: 404 },
    )
  }

  // Calculate distance (Euclidean)
  const dx = toTile.x - army.fromTile.x
  const dy = toTile.y - army.fromTile.y
  const distance = Math.sqrt(dx * dx + dy * dy)

  // Slowest unit determines army speed
  let slowestSpeed = Infinity
  for (const unit of army.armyUnits) {
    const stats = UNIT_STATS[unit.unitType as UnitType]
    if (stats && stats.speed < slowestSpeed) {
      slowestSpeed = stats.speed
    }
  }

  if (slowestSpeed <= 0 || slowestSpeed === Infinity) {
    slowestSpeed = 0.5 // default speed
  }

  // Travel time in minutes = distance / speed (tiles per minute)
  const travelTimeMinutes = distance / slowestSpeed
  const travelTimeMs = travelTimeMinutes * 60 * 1000

  const now = new Date()
  const arrivesAt = new Date(now.getTime() + travelTimeMs)

  const updatedArmy = await prisma.army.update({
    where: { id: armyId },
    data: {
      status: 'MARCHING',
      toTileId,
      departedAt: now,
      arrivesAt,
    },
    include: { armyUnits: true },
  })

  return NextResponse.json({
    army: updatedArmy,
    travelTimeMinutes: Math.round(travelTimeMinutes * 10) / 10,
    distance: Math.round(distance * 10) / 10,
  })
}

// -----------------------------------------------------------------------
// RECALL a marching army
// -----------------------------------------------------------------------
async function handleRecall(
  player: { id: string; playerResources: { id: string } | null },
  body: { armyId?: string },
) {
  const { armyId } = body

  if (!armyId) {
    return NextResponse.json(
      { error: 'armyId is required' },
      { status: 400 },
    )
  }

  const army = await prisma.army.findFirst({
    where: { id: armyId, playerId: player.id },
    include: { armyUnits: true },
  })

  if (!army) {
    return NextResponse.json(
      { error: 'Army not found or not owned by you' },
      { status: 404 },
    )
  }

  if (army.status !== 'MARCHING') {
    return NextResponse.json(
      { error: 'Army is not marching and cannot be recalled' },
      { status: 400 },
    )
  }

  // Calculate how far the army has traveled and how long to return
  const now = new Date()
  const departedAt = army.departedAt!
  const arrivesAt = army.arrivesAt!

  const totalTravelMs = arrivesAt.getTime() - departedAt.getTime()
  const elapsedMs = now.getTime() - departedAt.getTime()
  const progressRatio = Math.min(elapsedMs / totalTravelMs, 1)

  // Return time = proportional to how far they've gone
  const returnTimeMs = totalTravelMs * progressRatio
  const returnArrivesAt = new Date(now.getTime() + returnTimeMs)

  // Burn provisions proportional to recall (penalty)
  const provisionsBurned = army.provisions * 0.25 // 25% provision loss on recall

  const updatedArmy = await prisma.army.update({
    where: { id: armyId },
    data: {
      status: 'RETURNING',
      toTileId: army.fromTileId, // returning to origin
      departedAt: now,
      arrivesAt: returnArrivesAt,
      provisions: Math.max(0, army.provisions - provisionsBurned),
    },
    include: { armyUnits: true },
  })

  return NextResponse.json({
    army: updatedArmy,
    provisionsBurned: Math.round(provisionsBurned),
    returnTimeMinutes: Math.round((returnTimeMs / 60000) * 10) / 10,
  })
}

// -----------------------------------------------------------------------
// SCOUT a tile (dispatch scout from garrison)
// -----------------------------------------------------------------------
async function handleScout(
  player: { id: string; playerResources: { id: string } | null },
  body: { toTileId?: string; settlementId?: string },
) {
  const { toTileId, settlementId } = body

  if (!toTileId || !settlementId) {
    return NextResponse.json(
      { error: 'toTileId and settlementId are required' },
      { status: 400 },
    )
  }

  // Verify settlement ownership and load units + buildings
  const settlement = await prisma.settlement.findFirst({
    where: { id: settlementId, playerId: player.id },
    include: { settlementUnits: true, buildings: true, tile: true },
  })

  if (!settlement) {
    return NextResponse.json(
      { error: 'Settlement not found or not owned by you' },
      { status: 404 },
    )
  }

  // Check scout availability in garrison
  const scoutUnit = settlement.settlementUnits.find(
    (u) => u.unitType === 'SCOUT',
  )
  const availableScouts = scoutUnit?.quantity ?? 0

  if (availableScouts < 1) {
    return NextResponse.json(
      { error: 'No scouts available in this settlement' },
      { status: 400 },
    )
  }

  // Enforce SCOUT_CAP_BY_CITADEL — count active scout missions
  const citadel = settlement.buildings.find((b) => b.type === 'CITADEL')
  const citadelLevel = citadel?.isBuilt ? citadel.level : 1
  const scoutCap =
    (SCOUT_CAP_BY_CITADEL as Record<number, number>)[citadelLevel] ?? 1

  const activeScoutMissions = await prisma.army.count({
    where: {
      playerId: player.id,
      name: { startsWith: 'Scout Mission' },
      status: { in: ['MARCHING', 'RETURNING'] },
    },
  })

  if (activeScoutMissions >= scoutCap) {
    return NextResponse.json(
      {
        error: `Scout cap reached (${scoutCap}). Wait for active scouts to return.`,
      },
      { status: 400 },
    )
  }

  // Get destination tile
  const toTile = await prisma.mapTile.findUnique({
    where: { id: toTileId },
  })

  if (!toTile) {
    return NextResponse.json(
      { error: 'Destination tile not found' },
      { status: 404 },
    )
  }

  // Calculate round-trip distance and time
  const dx = toTile.x - settlement.tile.x
  const dy = toTile.y - settlement.tile.y
  const distance = Math.sqrt(dx * dx + dy * dy)
  const scoutSpeed = UNIT_STATS.SCOUT.speed // 2.0 tiles per minute
  const roundTripMinutes = (distance / scoutSpeed) * 2
  const roundTripMs = roundTripMinutes * 60 * 1000

  const now = new Date()
  const arrivesAt = new Date(now.getTime() + roundTripMs)

  const missionNumber = Date.now().toString(36)

  const army = await prisma.$transaction(async (tx) => {
    // Deduct 1 scout from garrison
    await tx.settlementUnits.update({
      where: { id: scoutUnit!.id },
      data: { quantity: availableScouts - 1 },
    })

    // Create scout army
    const newArmy = await tx.army.create({
      data: {
        playerId: player.id,
        name: `Scout Mission #${missionNumber}`,
        status: 'MARCHING',
        fromTileId: settlement.tileId,
        toTileId,
        departedAt: now,
        arrivesAt,
        provisions: 0,
        armyUnits: {
          create: [{ unitType: 'SCOUT', quantity: 1 }],
        },
      },
      include: { armyUnits: true },
    })

    return newArmy
  })

  return NextResponse.json({
    army,
    roundTripMinutes: Math.round(roundTripMinutes * 10) / 10,
    distance: Math.round(distance * 10) / 10,
  })
}
