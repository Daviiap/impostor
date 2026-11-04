// Teste ponta a ponta contra os emuladores do Firebase (auth + database), incluindo as regras.
// Rode com `npm test` na raiz (sobe os emuladores automaticamente).
import { afterAll, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, inMemoryPersistence, initializeAuth, signInAnonymously } from 'firebase/auth';
import {
  connectDatabaseEmulator,
  get,
  getDatabase,
  goOffline,
  ref,
  set,
  update,
  type Database,
} from 'firebase/database';
import * as svc from '../src/roomService';

const apps: FirebaseApp[] = [];

interface Player extends svc.Ctx {
  name: string;
}

async function player(name: string): Promise<Player> {
  const app = initializeApp(
    { apiKey: 'demo-key', projectId: 'demo-impostor', databaseURL: 'https://demo-impostor-default-rtdb.firebaseio.com' },
    `${name}-${Math.random()}`,
  );
  apps.push(app);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getDatabase(app);
  connectDatabaseEmulator(db, '127.0.0.1', 9000);
  const { user } = await signInAnonymously(auth);
  return { db, uid: user.uid, name };
}

afterAll(async () => {
  await Promise.all(apps.map((a) => deleteApp(a)));
});

const room = async (db: Database, code: string) => (await get(ref(db, `rooms/${code}`))).val() as svc.RawRoom;
const denied = (p: Promise<unknown>) => expect(p).rejects.toThrow(/permission/i);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('sala no Firebase', () => {
  it('fluxo completo com regras de segurança', async () => {
    const [ana, bia, caio, duda, edu] = await Promise.all(['Ana', 'Bia', 'Caio', 'Duda', 'Edu'].map(player));
    const code = await svc.createRoom(ana, 'Ana');
    expect(code).toMatch(/^[A-HJKMNP-Z]{4}$/);

    for (const p of [bia, caio, duda, edu]) await svc.joinRoom(p, code.toLowerCase(), p.name);
    await expect(svc.joinRoom(await player('x'), code, 'ana')).rejects.toThrow(/nome/);
    await expect(svc.joinRoom(bia, 'ZZZZ', 'Bia')).rejects.toThrow(/não encontrada/);

    // Só o anfitrião configura (checado no cliente e nas regras).
    await expect(svc.updateSettings(bia, code, { impostorCount: 2 })).rejects.toThrow(/anfitrião/);
    await denied(set(ref(bia.db, `rooms/${code}/settings/impostorCount`), 2));
    await denied(set(ref(bia.db, `rooms/${code}/phase`), 'playing'));
    await svc.updateSettings(ana, code, { impostorCount: 2 });

    // Ninguém consegue sobrescrever uma sala ativa nem "roubar" o anfitrião online.
    await denied(set(ref(bia.db, `rooms/${code}`), { hostId: bia.uid, phase: 'lobby', settings: {}, players: {} }));
    await denied(set(ref(bia.db, `rooms/${code}/hostId`), bia.uid));
    // Nem remover outro jogador.
    await denied(set(ref(bia.db, `rooms/${code}/players/${caio.uid}`), null));

    await svc.startRound(ana, code);
    const r = await room(bia.db, code);
    expect(r.phase).toBe('playing');
    expect(r.starterName).toBeTruthy();
    expect(JSON.stringify(r)).not.toMatch(/crewWord|impostorWord|impostorIds|isImpostor/);

    // Cada um lê só o próprio papel; segredos só o anfitrião.
    const all = [ana, bia, caio, duda, edu];
    const roles = await Promise.all(all.map(async (p) => (await get(ref(p.db, `roles/${code}/${p.uid}`))).val()));
    await denied(get(ref(bia.db, `roles/${code}/${caio.uid}`)));
    await denied(get(ref(bia.db, `roles/${code}`)));
    await denied(get(ref(bia.db, `secrets/${code}`)));
    await denied(set(ref(bia.db, `roles/${code}/${bia.uid}`), { word: 'x', isImpostor: false, round: 1 }));

    const counts = new Map<string, number>();
    for (const role of roles) {
      expect(role.isImpostor).toBe(false); // clássico: impostor não sabe
      counts.set(role.word, (counts.get(role.word) ?? 0) + 1);
    }
    expect([...counts.values()].sort()).toEqual([2, 3]);

    // Quem chega no meio da rodada é espectador e não tem papel.
    const fred = await player('Fred');
    await svc.joinRoom(fred, code, 'Fred');
    expect((await room(fred.db, code)).players?.[fred.uid].spectator).toBe(true);
    expect((await get(ref(fred.db, `roles/${code}/${fred.uid}`))).val()).toBeNull();

    // Revelação.
    await svc.revealRound(ana, code);
    const revealed = await room(fred.db, code);
    expect(revealed.phase).toBe('revealed');
    const impostorWord = [...counts.entries()].find(([, n]) => n === 2)![0];
    expect(revealed.result?.impostorWord).toBe(impostorWord);
    expect(revealed.result?.impostors).toHaveLength(2);

    // Nova rodada no modo sem palavra, já com o espectador.
    await svc.updateSettings(ana, code, { mode: 'blank' });
    await svc.startRound(ana, code);
    const all6 = [...all, fred];
    const roles2 = await Promise.all(all6.map(async (p) => (await get(ref(p.db, `roles/${code}/${p.uid}`))).val()));
    expect(roles2.filter((x) => x.isImpostor && !x.word)).toHaveLength(2);
    expect(roles2.filter((x) => !x.isImpostor && x.word)).toHaveLength(4);
    expect(roles2.every((x) => x.round === 2)).toBe(true);
    expect((await room(ana.db, code)).players?.[fred.uid].spectator).toBe(false);

    // Expulsar e voltar ao lobby.
    await svc.kickPlayer(ana, code, fred.uid);
    expect((await room(ana.db, code)).players?.[fred.uid]).toBeUndefined();
    await svc.backToLobby(ana, code);
    expect((await get(ref(bia.db, `roles/${code}/${bia.uid}`))).val()).toBeNull();

    // Anfitrião sai: passa para o próximo.
    await svc.leaveRoom(ana, code);
    const afterLeave = await room(bia.db, code);
    expect(afterLeave.players?.[ana.uid]).toBeUndefined();
    expect(afterLeave.hostId).toBe(bia.uid);
  });

  it('anfitrião offline perde o posto; último a sair apaga a sala', async () => {
    const [host, p2, p3] = await Promise.all(['H', 'P2', 'P3'].map(player));
    const code = await svc.createRoom(host, 'H');
    await svc.joinRoom(p2, code, 'P2');
    await svc.joinRoom(p3, code, 'P3');
    const stop = svc.trackPresence(host, code);
    await wait(300);

    // Enquanto o anfitrião está online, ninguém assume.
    expect(await svc.claimHost(p2, code, host.uid).catch(() => false)).toBe(false);

    goOffline(host.db); // onDisconnect marca online=false
    await wait(500);
    expect((await room(p2.db, code)).players?.[host.uid].online).toBe(false);
    expect(await svc.claimHost(p2, code, host.uid)).toBe(true);
    expect((await room(p3.db, code)).hostId).toBe(p2.uid);
    stop();

    // Saindo um por um, a sala some no final.
    await update(ref(p2.db), {}); // noop: garante conexão
    await svc.kickPlayer(p2, code, host.uid);
    await svc.leaveRoom(p3, code);
    await svc.leaveRoom(p2, code);
    expect((await get(ref(p2.db, `rooms/${code}`))).exists()).toBe(false);
  });
});
