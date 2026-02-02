/**
 * Game Secrets Management Hook (#85)
 * Extracted from page.tsx helper functions
 * 
 * Handles localStorage persistence of game secrets for commit-reveal
 */

const STORAGE_KEY = 'shellsino_secrets';
const BJ_STORAGE_KEY = 'shellsino_bj_secrets';
const DICE_STORAGE_KEY = 'shellsino_dice_secrets';

interface GameSecret {
  secret: string;
  choice: number;
  timestamp: number;
}

// Generic game secrets (Coinflip)
export function saveGameSecret(gameId: number, secret: string, choice: number): void {
  if (typeof window === 'undefined') return;
  const secrets = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  secrets[gameId] = { secret, choice, timestamp: Date.now() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(secrets));
}

export function getGameSecret(gameId: number): { secret: string; choice: number } | null {
  if (typeof window === 'undefined') return null;
  const secrets = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  return secrets[gameId] || null;
}

export function removeGameSecret(gameId: number): void {
  if (typeof window === 'undefined') return;
  const secrets = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  delete secrets[gameId];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(secrets));
}

export function getAllSecrets(): Record<number, GameSecret> {
  if (typeof window === 'undefined') return {};
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
}

// Blackjack secrets
export function saveBJSecret(gameId: number, secret: string): void {
  if (typeof window === 'undefined') return;
  const secrets = JSON.parse(localStorage.getItem(BJ_STORAGE_KEY) || '{}');
  secrets[gameId] = { secret, timestamp: Date.now() };
  localStorage.setItem(BJ_STORAGE_KEY, JSON.stringify(secrets));
}

export function getBJSecret(gameId: number): string | null {
  if (typeof window === 'undefined') return null;
  const secrets = JSON.parse(localStorage.getItem(BJ_STORAGE_KEY) || '{}');
  return secrets[gameId]?.secret || null;
}

export function removeBJSecret(gameId: number): void {
  if (typeof window === 'undefined') return;
  const secrets = JSON.parse(localStorage.getItem(BJ_STORAGE_KEY) || '{}');
  delete secrets[gameId];
  localStorage.setItem(BJ_STORAGE_KEY, JSON.stringify(secrets));
}

// Dice secrets
export function saveDiceSecret(gameId: number, secret: string): void {
  if (typeof window === 'undefined') return;
  const secrets = JSON.parse(localStorage.getItem(DICE_STORAGE_KEY) || '{}');
  secrets[gameId] = { secret, timestamp: Date.now() };
  localStorage.setItem(DICE_STORAGE_KEY, JSON.stringify(secrets));
}

export function getDiceSecret(gameId: number): string | null {
  if (typeof window === 'undefined') return null;
  const secrets = JSON.parse(localStorage.getItem(DICE_STORAGE_KEY) || '{}');
  return secrets[gameId]?.secret || null;
}

// Utility: Clean old secrets (older than 24 hours)
export function cleanOldSecrets(): void {
  if (typeof window === 'undefined') return;
  
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  
  [STORAGE_KEY, BJ_STORAGE_KEY, DICE_STORAGE_KEY].forEach(key => {
    const secrets = JSON.parse(localStorage.getItem(key) || '{}');
    let changed = false;
    
    Object.keys(secrets).forEach(id => {
      if (secrets[id].timestamp < cutoff) {
        delete secrets[id];
        changed = true;
      }
    });
    
    if (changed) {
      localStorage.setItem(key, JSON.stringify(secrets));
    }
  });
}

// React hook for accessing secrets
import { useState, useEffect, useCallback } from 'react';

export function useGameSecrets(gameType: 'coinflip' | 'blackjack' | 'dice' = 'coinflip') {
  const [secrets, setSecrets] = useState<Record<number, any>>({});

  useEffect(() => {
    const key = gameType === 'blackjack' ? BJ_STORAGE_KEY 
              : gameType === 'dice' ? DICE_STORAGE_KEY 
              : STORAGE_KEY;
    setSecrets(JSON.parse(localStorage.getItem(key) || '{}'));
  }, [gameType]);

  const save = useCallback((gameId: number, secret: string, choice?: number) => {
    if (gameType === 'coinflip' && choice !== undefined) {
      saveGameSecret(gameId, secret, choice);
    } else if (gameType === 'blackjack') {
      saveBJSecret(gameId, secret);
    } else if (gameType === 'dice') {
      saveDiceSecret(gameId, secret);
    }
    // Refresh state
    const key = gameType === 'blackjack' ? BJ_STORAGE_KEY 
              : gameType === 'dice' ? DICE_STORAGE_KEY 
              : STORAGE_KEY;
    setSecrets(JSON.parse(localStorage.getItem(key) || '{}'));
  }, [gameType]);

  const get = useCallback((gameId: number) => {
    if (gameType === 'coinflip') return getGameSecret(gameId);
    if (gameType === 'blackjack') return getBJSecret(gameId);
    if (gameType === 'dice') return getDiceSecret(gameId);
    return null;
  }, [gameType]);

  const remove = useCallback((gameId: number) => {
    if (gameType === 'coinflip') removeGameSecret(gameId);
    else if (gameType === 'blackjack') removeBJSecret(gameId);
    // Refresh state
    const key = gameType === 'blackjack' ? BJ_STORAGE_KEY 
              : gameType === 'dice' ? DICE_STORAGE_KEY 
              : STORAGE_KEY;
    setSecrets(JSON.parse(localStorage.getItem(key) || '{}'));
  }, [gameType]);

  return { secrets, save, get, remove };
}
