// Operações da sala sobre o Firebase Realtime Database.
// Não existe servidor: o cliente do anfitrião faz o sorteio, e as regras de segurança
// (database.rules.json) garantem quem pode ler e escrever o quê.
//
// Estrutura:
//   rooms/{code}            estado público da sala (sem palavras nem papéis)
//   roles/{code}/{uid}      palavra de cada jogador: só o próprio jogador lê
//   secrets/{code}          dados da rodada (impostores, palavras): só o anfitrião lê
import {
  get,
  onDisconnect,
  onValue,
  ref,
  runTransaction,
  serverTimestamp,
  set,
  update,
  type Database,
} from 'firebase/database';
import {
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  defaultSettings,
  drawRound,
  listCategories,
  mergeSettings,
  roleFor,
  validateStart,
  wordBank,
  type MyRole,
  type Phase,
  type PublicRoomState,
  type RoundResult,
  type Settings,
} from '@impostor/shared';

export interface Ctx {
  db: Database;
  uid: string;
}

export class GameError extends Error {}

interface RawPlayer {
  name: string;
  joinedAt: number;
  online: boolean;
  spectator?: boolean;
}

export interface RawRoom {
  hostId: string;
  phase: Phase;
  settings: Settings;
  roundNumber?: number;
  starterName?: string;
  roundPlayers?: Record<string, string>;
  usedPairs?: Record<string, true>;
  result?: RoundResult;
  createdAt?: number;
  lastActivity?: number;
  players?: Record<string, RawPlayer>;
}

interface RawSecret {
  crewWord: string;
  impostorWord?: string;
  impostorIds: string[];
  categoryLabel: string;
  mode: Settings['mode'];
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // sem I, L, O (igual às regras)
const STALE_ROOM_MS = 6 * 60 * 60_000; // salas paradas há 6h podem ser reaproveitadas

const roomPath = (code: string) => `rooms/${code}`;

export function normalizeCode(code: string) {
  return String(code ?? '').trim().toUpperCase();
}

export function cleanName(raw: string): string {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
  if (!name) throw new GameError('Digite seu nome.');
  return name;
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

/** Jogadores em ordem de chegada. */
export function sortedPlayers(room: RawRoom) {
  return Object.entries(room.players ?? {})
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
}

/** O RTDB não guarda arrays vazios nem nulls: normaliza o que vem do banco. */
export function normalizeSettings(s: Partial<Settings> | undefined): Settings {
  return { ...defaultSettings(wordBank), ...s, categories: s?.categories ?? [] };
}

export function toPublicState(code: string, room: RawRoom): PublicRoomState {
  return {
    code,
    hostId: room.hostId,
    phase: room.phase,
    players: sortedPlayers(room).map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.online === true,
      spectator: p.spectator === true,
    })),
    settings: normalizeSettings(room.settings),
    roundNumber: room.roundNumber ?? 0,
    starterName: room.starterName ?? null,
    categories: listCategories(wordBank),
  };
}

export function normalizeResult(r: RoundResult | undefined): RoundResult | null {
  if (!r) return null;
  return { ...r, impostors: r.impostors ?? [], impostorWord: r.impostorWord ?? null };
}

async function loadRoom(db: Database, code: string): Promise<RawRoom> {
  const snap = await get(ref(db, roomPath(code)));
  if (!snap.exists()) throw new GameError('Sala não encontrada.');
  return snap.val();
}

function requireHost(ctx: Ctx, room: RawRoom) {
  if (room.hostId !== ctx.uid) throw new GameError('Só o anfitrião pode fazer isso.');
}

export async function createRoom(ctx: Ctx, rawName: string): Promise<string> {
  const name = cleanName(rawName);
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode();
    const existing = await get(ref(ctx.db, roomPath(code)));
    if (existing.exists() && Date.now() - (existing.val().lastActivity ?? 0) < STALE_ROOM_MS) continue;
    try {
      await set(ref(ctx.db, roomPath(code)), {
        hostId: ctx.uid,
        phase: 'lobby',
        settings: defaultSettings(wordBank),
        roundNumber: 0,
        createdAt: serverTimestamp(),
        lastActivity: serverTimestamp(),
        players: { [ctx.uid]: { name, joinedAt: serverTimestamp(), online: true, spectator: false } },
      });
      return code;
    } catch {
      // código tomado por outra pessoa no mesmo instante: tenta outro
    }
  }
  throw new GameError('Não foi possível criar a sala. Tente de novo.');
}

