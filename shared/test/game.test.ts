import { describe, expect, it } from 'vitest';
import { maxImpostors, type Settings } from '../src/types';
import { drawRound, mergeSettings, roleFor, validateStart, type WordBank } from '../src/game';
import { wordBank as realBank } from '../src/words';

const bank: WordBank = {
  a: { label: 'A', pairs: [['Praia', 'Piscina'], ['Café', 'Chá']] },
  b: { label: 'B', pairs: [['Gato', 'Tigre']] },
};
const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
const base: Settings = { mode: 'similar', impostorCount: 2, impostorKnows: false, categories: ['a', 'b'] };

describe('maxImpostors', () => {
  it('mantém os inocentes em maioria', () => {
    expect(maxImpostors(3)).toBe(1);
    expect(maxImpostors(4)).toBe(1);
    expect(maxImpostors(5)).toBe(2);
    expect(maxImpostors(10)).toBe(4);
  });
});

describe('validateStart', () => {
  it('exige 3 jogadores', () => {
    expect(validateStart(2, { ...base, impostorCount: 1 }, bank)).toMatch(/3 jogadores/);
  });
  it('limita impostores', () => {
    expect(validateStart(4, base, bank)).toMatch(/máximo é 1/);
    expect(validateStart(5, base, bank)).toBeNull();
  });
  it('sem categoria válida, usa o banco todo', () => {
    expect(validateStart(5, { ...base, categories: [] }, bank)).toBeNull();
    for (const categories of [[], ['nao-existe']]) {
      const keys = new Set<string>();
      for (let i = 0; i < 100; i++) keys.add(drawRound(players, { ...base, categories }, bank, new Set()).round.pairKey);
      expect(keys).toEqual(new Set(['a:0', 'a:1', 'b:0']));
    }
  });
});

describe('mergeSettings', () => {
  it('ignora valores inválidos e categorias desconhecidas', () => {
    const next = mergeSettings(
      base,
      { mode: 'xx' as never, impostorCount: 1.5, categories: ['a', 'zzz', 'a'] },
      bank,
    );
    expect(next).toEqual({ ...base, categories: ['a'] });
  });
});

describe('drawRound', () => {
  it('sorteia a quantidade certa de impostores, distintos e entre os jogadores', () => {
    for (let i = 0; i < 200; i++) {
      const { round } = drawRound(players, base, bank, new Set());
      expect(new Set(round.impostorIds).size).toBe(2);
      for (const id of round.impostorIds) expect(players).toContain(id);
      expect(round.impostorWord).not.toBeNull();
      expect(round.impostorWord).not.toBe(round.crewWord);
      expect(players).toContain(round.starterId);
    }
  });

  it('modo sem palavra: impostor sem palavra e nunca começa', () => {
    for (let i = 0; i < 200; i++) {
      const { round } = drawRound(players, { ...base, mode: 'blank' }, bank, new Set());
      expect(round.impostorWord).toBeNull();
      expect(round.impostorIds).not.toContain(round.starterId);
    }
  });

  it('não repete pares até esgotar e depois recomeça', () => {
    let used = new Set<string>();
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = drawRound(players, base, bank, used);
      seen.push(r.round.pairKey);
      used = r.usedPairs;
    }
    expect(new Set(seen).size).toBe(3);
    const r = drawRound(players, base, bank, used);
    expect(r.usedPairs).toEqual(new Set([r.round.pairKey]));
  });

  it('só usa as categorias escolhidas', () => {
    for (let i = 0; i < 50; i++) {
      const { round } = drawRound(players, { ...base, categories: ['b'] }, bank, new Set());
      expect(['Gato', 'Tigre']).toContain(round.crewWord);
    }
  });

  it('sorteia os dois lados do par para os inocentes', () => {
    const words = new Set<string>();
    for (let i = 0; i < 100; i++) {
      words.add(drawRound(players, { ...base, categories: ['b'] }, bank, new Set()).round.crewWord);
    }
    expect(words).toEqual(new Set(['Gato', 'Tigre']));
  });
});

describe('roleFor', () => {
  const { round } = drawRound(players, base, bank, new Set());
  const impostor = round.impostorIds[0];
  const crew = players.find((p) => !round.impostorIds.includes(p))!;

  it('inocente recebe a palavra do grupo', () => {
    expect(roleFor(round, crew)).toEqual({ word: round.crewWord, isImpostor: false });
  });
  it('impostor desavisado parece inocente', () => {
    expect(roleFor(round, impostor)).toEqual({ word: round.impostorWord, isImpostor: false });
  });
  it('impostor avisado sabe que é impostor', () => {
    expect(roleFor({ ...round, impostorKnows: true }, impostor)).toEqual({
      word: round.impostorWord,
      isImpostor: true,
    });
  });
  it('modo sem palavra', () => {
    expect(roleFor({ ...round, mode: 'blank', impostorWord: null }, impostor)).toEqual({
      word: null,
      isImpostor: true,
    });
  });
});

describe('banco de palavras', () => {
  it('pares válidos e sem palavras iguais no mesmo par', () => {
    for (const [id, cat] of Object.entries(realBank)) {
      expect(cat.pairs.length, id).toBeGreaterThanOrEqual(1000);
      for (const [a, b] of cat.pairs) {
        expect(a.trim()).toBeTruthy();
        expect(b.trim()).toBeTruthy();
        expect(a.toLowerCase()).not.toBe(b.toLowerCase());
      }
    }
  });
});
