import { NextResponse } from 'next/server'
import { getPlayerFromRequest } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  BASE_ORE_PER_TICK,
  BASE_PROVISIONS_PER_TICK,
  BASE_GOLD_PER_TICK,
  BASE_LUMBER_PER_TICK,
  TICK_INTERVAL_MS,
} from '@/lib/game/constants'

export async function POST(request: Request) {
  // Only available in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Debug routes are not available in production' },
      { status: 403 },
    )
  }

  try {
    const player = await getPlayerFromRequest(request)
    if (!player) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action } = body

    switch (action) {
      case 'fastForward':
        return await handleFastForward(player, body)
      case 'addResources':
        return await handleAddResources(player, body)
      case 'spawnNPC':
        return await handleSpawnNPC(player, body)
      default:
        return NextResponse.json(
          { error: `Invalid debug action: ${action}` },
          { status: 400 },
        )
    }
  } catch (error) {
    console.error('[Debug] Error:', error)
    return NextResponse.json(
      { error: 'Debug action failed' },
      { status: 500 },
    )
  }
}

// -----------------------------------------------------------------------
// Fast-forward all timers by N minutes
// -----------------------------------------------------------------------
async function handleFastForward(
  player: { id: string; playerResources: { id: string; ore: number; provisions: number; gold: number; lumber: number; mana: number; oreCap: number; provisionsCap: number; goldCap: number; lumberCap: number; manaCap: number } | null },
  body: { minutes?: number },
) {
  const { minutes } = body

  if (!minutes || typeof minutes !== 'number' || minutes <= 0) {
    return NextResponse.json(
      { error: 'minutes must be a positive number' },
      { status: 400 },
    )
  }

  const offsetMs = minutes * 60 * 1000

  // Prisma stores DateTime as epoch milliseconds in SQLite, so use arithmetic
  const offsetMsStr = String(offsetMs)

  await prisma.$transaction(async (tx) => {
    // Fast-forward building upgrades
    await tx.$executeRawUnsafe(
      `UPDATE Building SET upgradeStartedAt = upgradeStartedAt - ${offsetMsStr}, upgradeFinishAt = upgradeFinishAt - ${offsetMsStr} WHERE upgradeFinishAt IS NOT NULL AND settlementId IN (SELECT id FROM Settlement WHERE playerId = ?)`,
      player.id,
    )

    // Fast-forward defense upgrades
    await tx.$executeRawUnsafe(
      `UPDATE Defense SET upgradeStartedAt = upgradeStartedAt - ${offsetMsStr}, upgradeFinishAt = upgradeFinishAt - ${offsetMsStr} WHERE upgradeFinishAt IS NOT NULL AND settlementId IN (SELECT id FROM Settlement WHERE playerId = ?)`,
      player.id,
    )

    // Fast-forward unit training queues
    await tx.$executeRawUnsafe(
      `UPDATE UnitQueue SET startedAt = startedAt - ${offsetMsStr}, finishAt = finishAt - ${offsetMsStr} WHERE settlementId IN (SELECT id FROM Settlement WHERE playerId = ?)`,
      player.id,
    )

    // Fast-forward active research
    await tx.$executeRawUnsafe(
      `UPDATE ActiveResearch SET startedAt = startedAt - ${offsetMsStr}, finishAt = finishAt - ${offsetMsStr} WHERE playerId = ?`,
      player.id,
    )

    // Fast-forward army marches
    await tx.$executeRawUnsafe(
      `UPDATE Army SET departedAt = departedAt - ${offsetMsStr}, arrivesAt = arrivesAt - ${offsetMsStr} WHERE arrivesAt IS NOT NULL AND playerId = ?`,
      player.id,
    )

    // Fast-forward trade orders
    await tx.$executeRawUnsafe(
      `UPDATE TradeOrder SET departedAt = departedAt - ${offsetMsStr}, arrivesAt = arrivesAt - ${offsetMsStr} WHERE arrivesAt IS NOT NULL AND playerId = ?`,
      player.id,
    )

    // Add resources proportional to time fast-forwarded
    if (player.playerResources) {
      const tickMultiplier = offsetMs / TICK_INTERVAL_MS
      const oreGain = BASE_ORE_PER_TICK * tickMultiplier
      const provisionsGain = BASE_PROVISIONS_PER_TICK * tickMultiplier
      const goldGain = BASE_GOLD_PER_TICK * tickMultiplier
      const lumberGain = BASE_LUMBER_PER_TICK * tickMultiplier

      const res = player.playerResources
      await tx.playerResources.update({
        where: { playerId: player.id },
        data: {
          ore: Math.min(res.ore + oreGain, res.oreCap),
          provisions: Math.min(res.provisions + provisionsGain, res.provisionsCap),
          gold: Math.min(res.gold + goldGain, res.goldCap),
          lumber: Math.min(res.lumber + lumberGain, res.lumberCap),
        },
      })
    }

    // Also move lastTickAt back so the next tick processes everything
    await tx.playerResources.update({
      where: { playerId: player.id },
      data: {
        lastTickAt: new Date(Date.now() - offsetMs),
      },
    })
  })

  // Fetch updated state
  const updatedResources = await prisma.playerResources.findUnique({
    where: { playerId: player.id },
  })

  return NextResponse.json({
    message: `Fast-forwarded ${minutes} minutes`,
    resources: updatedResources,
  })
}