/** Entra na sala, ou só reconecta se este usuário já faz parte dela. */
export async function joinRoom(ctx: Ctx, rawCode: string, rawName: string): Promise<{ code: string; reconnected: boolean }> {
  const code = normalizeCode(rawCode);
  const room = await loadRoom(ctx.db, code);
  if (room.players?.[ctx.uid]) return { code, reconnected: true };

  const name = cleanName(rawName);
  const players = sortedPlayers(room);
  if (players.length >= MAX_PLAYERS) throw new GameError(`A sala está cheia (máx. ${MAX_PLAYERS}).`);
  if (players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    throw new GameError('Já existe um jogador com esse nome na sala.');
  }
  await update(ref(ctx.db, roomPath(code)), {
    [`players/${ctx.uid}`]: { name, joinedAt: serverTimestamp(), online: true, spectator: room.phase !== 'lobby' },
    lastActivity: serverTimestamp(),
  });
  return { code, reconnected: false };
}

/**
 * Mantém players/{uid}/online atualizado: o próprio Firebase marca offline quando a conexão cai.
 * Retorna a função para parar de monitorar.
 */
export function trackPresence(ctx: Ctx, code: string): () => void {
  const onlineRef = ref(ctx.db, `${roomPath(code)}/players/${ctx.uid}/online`);
  const unsubscribe = onValue(ref(ctx.db, '.info/connected'), async (snap) => {
    if (snap.val() !== true) return;
    try {
      await onDisconnect(onlineRef).set(false);
      await set(onlineRef, true);
    } catch {
      // jogador foi removido da sala: as regras recusam a escrita, e está tudo bem
    }
  });
  return () => {
    unsubscribe();
    onDisconnect(onlineRef).cancel().catch(() => {});
  };
}

export async function leaveRoom(ctx: Ctx, code: string) {
  const room = await loadRoom(ctx.db, code);
  await onDisconnect(ref(ctx.db, `${roomPath(code)}/players/${ctx.uid}/online`)).cancel();
  const others = sortedPlayers(room).filter((p) => p.id !== ctx.uid);

  if (others.length === 0) {
    // Último a sair (e portanto o anfitrião): apaga a sala inteira.
    await update(ref(ctx.db), { [roomPath(code)]: null, [`roles/${code}`]: null, [`secrets/${code}`]: null });
    return;
  }
  const updates: Record<string, unknown> = { [`${roomPath(code)}/players/${ctx.uid}`]: null };
  if (room.hostId === ctx.uid) {
    const next = others.find((p) => p.online) ?? others[0];
    updates[`${roomPath(code)}/hostId`] = next.id;
  }
  await update(ref(ctx.db), updates);
}

export async function updateSettings(ctx: Ctx, code: string, patch: Partial<Settings>) {
  const room = await loadRoom(ctx.db, code);
  requireHost(ctx, room);
  if (room.phase === 'playing') throw new GameError('Espere a rodada terminar para mudar as configurações.');
  const next = mergeSettings(normalizeSettings(room.settings), patch, wordBank);
  await set(ref(ctx.db, `${roomPath(code)}/settings`), next);
}

export async function startRound(ctx: Ctx, code: string) {
  const room = await loadRoom(ctx.db, code);
  requireHost(ctx, room);
  if (room.phase === 'playing') throw new GameError('Já existe uma rodada em andamento.');
  const settings = normalizeSettings(room.settings);
  const players = sortedPlayers(room);
  const error = validateStart(players.length, settings, wordBank);
  if (error) throw new GameError(error);

  const { round, usedPairs } = drawRound(
    players.map((p) => p.id),
    settings,
    wordBank,
    new Set(Object.keys(room.usedPairs ?? {})),
  );
  const roundNumber = (room.roundNumber ?? 0) + 1;
  const names = Object.fromEntries(players.map((p) => [p.id, p.name]));

  const updates: Record<string, unknown> = {
    [`${roomPath(code)}/phase`]: 'playing',
    [`${roomPath(code)}/roundNumber`]: roundNumber,
    [`${roomPath(code)}/starterName`]: names[round.starterId],
    [`${roomPath(code)}/roundPlayers`]: names,
    [`${roomPath(code)}/usedPairs`]: Object.fromEntries([...usedPairs].map((k) => [k, true])),
    [`${roomPath(code)}/result`]: null,
    [`${roomPath(code)}/lastActivity`]: serverTimestamp(),
    [`roles/${code}`]: Object.fromEntries(players.map((p) => [p.id, { ...roleFor(round, p.id), round: roundNumber }])),
    [`secrets/${code}`]: {
      crewWord: round.crewWord,
      impostorWord: round.impostorWord,
      impostorIds: round.impostorIds,
      categoryLabel: wordBank[round.category]?.label ?? round.category,
      mode: round.mode,
    },
  };
  for (const p of players) updates[`${roomPath(code)}/players/${p.id}/spectator`] = false;
  // Uma única escrita atômica: todos recebem o papel ao mesmo tempo.
  await update(ref(ctx.db), updates);
}

