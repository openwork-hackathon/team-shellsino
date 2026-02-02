// localStorage helpers for game secrets

// Coinflip secrets
export function saveGameSecret(gameId: number, secret: string, choice: number) {
  if (typeof window === 'undefined') return;
  const secrets = JSON.parse(localStorage.getItem('shellsino_secrets') || '{}');
  secrets[gameId] = { secret, choice, timestamp: Date.now() };
  localStorage.setItem('shellsino_secrets', JSON.stringify(secrets));
}

export function getGameSecret(gameId: number): { secret: string; choice: number } | null {
  if (typeof window === 'undefined') return null;
  const secrets = JSON.parse(localStorage.getItem('shellsino_secrets') || '{}');
  return secrets[gameId] || null;
}

export function removeGameSecret(gameId: number) {
  if (typeof window === 'undefined') return;
  const secrets = JSON.parse(localStorage.getItem('shellsino_secrets') || '{}');
  delete secrets[gameId];
  localStorage.setItem('shellsino_secrets', JSON.stringify(secrets));
}

export function getAllSecrets(): Record<number, { secret: string; choice: number; timestamp: number }> {
  if (typeof window === 'undefined') return {};
  return JSON.parse(localStorage.getItem('shellsino_secrets') || '{}');
}

// Blackjack secrets
export function saveBJSecret(gameId: number, secret: string) {
  if (typeof window === 'undefined') return;
  const secrets = JSON.parse(localStorage.getItem('shellsino_bj_secrets') || '{}');
  secrets[gameId] = { secret, timestamp: Date.now() };
  localStorage.setItem('shellsino_bj_secrets', JSON.stringify(secrets));
}

export function getBJSecret(gameId: number): string | null {
  if (typeof window === 'undefined') return null;
  const secrets = JSON.parse(localStorage.getItem('shellsino_bj_secrets') || '{}');
  return secrets[gameId]?.secret || null;
}

export function removeBJSecret(gameId: number) {
  if (typeof window === 'undefined') return;
  const secrets = JSON.parse(localStorage.getItem('shellsino_bj_secrets') || '{}');
  delete secrets[gameId];
  localStorage.setItem('shellsino_bj_secrets', JSON.stringify(secrets));
}

// Dice secrets
export function saveDiceSecret(gameId: number, secret: string) {
  if (typeof window === 'undefined') return;
  const secrets = JSON.parse(localStorage.getItem('shellsino_dice_secrets') || '{}');
  secrets[gameId] = { secret, timestamp: Date.now() };
  localStorage.setItem('shellsino_dice_secrets', JSON.stringify(secrets));
}

export function getDiceSecret(gameId: number): string | null {
  if (typeof window === 'undefined') return null;
  const secrets = JSON.parse(localStorage.getItem('shellsino_dice_secrets') || '{}');
  return secrets[gameId]?.secret || null;
}

export function removeDiceSecret(gameId: number) {
  if (typeof window === 'undefined') return;
  const secrets = JSON.parse(localStorage.getItem('shellsino_dice_secrets') || '{}');
  delete secrets[gameId];
  localStorage.setItem('shellsino_dice_secrets', JSON.stringify(secrets));
}

// User preferences
export function getSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem('shellsino_sound');
  return stored === null ? true : stored === 'true';
}

export function setSoundEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('shellsino_sound', String(enabled));
}

export function getAcceptedTerms(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('shellsino_accepted_terms') === 'true';
}

export function setAcceptedTerms(accepted: boolean) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('shellsino_accepted_terms', String(accepted));
}
