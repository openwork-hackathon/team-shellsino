# Component Refactor Plan (#85)

`src/app/page.tsx` is currently ~3800 lines. This document outlines the extraction plan.

## Current Structure

```
page.tsx (3800+ lines)
├── Contract constants & ABIs (lines 1-400)
├── Helper functions (lines 373-400)
├── Main Home component (lines 402-620)
├── DisclaimerScreen (lines 625-680)
├── AgentVerification (lines 684-875)
├── CoinflipGame (lines 879-1315) - ~440 lines
├── MyGamesPage (lines 1318-1650) - ~330 lines
├── RouletteGame (lines 1651-1890) - ~240 lines
├── RoundCard (lines 1894-2045) - ~150 lines
├── CardComponent (lines 2057-2072)
├── SlotsGame (lines 2107-2350) - ~240 lines
├── DiceGame (lines 2366-2580) - ~210 lines
├── BlackjackGame (lines 2582-3055) - ~470 lines
├── HouseStaking (lines 3056-3310) - ~250 lines
├── StatsPage (lines 3311-3470) - ~160 lines
├── SocialPage (lines 3471-3665) - ~190 lines
└── RecentGames (lines 3667-3720)
```

## Target Structure

```
src/
├── app/
│   └── page.tsx (~200 lines - just layout and routing)
├── components/
│   ├── games/
│   │   ├── index.ts
│   │   ├── CoinflipGame.tsx
│   │   ├── RouletteGame.tsx
│   │   ├── BlackjackGame.tsx
│   │   ├── DiceGame.tsx
│   │   ├── SlotsGame.tsx
│   │   └── shared/
│   │       ├── CardComponent.tsx
│   │       └── RoundCard.tsx
│   ├── pages/
│   │   ├── MyGamesPage.tsx
│   │   ├── HouseStaking.tsx
│   │   ├── StatsPage.tsx
│   │   └── SocialPage.tsx
│   ├── auth/
│   │   ├── DisclaimerScreen.tsx
│   │   └── AgentVerification.tsx
│   └── ui/
│       └── (existing: Toast, ErrorBoundary, etc.)
├── config/
│   └── contracts.ts (already created)
├── hooks/
│   ├── useNetworkCheck.ts (already created)
│   └── useGameSecrets.ts (extract from helpers)
└── lib/
    └── abi.ts (extract ABIs)
```

## Extraction Steps

### Step 1: Extract ABIs and Constants
Move to `src/lib/abi.ts`:
- ERC20_ABI
- COINFLIP_ABI
- ROULETTE_ABI
- BLACKJACK_ABI
- HOUSE_ABI

### Step 2: Extract Shared Hooks
Create `src/hooks/useGameSecrets.ts`:
- saveGameSecret()
- getGameSecret()
- removeGameSecret()
- getAllSecrets()

### Step 3: Extract Game Components
Each game component needs:
1. Move function to new file
2. Add necessary imports (wagmi hooks, ABIs, etc.)
3. Export as default
4. Update page.tsx to import

Example extraction for CoinflipGame:
```typescript
// src/components/games/CoinflipGame.tsx
"use client";
import { useState, useEffect } from "react";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, formatEther, keccak256, encodePacked, toHex } from "viem";
import { SHELL_TOKEN, COINFLIP_CONTRACT } from "@/config/contracts";
import { ERC20_ABI, COINFLIP_ABI } from "@/lib/abi";
import { saveGameSecret, getGameSecret } from "@/hooks/useGameSecrets";

interface CoinflipGameProps {
  address: `0x${string}`;
  onBalanceChange: () => void;
}

export default function CoinflipGame({ address, onBalanceChange }: CoinflipGameProps) {
  // ... rest of component
}
```

### Step 4: Update page.tsx
```typescript
import { CoinflipGame } from "@/components/games";
import { RouletteGame } from "@/components/games";
// etc.
```

## Priority Order

1. **High Impact**: CoinflipGame, BlackjackGame (largest components)
2. **Medium Impact**: RouletteGame, DiceGame, HouseStaking
3. **Low Impact**: SlotsGame, StatsPage, SocialPage, MyGamesPage

## Benefits

- **Maintainability**: Smaller, focused files
- **Testing**: Components can be unit tested independently
- **Performance**: Code splitting for lazy loading
- **Collaboration**: Multiple devs can work on different games

## Time Estimate

- Full extraction: 4-6 hours
- High priority only: 2-3 hours

## Notes

- Keep backward compatibility during migration
- Test each extraction before moving to next
- Consider code splitting with dynamic imports for performance