export async function revealRound(ctx: Ctx, code: string) {
  const room = await loadRoom(ctx.db, code);
  requireHost(ctx, room);
  if (room.phase !== 'playing') throw new GameError('Não há rodada em andamento.');
  const secret: RawSecret | null = (await get(ref(ctx.db, `secrets/${code}`))).val();
  if (!secret) throw new GameError('Dados da rodada não encontrados.');

  const result: RoundResult = {
    impostors: (secret.impostorIds ?? []).map((id) => ({ id, name: room.roundPlayers?.[id] ?? '?' })),
    crewWord: secret.crewWord,
    impostorWord: secret.impostorWord ?? null,
    categoryLabel: secret.categoryLabel,
    mode: secret.mode,
  };
  await update(ref(ctx.db, roomPath(code)), { result, phase: 'revealed', lastActivity: serverTimestamp() });
}

export async function backToLobby(ctx: Ctx, code: string) {
  const room = await loadRoom(ctx.db, code);
  requireHost(ctx, room);
  const updates: Record<string, unknown> = {
    [`${roomPath(code)}/phase`]: 'lobby',
    [`${roomPath(code)}/result`]: null,
    [`${roomPath(code)}/roundPlayers`]: null,
    [`${roomPath(code)}/starterName`]: null,
    [`${roomPath(code)}/lastActivity`]: serverTimestamp(),
    [`roles/${code}`]: null,
    [`secrets/${code}`]: null,
  };
  for (const p of sortedPlayers(room)) updates[`${roomPath(code)}/players/${p.id}/spectator`] = false;
  await update(ref(ctx.db), updates);
}

export async function kickPlayer(ctx: Ctx, code: string, playerId: string) {
  const room = await loadRoom(ctx.db, code);
  requireHost(ctx, room);
  if (playerId === ctx.uid) throw new GameError('Você não pode expulsar a si mesmo.');
  if (!room.players?.[playerId]) throw new GameError('Jogador não encontrado.');
  await update(ref(ctx.db), {
    [`${roomPath(code)}/players/${playerId}`]: null,
    [`roles/${code}/${playerId}`]: null,
  });
}

/**
 * Assume o papel de anfitrião se o atual estiver offline. A transação evita que
 * dois jogadores troquem o anfitrião ao mesmo tempo; as regras conferem que ele está offline.
 */
export async function claimHost(ctx: Ctx, code: string, offlineHostId: string): Promise<boolean> {
  const res = await runTransaction(ref(ctx.db, `${roomPath(code)}/hostId`), (current) =>
    current === null || current === offlineHostId ? ctx.uid : undefined,
  );
  return res.committed && res.snapshot.val() === ctx.uid;
}

export function watchRoom(db: Database, code: string, cb: (room: RawRoom | null) => void) {
  return onValue(ref(db, roomPath(code)), (snap) => cb(snap.val()));
}

export function watchRole(ctx: Ctx, code: string, cb: (role: (MyRole & { round: number }) | null) => void) {
  return onValue(
    ref(ctx.db, `roles/${code}/${ctx.uid}`),
    (snap) => {
      const v = snap.val();
      cb(v ? { word: v.word ?? null, isImpostor: v.isImpostor === true, round: v.round } : null);
    },
    () => cb(null),
  );
}

/** Mensagem amigável para qualquer erro. */
export function errorMessage(err: unknown): string {
  if (err instanceof GameError) return err.message;
  const msg = String((err as Error)?.message ?? err);
  console.error(err);
  if (/permission/i.test(msg)) return 'Sem permissão para essa ação.';
  if (/offline|network/i.test(msg)) return 'Sem conexão com o servidor.';
  return 'Algo deu errado. Tente de novo.';
}
