import { NextResponse } from 'next/server'
import { getPlayerFromRequest } from '@/lib/auth'
import { prisma } from '@/lib/db'

// Exchange rates: how much of resourceReceive you get per 1 unit of resourceSend
// Rates are directional: resourceSend -> resourceReceive
// Gold is premium (raid/trade only), mana is rare
const EXCHANGE_RATES: Record<string, Record<string, number>> = {
  ore: {
    provisions: 1.5,
    gold: 0.25,
    lumber: 1.2,
    mana: 0.2,
  },
  provisions: {
    ore: 0.667,
    gold: 0.2,
    lumber: 0.8,
    mana: 0.15,
  },
  lumber: {
    ore: 0.8,
    provisions: 1.2,
    gold: 0.25,
    mana: 0.2,
  },
  gold: {
    ore: 4,
    provisions: 5,
    lumber: 4,
    mana: 0.5,
  },
  mana: {
    ore: 5,
    provisions: 7,
    lumber: 5,
    gold: 2,
  },
}

const VALID_RESOURCES = ['ore', 'provisions', 'gold', 'lumber', 'mana']

// Trade transit time: 5 minutes
const TRADE_TRANSIT_MS = 5 * 60 * 1000

export async function GET(request: Request) {
  try {
    const player = await getPlayerFromRequest(request)
    if (!player) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tradeOrders = await prisma.tradeOrder.findMany({
      where: { playerId: player.id },
      orderBy: { departedAt: 'desc' },
    })

    return NextResponse.json({ tradeOrders })
  } catch (error) {
    console.error('[Trade GET] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch trade orders' },
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
    const { type, resourceSend, amountSend, resourceReceive } = body

    if (type !== 'CROWN_MARKET') {
      return NextResponse.json(
        { error: 'Only CROWN_MARKET trades are currently supported' },
        { status: 400 },
      )
    }

    if (!resourceSend || !amountSend || !resourceReceive) {
      return NextResponse.json(
        { error: 'resourceSend, amountSend, and resourceReceive are required' },
        { status: 400 },
      )
    }

    if (!VALID_RESOURCES.includes(resourceSend)) {
      return NextResponse.json(
        { error: `Invalid resourceSend: ${resourceSend}` },
        { status: 400 },
      )
    }

    if (!VALID_RESOURCES.includes(resourceReceive)) {
      return NextResponse.json(
        { error: `Invalid resourceReceive: ${resourceReceive}` },
        { status: 400 },
      )
    }

    if (resourceSend === resourceReceive) {
      return NextResponse.json(
        { error: 'Cannot trade a resource for itself' },
        { status: 400 },
      )
    }

    if (typeof amountSend !== 'number' || amountSend <= 0) {
      return NextResponse.json(
        { error: 'amountSend must be a positive number' },
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

    // Check if player has enough of the resource to send
    const currentAmount = resources[resourceSend as keyof typeof resources] as number
    if (amountSend > currentAmount) {
      return NextResponse.json(
        { error: `Not enough ${resourceSend}. Have: ${currentAmount}, need: ${amountSend}` },
        { status: 400 },
      )
    }

    // Calculate exchange
    const rate = EXCHANGE_RATES[resourceSend]?.[resourceReceive]
    if (!rate) {
      return NextResponse.json(
        { error: `No exchange rate for ${resourceSend} -> ${resourceReceive}` },
        { status: 400 },
      )
    }

    const amountReceive = Math.floor(amountSend * rate)
    if (amountReceive <= 0) {
      return NextResponse.json(
        { error: 'Trade amount too small to yield any return' },
        { status: 400 },
      )
    }

    // Calculate risk percent based on trade size
    // Larger trades have higher risk of interception
    // Base risk: 5%, +1% per 500 units sent, max 30%
    const riskPercent = Math.min(5 + Math.floor(amountSend / 500), 30)

    const now = new Date()
    const arrivesAt = new Date(now.getTime() + TRADE_TRANSIT_MS)

    // Deduct sent resource and create trade order
    const resourceDeduction: Record<string, number> = {}
    resourceDeduction[resourceSend] = currentAmount - amountSend

    const [tradeOrder] = await prisma.$transaction([
      prisma.tradeOrder.create({
        data: {
          playerId: player.id,
          type: 'CROWN_MARKET',
          resourceSend,
          amountSend,
          resourceReceive,
          amountReceive,
          status: 'IN_TRANSIT',
          riskPercent,
          departedAt: now,
          arrivesAt,
        },
      }),
      prisma.playerResources.update({
        where: { playerId: player.id },
        data: resourceDeduction,
      }),
    ])

    return NextResponse.json({
      tradeOrder,
      exchangeRate: rate,
      message: `Trading ${amountSend} ${resourceSend} for ${amountReceive} ${resourceReceive}. Risk: ${riskPercent}%`,
    })
  } catch (error) {
    console.error('[Trade POST] Error:', error)
    return NextResponse.json(
      { error: 'Failed to create trade order' },
      { status: 500 },
    )
  }
}
