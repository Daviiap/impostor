import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { onValue, ref } from 'firebase/database';
import type { AckResult, MyRole, PublicRoomState, RoundResult, Settings } from '@impostor/shared';
import { auth, db } from './firebase';
import * as svc from './roomService';

interface Session {
  code: string;
  name: string;
}

// sessionStorage: sobrevive a reload/tela bloqueada, e cada aba é um jogador diferente.
const SESSION_KEY = 'impostor:session';
const loadSession = (): Session | null => {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
  } catch {
    return null;
  }
};
const saveSession = (s: Session | null) =>
  s ? sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)) : sessionStorage.removeItem(SESSION_KEY);

/** Se o anfitrião ficar offline por esse tempo, o jogador conectado mais antigo assume. */
const HOST_GRACE_MS = 30_000;

async function attempt(fn: () => Promise<unknown>): Promise<AckResult> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: svc.errorMessage(err) };
  }
}

export function useRoom() {
  const [uid, setUid] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [raw, setRaw] = useState<svc.RawRoom | null>(null);
  const [role, setRole] = useState<(MyRole & { round: number }) | null>(null);
  const [connected, setConnected] = useState(true);
  const [restoring, setRestoring] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const leaving = useRef(false);

  const ctx = uid ? { db, uid } : null;

  const reset = useCallback((message: string | null = null) => {
    saveSession(null);
    setCode(null);
    setRaw(null);
    setRole(null);
    setNotice(message);
  }, []);

  // Login anônimo (um usuário por aba) e retomada da sala salva.
  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        signInAnonymously(auth).catch((err) => {
          console.error(err);
          setNotice('Não foi possível conectar ao Firebase. Verifique se o login anônimo está ativado.');
          setRestoring(false);
        });
        return;
      }
      setUid(user.uid);
      const s = loadSession();
      if (s) {
        try {
          const { code } = await svc.joinRoom({ db, uid: user.uid }, s.code, s.name);
          setCode(code);
        } catch (err) {
          reset(err instanceof svc.GameError && /não encontrada/.test(err.message) ? 'A sala foi encerrada.' : svc.errorMessage(err));
        }
      }
      setRestoring(false);
    });
  }, [reset]);

  useEffect(() => onValue(ref(db, '.info/connected'), (snap) => setConnected(snap.val() === true)), []);

  // Assina a sala, o próprio papel e mantém a presença enquanto estiver numa sala.
  useEffect(() => {
    if (!code || !uid) return;
    const c = { db, uid };
    leaving.current = false;
    const stopPresence = svc.trackPresence(c, code);
    const stopRoom = svc.watchRoom(db, code, (room) => {
      if (leaving.current) return;
      if (!room) return reset('A sala foi encerrada.');
      if (!room.players?.[uid]) return reset('Você foi removido da sala pelo anfitrião.');
      setRaw(room);
    });
    const stopRole = svc.watchRole(c, code, setRole);
    return () => {
      stopPresence();
      stopRoom();
      stopRole();
    };
  }, [code, uid, reset]);

  // Troca de anfitrião quando ele some: o jogador online mais antigo assume após o prazo.
  const rawRef = useRef(raw);
  rawRef.current = raw;
  const hostOnline = raw ? raw.players?.[raw.hostId]?.online === true : true;
  useEffect(() => {
    if (hostOnline || !raw || !uid || !code) return;
    const offlineHost = raw.hostId;
    const timer = setTimeout(() => {
      const latest = rawRef.current;
      if (!latest || latest.hostId !== offlineHost || latest.players?.[offlineHost]?.online) return;
      const successor = svc.sortedPlayers(latest).find((p) => p.online && p.id !== offlineHost);
      if (successor?.id === uid) svc.claimHost({ db, uid }, code, offlineHost).catch(() => {});
    }, HOST_GRACE_MS);
    return () => clearTimeout(timer);
  }, [hostOnline, raw?.hostId, uid, code]); // eslint-disable-line react-hooks/exhaustive-deps

  const state: PublicRoomState | null = code && raw ? svc.toPublicState(code, raw) : null;
  const result: RoundResult | null = raw?.phase === 'revealed' ? svc.normalizeResult(raw.result) : null;
  // Só mostra o papel da rodada atual (evita piscar o papel da rodada anterior).
  const myRole: MyRole | null =
    raw?.phase !== 'lobby' && role && role.round === raw?.roundNumber ? { word: role.word, isImpostor: role.isImpostor } : null;

  function enter(name: string, action: () => Promise<string>) {
    return attempt(async () => {
      if (!ctx) throw new svc.GameError('Conectando… tente de novo em instantes.');
      const joined = await action();
      saveSession({ code: joined, name: svc.cleanName(name) });
      setNotice(null);
      setCode(joined);
    });
  }

  const withRoom = (fn: (c: svc.Ctx, code: string) => Promise<unknown>) =>
    attempt(async () => {
      if (!ctx || !code) throw new svc.GameError('Você não está numa sala.');
      await fn(ctx, code);
    });

  return {
    state,
    role: myRole,
    result,
    playerId: uid,
    connected,
    restoring,
    notice,
    isHost: !!state && state.hostId === uid,
    create: (name: string) => enter(name, () => svc.createRoom(ctx!, name)),
    join: (roomCode: string, name: string) => enter(name, async () => (await svc.joinRoom(ctx!, roomCode, name)).code),
    leave: async () => {
      leaving.current = true;
      const res = await withRoom(svc.leaveRoom);
      reset();
      return res;
    },
    updateSettings: (patch: Partial<Settings>) => withRoom((c, rc) => svc.updateSettings(c, rc, patch)),
    start: () => withRoom(svc.startRound),
    reveal: () => withRoom(svc.revealRound),
    toLobby: () => withRoom(svc.backToLobby),
    kick: (id: string) => withRoom((c, rc) => svc.kickPlayer(c, rc, id)),
  };
}

export type RoomApi = ReturnType<typeof useRoom>;
