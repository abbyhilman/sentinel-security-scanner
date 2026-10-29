import type { PairingResponse } from '@sentinel/contracts';

const pairings = new Map<string, PairingResponse>();

export function keepPairing(pairing: PairingResponse) {
  pairings.set(pairing.repositoryId, pairing);
}

export function readPairing(repositoryId: string) {
  const pairing = pairings.get(repositoryId);
  if (!pairing || new Date(pairing.expiresAt).getTime() <= Date.now()) {
    pairings.delete(repositoryId);
    return null;
  }
  return pairing;
}

export function clearPairing(repositoryId: string) {
  pairings.delete(repositoryId);
}
