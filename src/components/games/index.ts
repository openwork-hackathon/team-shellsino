/**
 * Game Components Index (#85)
 * 
 * Components extracted from page.tsx for better maintainability.
 * Each game is now a separate component file.
 * 
 * Migration status:
 * - CoinflipGame: src/components/games/CoinflipGame.tsx
 * - RouletteGame: Pending extraction
 * - BlackjackGame: Pending extraction
 * - DiceGame: Pending extraction  
 * - SlotsGame: Pending extraction
 * - HouseStaking: Pending extraction
 * - StatsPage: Pending extraction
 * - SocialPage: Pending extraction
 */

export { default as CoinflipGame } from './CoinflipGame';

// Re-export types
export type GameProps = {
  address: `0x${string}`;
  onBalanceChange: () => void;
};
