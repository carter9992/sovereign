import { NextResponse } from 'next/server'
import { getPlayerFromRequest } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  WAR_TECH_COSTS,
  AGRICULTURE_COSTS,
  FORESTRY_COSTS,
  ARCANA_COSTS,
  TUTORIAL_STEPS,
} from '@/lib/game/constants'

type WarTrack = 'BALLISTICS' | 'DEFENSE_TRACK' | 'STRATEGY'
type AgriTrack = 'CROP_MASTERY' | 'ANIMAL_HUSBANDRY'
type EconomyTrack = 'FORESTRY'
type ArcanaTrack = 'HOLY' | 'NECROTIC'

const WAR_TRACKS: WarTrack[] = ['BALLISTICS', 'DEFENSE_TRACK', 'STRATEGY']
const AGRI_TRACKS: AgriTrack[] = ['CROP_MASTERY', 'ANIMAL_HUSBANDRY']
const ECONOMY_TRACKS: EconomyTrack[] = ['FORESTRY']
const ARCANA_TRACKS: ArcanaTrack[] = ['HOLY', 'NECROTIC']

// Map arcana track levels to cost tiers
const ARCANA_TIER_MAP: Record<number, keyof typeof ARCANA_COSTS> = {
  1: 'TIER_1',
  2: 'TIER_2',
  3: 'TIER_3',
  4: 'TIER_4',
  5: 'DRAGON',
}

export async function POST(request: Request) {
  try {
    const player = await getPlayerFromRequest(request)
    if (!player) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { track } = body

    if (!track) {
      return NextResponse.json(
        { error: 'track is required' },
        { status: 400 },
      )
    }

    const allTracks = [...WAR_TRACKS, ...AGRI_TRACKS, ...ECONOMY_TRACKS, ...ARCANA_TRACKS]
    if (!allTracks.includes(track)) {
      return NextResponse.json(
        { error: `Invalid research track: ${track}` },
        { status: 400 },
      )
    }

    // Check no active research (single-threaded research)
    const existingResearch = await prisma.activeResearch.findUnique({
      where: { playerId: player.id },
    })

    if (existingResearch) {
      return NextResponse.json(
        { error: 'You already have active research. Wait for it to complete.' },
        { status: 400 },
      )
    }

    // Get current research level
    const researchStates = await prisma.researchState.findMany({
      where: { playerId: player.id },
    })

    const currentState = researchStates.find((r) => r.track === track)
    const currentLevel = currentState?.level ?? 0
    const nextLevel = currentLevel + 1

    // Max level is 5 for all tracks
    if (nextLevel > 5) {
      return NextResponse.json(
        { error: `${track} is already at maximum level` },
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

    let cost: { ore?: number; provisions?: number; gold?: number; lumber?: number; mana?: number; timeSeconds: number }

    if (WAR_TRACKS.includes(track as WarTrack)) {
      // War tracks cost ore
      const trackCosts = WAR_TECH_COSTS[track as WarTrack]
      cost = (trackCosts as Record<number, typeof cost>)[nextLevel]
    } else if (AGRI_TRACKS.includes(track as AgriTrack)) {
      // Agriculture tracks cost provisions
      const trackCosts = AGRICULTURE_COSTS[track as AgriTrack]
      cost = (trackCosts as Record<number, typeof cost>)[nextLevel]
    } else if (ECONOMY_TRACKS.includes(track as EconomyTrack)) {
      // Economy tracks (FORESTRY) cost lumber
      cost = (FORESTRY_COSTS as Record<number, typeof cost>)[nextLevel]
    } else {
      // Arcana tracks cost gold + mana
      const tier = ARCANA_TIER_MAP[nextLevel]
      if (!tier) {
        return NextResponse.json(
          { error: `No cost defined for ${track} level ${nextLevel}` },
          { status: 400 },
        )
      }
      cost = ARCANA_COSTS[tier]
    }

    if (!cost) {
      return NextResponse.json(
        { error: `No cost data for ${track} level ${nextLevel}` },
        { status: 400 },
      )
    }

    // Check resource requirements
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

    // Check prerequisites for arcana tracks
    if (ARCANA_TRACKS.includes(track as ArcanaTrack)) {
      // Observatory must be built to research arcana
      const settlements = await prisma.settlement.findMany({
        where: { playerId: player.id },
        include: { buildings: true },
      })
      const hasObservatory = settlements.some((s) =>
        s.buildings.some((b) => b.type === 'OBSERVATORY' && b.isBuilt),
      )
      if (!hasObservatory) {
        return NextResponse.json(
          { error: 'You must build an Observatory to research arcana tracks' },
          { status: 400 },
        )
      }
    }

    const now = new Date()
    const finishAt = new Date(now.getTime() + cost.timeSeconds * 1000)

    // Deduct resources and create active research in a transaction
    const [activeResearch] = await prisma.$transaction([
      prisma.activeResearch.create({
        data: {
          playerId: player.id,
          track,
          startedAt: now,
          finishAt,
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

    // Tutorial progression: researching anything advances past step 4
    if (player.tutorialStep < TUTORIAL_STEPS.RESEARCH_IRRIGATION) {
      await prisma.player.update({
        where: { id: player.id },
        data: { tutorialStep: TUTORIAL_STEPS.RESEARCH_IRRIGATION },
      })
    }

    return NextResponse.json({
      activeResearch,
      message: `Started researching ${track} level ${nextLevel}`,
    })
  } catch (error) {
    console.error('[Research] Error:', error)
    return NextResponse.json(
      { error: 'Failed to start research' },
      { status: 500 },
    )
  }
}
