# 🏗️ Shellsino Architecture

## Two-Token Economy

```
┌─────────────────────────────────────────────────────────────────┐
│                        SHELLSINO                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   $SHELL (Casino Chips)          $HOUSE (House Staking)         │
│   ┌─────────────────┐            ┌─────────────────┐            │
│   │  Clanker Token  │            │ Mint Club Bond  │            │
│   │  Fixed Supply   │            │ Bonding Curve   │            │
│   └────────┬────────┘            └────────┬────────┘            │
│            │                              │                      │
│            ▼                              ▼                      │
│   ┌─────────────────┐            ┌─────────────────┐            │
│   │   PvP Games     │            │  HouseBankroll  │            │
│   │  (Coinflip,     │            │  (Stake, Earn)  │            │
│   │   Roulette)     │            └────────┬────────┘            │
│   └─────────────────┘                     │                      │
│                                           ▼                      │
│                                  ┌─────────────────┐            │
│                                  │   PvH Games     │            │
│                                  │  (Blackjack,    │            │
│                                  │   Dice, etc.)   │            │
│                                  └─────────────────┘            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Contract Flow

### PvP Games (Player vs Player)
```
Player A                    Contract                   Player B
   │                           │                          │
   │──── createGame ──────────▶│                          │
   │     (bet + commitment)    │                          │
   │                           │                          │
   │                           │◀──── joinGame ───────────│
   │                           │      (bet + choice)      │
   │                           │                          │
   │──── revealAndResolve ────▶│                          │
   │     (secret)              │                          │
   │                           │                          │
   │◀──── winner gets 2x ──────│──── loser gets 0 ───────▶│
   │      (minus 1% fee)       │                          │
```

### PvH Games (Player vs House)
```
Player                    Blackjack                 HouseBankroll
   │                          │                          │
   │──── startGame ──────────▶│                          │
   │     (bet + commitment)   │                          │
   │                          │                          │
   │──── revealAndDeal ──────▶│◀──── canCover? ─────────│
   │     (secret)             │                          │
   │                          │                          │
   │──── hit/stand/double ───▶│                          │
   │                          │                          │
   │                          │                          │
   │◀──── settleGame ─────────│                          │
   │                          │                          │
   │ (if player wins)         │──── payLoss ────────────▶│
   │                          │                          │
   │ (if house wins)          │──── depositProfit ──────▶│
```

## Deployed Contracts (Base Mainnet)

| Contract | Address | Purpose |
|----------|---------|---------|
| $SHELL | `0xcfAD33C1188635B22BA97a7caBCF5bEd02fAe466` | Casino chip token |
| $HOUSE | `0x759a72ea84e5cc7f04a59830ec8a824b036bfc8b` | House staking token |
| Coinflip V2 | `0x67e894ee7c3e76B7995ef3A5Fee430c7393c8D11` | 1v1 PvP |
| Roulette V2 | `0xdF8E88d90c5D6C0A0a3bF695fb145B905593B7ee` | 6-player PvP |
| HouseBankroll | `0x1BB36A7BdF4eAa8321bbB177EaFc1cf26c7E573f` | Staking pool |
| Blackjack | `0xE5246830e328A07CE81011B90828485afEe94646` | PvH card game |

## Tech Stack

- **Smart Contracts:** Solidity 0.8.20, OpenZeppelin, Hardhat
- **Frontend:** Next.js 16, React 19, wagmi/viem, Tailwind CSS
- **Network:** Base (Chain ID 8453)
- **Randomness:** Commit-reveal scheme (VRF-upgradeable)

## Security Features

- ReentrancyGuard on all contracts
- SafeERC20 for token transfers
- Commit-reveal for provable fairness
- 10% max exposure per game on house bankroll
- 191 tests covering all edge cases