// -----------------------------------------------------------------------
// Add resources directly
// -----------------------------------------------------------------------
async function handleAddResources(
  player: { id: string; playerResources: { id: string; ore: number; provisions: number; gold: number; lumber: number; mana: number; oreCap: number; provisionsCap: number; goldCap: number; lumberCap: number; manaCap: number } | null },
  body: { ore?: number; provisions?: number; gold?: number; lumber?: number; mana?: number },
) {
  const { ore, provisions, gold, lumber, mana } = body

  if (!player.playerResources) {
    return NextResponse.json(
      { error: 'Player resources not found' },
      { status: 500 },
    )
  }

  const res = player.playerResources
  const updates: Record<string, number> = {}

  if (ore && typeof ore === 'number') {
    updates.ore = Math.min(res.ore + ore, res.oreCap)
  }
  if (provisions && typeof provisions === 'number') {
    updates.provisions = Math.min(res.provisions + provisions, res.provisionsCap)
  }
  if (gold && typeof gold === 'number') {
    updates.gold = Math.min(res.gold + gold, res.goldCap)
  }
  if (lumber && typeof lumber === 'number') {
    updates.lumber = Math.min(res.lumber + lumber, res.lumberCap)
  }
  if (mana && typeof mana === 'number') {
    updates.mana = Math.min(res.mana + mana, res.manaCap)
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: 'No resource amounts provided' },
      { status: 400 },
    )
  }

  const updatedResources = await prisma.playerResources.update({
    where: { playerId: player.id },
    data: updates,
  })

  return NextResponse.json({
    message: 'Resources added',
    resources: updatedResources,
  })
}

// -----------------------------------------------------------------------
// Spawn an NPC faction on a nearby tile
// -----------------------------------------------------------------------
const VISIBILITY_RANGE = 2

async function handleSpawnNPC(
  player: { id: string },
  body: { tileId?: string; isHideout?: boolean },
) {
  const { tileId, isHideout = false } = body

  // Pick a random NPC faction
  const factions = await prisma.nPCFaction.findMany()
  if (factions.length === 0) {
    return NextResponse.json(
      { error: 'No NPC factions exist in the database' },
      { status: 400 },
    )
  }
  const faction = factions[Math.floor(Math.random() * factions.length)]

  let tile

  if (tileId) {
    // Use the specific tile requested
    tile = await prisma.mapTile.findUnique({ where: { id: tileId } })
    if (!tile) {
      return NextResponse.json(
        { error: 'Tile not found' },
        { status: 404 },
      )
    }
    if (tile.terrain === 'OCEAN') {
      return NextResponse.json(
        { error: 'Cannot spawn NPC on ocean tile' },
        { status: 400 },
      )
    }
  } else {
    // Find player settlements to determine visibility
    const settlements = await prisma.settlement.findMany({
      where: { playerId: player.id },
      include: { tile: true },
    })

    if (settlements.length === 0) {
      return NextResponse.json(
        { error: 'Player has no settlements' },
        { status: 400 },
      )
    }

    // Gather all visible tiles that are empty and eligible
    const settlementCoords = settlements.map((s) => ({ x: s.tile.x, y: s.tile.y }))

    // Build OR conditions for each settlement's visibility box
    const visibilityConditions = settlementCoords.map((coord) => ({
      x: { gte: coord.x - VISIBILITY_RANGE, lte: coord.x + VISIBILITY_RANGE },
      y: { gte: coord.y - VISIBILITY_RANGE, lte: coord.y + VISIBILITY_RANGE },
    }))

    const candidates = await prisma.mapTile.findMany({
      where: {
        OR: visibilityConditions,
        ownerId: null,
        npcFactionId: null,
        hasSettlement: false,
        terrain: { not: 'OCEAN' },
      },
    })

    if (candidates.length === 0) {
      return NextResponse.json(
        { error: 'No eligible empty tiles within visibility range' },
        { status: 400 },
      )
    }

    tile = candidates[Math.floor(Math.random() * candidates.length)]
  }

  // Update the tile with the NPC faction
  const updated = await prisma.mapTile.update({
    where: { id: tile.id },
    data: {
      npcFactionId: faction.id,
      isHideout,
    },
  })

  return NextResponse.json({
    message: `Spawned NPC "${faction.name}" at (${updated.x}, ${updated.y})`,
    tile: { x: updated.x, y: updated.y, id: updated.id },
    faction: {
      name: faction.name,
      strength: faction.strength,
      aggressionLevel: faction.aggressionLevel,
    },
    isHideout,
  })
}
