// Tipos e regras compartilhadas entre servidor e cliente.

export type GameMode = 'similar' | 'blank';
export type Phase = 'lobby' | 'playing' | 'revealed';

export interface Settings {
  /** 'similar': impostor recebe palavra parecida. 'blank': impostor não recebe palavra. */
  mode: GameMode;
  impostorCount: number;
  /** Só no modo 'similar': o impostor é avisado de que é o impostor? */
  impostorKnows: boolean;
  /** IDs das categorias do banco de palavras usadas no sorteio. */
  categories: string[];
}

export interface CategoryInfo {
  id: string;
  label: string;
  pairCount: number;
}

export interface PublicPlayer {
  id: string;
  name: string;
  connected: boolean;
  /** Entrou no meio de uma rodada: só joga a partir da próxima. */
  spectator: boolean;
}

/** Estado público da sala: nunca contém papéis ou palavras. */
export interface PublicRoomState {
  code: string;
  hostId: string;
  phase: Phase;
  players: PublicPlayer[];
  settings: Settings;
  roundNumber: number;
  starterName: string | null;
  categories: CategoryInfo[];
}

/**
 * O que um jogador vê na rodada. Um impostor que não sabe que é impostor
 * recebe exatamente o mesmo formato de um inocente (isImpostor: false).
 */
export interface MyRole {
  word: string | null;
  isImpostor: boolean;
}

export interface RoundResult {
  impostors: { id: string; name: string }[];
  crewWord: string;
  impostorWord: string | null;
  categoryLabel: string;
  mode: GameMode;
}

export type AckResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 20;
export const MAX_NAME_LENGTH = 20;

/** Os inocentes precisam ser sempre maioria: no máximo ⌊(n−1)/2⌋ impostores (mínimo 1). */
export function maxImpostors(playerCount: number): number {
  return Math.max(1, Math.floor((playerCount - 1) / 2));
}
