import { NextResponse } from 'next/server'
import { getPlayerFromRequest } from '@/lib/auth'
import { prisma } from '@/lib/db'

const VISIBILITY_RANGE = 2

export async function GET(request: Request) {
  try {
    const player = await getPlayerFromRequest(request)
    if (!player) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get player's settlement tile positions for fog of war calculation
    const settlements = await prisma.settlement.findMany({
      where: { playerId: player.id },
      include: { tile: true },
    })

    const settlementCoords = settlements.map((s) => ({
      x: s.tile.x,
      y: s.tile.y,
    }))

    // Fetch all tiles with related data
    const allTiles = await prisma.mapTile.findMany({
      include: {
        owner: {
          select: { id: true, name: true },
        },
        npcFaction: {
          select: { id: true, name: true, aggressionLevel: true, strength: true, description: true },
        },
        settlements: {
          select: { protectedUntil: true },
        },
      },
    })

    // Apply fog of war
    const tilesWithVisibility = allTiles.map((tile) => {
      // Check if tile is within VISIBILITY_RANGE of any player settlement
      const isVisible = settlementCoords.some((coord) => {
        const dx = Math.abs(tile.x - coord.x)
        const dy = Math.abs(tile.y - coord.y)
        // Chebyshev distance (allows diagonals)
        return Math.max(dx, dy) <= VISIBILITY_RANGE
      })

      if (isVisible) {
        // Full visibility
        const protectedUntil = tile.settlements[0]?.protectedUntil ?? null
        return {
          id: tile.id,
          x: tile.x,
          y: tile.y,
          region: tile.region,
          terrain: tile.terrain,
          ownerId: tile.ownerId,
          owner: tile.owner,
          npcFactionId: tile.npcFactionId,
          npcFaction: tile.npcFaction,
          hasSettlement: tile.hasSettlement,
          hasManaNode: tile.hasManaNode,
          isHideout: tile.isHideout,
          protectedUntil,
          visible: true,
        }
      } else {
        // Fog of war: only terrain is visible
        return {
          id: tile.id,
          x: tile.x,
          y: tile.y,
          region: tile.region,
          terrain: tile.terrain,
          ownerId: null,
          owner: null,
          npcFactionId: null,
          npcFaction: null,
          hasSettlement: false,
          hasManaNode: false,
          isHideout: false,
          protectedUntil: null,
          visible: false,
        }
      }
    })

    return NextResponse.json({ tiles: tilesWithVisibility })
  } catch (error) {
    console.error('[Map] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch map data' },
      { status: 500 },
    )
  }
}
