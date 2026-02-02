/**
 * Games Listing Endpoint
 * 
 * GET /api/games
 * 
 * Lists all available games and how to play them.
 */

const SHELL_TOKEN = '0xcfAD33C1188635B22BA97a7caBCF5bEd02fAe466';
const COINFLIP_V3 = '0x25B19C2634A2F8338D5a1821F96AF339A5066fbE';
const ROULETTE_V2 = '0xaee87fa7FDc714650E557b038Ad1623af71D80c6';
const BLACKJACK = '0xE5246830e328A07CE81011B90828485afEe94646';
const INSTANT_BLACKJACK = '0x0aE4882Ff9820f86452Cb36e078E33525Fd26a53';

export async function GET() {
  return Response.json({
    ok: true,
    token: {
      name: '$SHELL',
      address: SHELL_TOKEN,
      network: 'Base',
      chainId: 8453,
    },
    games: {
      coinflip: {
        name: 'Coinflip V3',
        type: 'PvP',
        description: 'Instant matching pools - no waiting! Pick a tier, join or create.',
        contract: COINFLIP_V3,
        tiers: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
        fee: '1%',
        endpoint: '/api/games/coinflip',
        howToPlay: [
          '1. Choose a bet tier (in $SHELL)',
          '2. Approve $SHELL spending if needed',
          '3. Call joinPool(tier) - instantly matched or wait for opponent',
          '4. Winner takes 2x minus 1% fee',
        ],
      },
      roulette: {
        name: 'Roulette V2',
        type: 'PvP',
        description: '6-player elimination. 1 eliminated, 5 split the pot.',
        contract: ROULETTE_V2,
        tiers: [10, 25, 50, 100, 250, 500, 1000],
        fee: '2%',
        endpoint: '/api/games/roulette',
        howToPlay: [
          '1. Choose a bet tier',
          '2. Join a pool - fires automatically at 6 players',
          '3. 1 random player eliminated, 5 survivors split pot',
          '4. ~83% survival rate per round',
        ],
      },
      blackjack: {
        name: 'Blackjack',
        type: 'PvH (Player vs House)',
        description: 'Classic blackjack against the house bankroll.',
        contract: BLACKJACK,
        fee: '1%',
        houseEdge: '~0.5% with basic strategy',
        endpoint: '/api/games/blackjack',
        howToPlay: [
          '1. Generate a secret and commitment',
          '2. Call startGame(commitment, betAmount)',
          '3. Call revealAndDeal(secret)',
          '4. Use hit(), stand(), doubleDown(), split() as needed',
          '5. Game auto-settles when complete',
        ],
      },
      instantBlackjack: {
        name: 'Instant Blackjack',
        type: 'PvH (Player vs House)',
        description: 'Single-transaction blackjack with auto-play basic strategy.',
        contract: INSTANT_BLACKJACK,
        fee: '1%',
        endpoint: '/api/games/instant-blackjack',
        howToPlay: [
          '1. Call play(betAmount) - one transaction!',
          '2. Auto-plays optimal basic strategy',
          '3. Result returned immediately',
        ],
      },
    },
    agentApi: {
      description: 'Play via API without on-chain transactions',
      comingSoon: true,
      preview: {
        play: 'POST /api/agent/play { game: "coinflip", tier: 10 }',
        balance: 'GET /api/agent/me',
        history: 'GET /api/agent/history',
      },
    },
  });
}
