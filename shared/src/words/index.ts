import type { WordBank } from '../game';
import raw from './pt-br.json';

/** Valida o JSON na carga: cada par precisa ter exatamente duas palavras diferentes. */
function load(data: Record<string, { label: string; pairs: string[][] }>): WordBank {
  for (const [id, cat] of Object.entries(data)) {
    if (id.includes(':')) throw new Error(`Categoria inválida: ${id}`);
    for (const pair of cat.pairs) {
      if (pair.length !== 2 || pair[0] === pair[1]) {
        throw new Error(`Par inválido em ${id}: ${JSON.stringify(pair)}`);
      }
    }
  }
  return data as WordBank;
}

export const wordBank: WordBank = load(raw);
