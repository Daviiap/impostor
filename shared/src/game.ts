// Lógica pura do sorteio: sem estado, sem rede, fácil de testar.
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  maxImpostors,
  type CategoryInfo,
  type GameMode,
  type Settings,
} from './types';

export type WordBank = Record<string, { label: string; pairs: [string, string][] }>;

export interface Round {
  category: string;
  pairKey: string;
  crewWord: string;
  /** null no modo 'blank'. */
  impostorWord: string | null;
  impostorIds: string[];
  starterId: string;
  /** Configurações congeladas no início da rodada. */
  mode: GameMode;
  impostorKnows: boolean;
}

export type Rng = () => number;

export function listCategories(bank: WordBank): CategoryInfo[] {
  return Object.entries(bank).map(([id, c]) => ({ id, label: c.label, pairCount: c.pairs.length }));
}

export function defaultSettings(bank: WordBank): Settings {
  return { mode: 'similar', impostorCount: 1, impostorKnows: false, categories: Object.keys(bank) };
}

/** Mescla uma atualização parcial vinda do cliente, descartando valores inválidos. */
export function mergeSettings(current: Settings, patch: Partial<Settings>, bank: WordBank): Settings {
  const next = { ...current };
  if (patch.mode === 'similar' || patch.mode === 'blank') next.mode = patch.mode;
  if (typeof patch.impostorKnows === 'boolean') next.impostorKnows = patch.impostorKnows;
  if (typeof patch.impostorCount === 'number' && Number.isInteger(patch.impostorCount)) {
    next.impostorCount = Math.min(Math.max(patch.impostorCount, 1), maxImpostors(MAX_PLAYERS));
  }
  if (Array.isArray(patch.categories)) {
    next.categories = [...new Set(patch.categories.filter((c) => typeof c === 'string' && c in bank))];
  }
  return next;
}

/** Retorna a mensagem de erro, ou null se dá para começar a rodada. */
export function validateStart(playerCount: number, settings: Settings, bank: WordBank): string | null {
  if (playerCount < MIN_PLAYERS) return `São necessários pelo menos ${MIN_PLAYERS} jogadores.`;
  const max = maxImpostors(playerCount);
  if (settings.impostorCount < 1 || settings.impostorCount > max) {
    return `Com ${playerCount} jogadores, o máximo é ${max} impostor${max > 1 ? 'es' : ''}.`;
  }
  return null;
}

/**
 * Categorias usadas no sorteio. Sem nenhuma categoria válida selecionada
 * (nenhuma marcada, ou salas antigas com categorias que não existem mais), usa o banco todo.
 */
export function activeCategories(settings: Settings, bank: WordBank): string[] {
  const valid = settings.categories.filter((c) => (bank[c]?.pairs.length ?? 0) > 0);
  return valid.length > 0 ? valid : Object.keys(bank);
}

function pick<T>(items: T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Sorteia par de palavras, impostores e quem começa.
 * Evita pares já usados; quando todos foram usados, recomeça o ciclo.
 * Pressupõe que validateStart já passou.
 */
export function drawRound(
  playerIds: string[],
  settings: Settings,
  bank: WordBank,
  usedPairs: ReadonlySet<string>,
  rng: Rng = Math.random,
): { round: Round; usedPairs: Set<string> } {
  const all = activeCategories(settings, bank).flatMap((c) => (bank[c]?.pairs ?? []).map((_, i) => `${c}:${i}`));
  const fresh = all.filter((k) => !usedPairs.has(k));
  const exhausted = fresh.length === 0;
  const pairKey = pick(exhausted ? all : fresh, rng);
  const [category, idx] = [pairKey.slice(0, pairKey.lastIndexOf(':')), Number(pairKey.split(':').pop())];
  const pair = bank[category].pairs[idx];

  // Sorteia também qual lado do par fica com os inocentes.
  const [crewWord, otherWord] = rng() < 0.5 ? pair : [pair[1], pair[0]];

  const impostorIds = shuffle(playerIds, rng).slice(0, settings.impostorCount);
  // No modo sem palavra, o impostor não pode ser o primeiro a dar dica.
  const starterPool =
    settings.mode === 'blank' ? playerIds.filter((id) => !impostorIds.includes(id)) : playerIds;

  const nextUsed = new Set(exhausted ? [] : usedPairs);
  nextUsed.add(pairKey);

  return {
    round: {
      category,
      pairKey,
      crewWord,
      impostorWord: settings.mode === 'blank' ? null : otherWord,
      impostorIds,
      starterId: pick(starterPool, rng),
      mode: settings.mode,
      impostorKnows: settings.impostorKnows,
    },
    usedPairs: nextUsed,
  };
}

/** O que cada jogador enxerga. Impostor "desavisado" é indistinguível de um inocente. */
export function roleFor(round: Round, playerId: string) {
  if (!round.impostorIds.includes(playerId)) return { word: round.crewWord, isImpostor: false };
  if (round.mode === 'blank') return { word: null, isImpostor: true };
  return { word: round.impostorWord, isImpostor: round.impostorKnows };
}
