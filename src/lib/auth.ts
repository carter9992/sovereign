import { prisma } from './db'
import { v4 as uuid } from 'uuid'

export async function getOrCreatePlayer(deviceId: string, name?: string, startingRegion?: string) {
  let player = await prisma.player.findUnique({
    where: { deviceId },
    include: { playerResources: true },
  })

  if (player) return player

  // Find active season
  let season = await prisma.season.findFirst({ where: { active: true } })
  if (!season) {
    season = await prisma.season.create({
      data: {
        name: 'Season 1',
        endsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    })
  }

  const region = startingRegion || 'Heartlands'

  // Find an unoccupied tile in the chosen region
  const tile = await prisma.mapTile.findFirst({
    where: {
      region,
      ownerId: null,
      npcFactionId: null,
      terrain: { not: 'OCEAN' },
      hasSettlement: false,
    },
  })

  if (!tile) throw new Error('No available tiles in region: ' + region)

  const playerId = uuid()
  const settlementId = uuid()

  player = await prisma.player.create({
    data: {
      id: playerId,
      deviceId,
      name: name || `Sovereign_${playerId.slice(0, 6)}`,
      seasonId: season.id,
      startingRegion: region,
      playerResources: {
        create: {
          ore: 400,
          provisions: 400,
          gold: 200,
          lumber: 300,
          mana: 0,
        },
      },
      settlements: {
        create: {
          id: settlementId,
          name: 'Capital',
          type: 'CAPITAL',
          tileId: tile.id,
          buildings: {
            create: [
              { type: 'CITADEL', level: 1, isBuilt: true },
              { type: 'SAWMILL', level: 0, isBuilt: false },
              { type: 'FARM', level: 0, isBuilt: false },
              { type: 'MINE', level: 0, isBuilt: false },
              { type: 'OBSERVATORY', level: 0, isBuilt: false },
              { type: 'BARRACKS', level: 0, isBuilt: false },
              { type: 'STORAGE', level: 1, isBuilt: true },
            ],
          },
        },
      },
      researchStates: {
        create: [
          { track: 'BALLISTICS', level: 0 },
          { track: 'DEFENSE_TRACK', level: 0 },
          { track: 'STRATEGY', level: 0 },
          { track: 'CROP_MASTERY', level: 0 },
          { track: 'ANIMAL_HUSBANDRY', level: 0 },
          { track: 'FORESTRY', level: 0 },
        ],
      },
    },
    include: { playerResources: true },
  })

  // Mark tile as owned
  await prisma.mapTile.update({
    where: { id: tile.id },
    data: { ownerId: playerId, hasSettlement: true },
  })

  // Create initial game event
  await prisma.gameEvent.create({
    data: {
      playerId,
      type: 'WELCOME',
      message: 'Welcome to SOVEREIGN. Build your empire, defend your lands.',
    },
  })

  return player
}

export function getDeviceIdFromHeader(request: Request): string | null {
  return request.headers.get('x-device-id')
}

export async function getPlayerFromRequest(request: Request) {
  const deviceId = getDeviceIdFromHeader(request)
  if (!deviceId) return null
  return prisma.player.findUnique({
    where: { deviceId },
    include: { playerResources: true },
  })
}
