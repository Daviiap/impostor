import { useState, type FormEvent } from 'react';
import { MAX_NAME_LENGTH } from '@impostor/shared';
import type { RoomApi } from '../useRoom';

const NAME_KEY = 'impostor:name';

export default function Home({ room }: { room: RoomApi }) {
  const invited = new URLSearchParams(location.search).get('sala')?.toUpperCase() ?? '';
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '');
  const [code, setCode] = useState(invited);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: 'create' | 'join', e?: FormEvent) {
    e?.preventDefault();
    if (!name.trim()) return setError('Digite seu nome.');
    if (action === 'join' && code.trim().length !== 4) return setError('O código da sala tem 4 letras.');
    setBusy(true);
    localStorage.setItem(NAME_KEY, name.trim());
    const res = action === 'create' ? await room.create(name) : await room.join(code, name);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else history.replaceState(null, '', '/');
  }

  return (
    <div className="stack">
      <section className="hero">
        <h1>Jogo do Impostor</h1>
        <p className="muted">
          Todos recebem a mesma palavra, menos o impostor. Deem dicas, desconfiem uns dos outros e
          descubram quem é!
        </p>
      </section>

      {room.notice && <p className="notice">{room.notice}</p>}

      <form className="card stack" onSubmit={(e) => run(invited || code ? 'join' : 'create', e)}>
        <label className="field">
          <span>Seu nome</span>
          <input
            value={name}
            maxLength={MAX_NAME_LENGTH}
            onChange={(e) => setName(e.target.value)}
            placeholder="Como te chamam?"
            autoComplete="nickname"
            autoFocus
          />
        </label>

        {!invited && (
          <>
            <button type="button" className="btn primary" disabled={busy} onClick={() => run('create')}>
              Criar sala
            </button>
            <div className="divider">ou entre numa sala</div>
          </>
        )}

        <label className="field">
          <span>Código da sala</span>
          <input
            className="code-input"
            value={code}
            maxLength={4}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            placeholder="ABCD"
            autoCapitalize="characters"
            autoComplete="off"
          />
        </label>
        <button type="button" className={`btn ${invited ? 'primary' : ''}`} disabled={busy} onClick={() => run('join')}>
          Entrar
        </button>

        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}
