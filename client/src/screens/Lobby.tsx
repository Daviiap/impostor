import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { MIN_PLAYERS, maxImpostors, type PublicRoomState, type Settings } from '@impostor/shared';
import type { RoomApi } from '../useRoom';
import PlayerList from './PlayerList';

export default function Lobby({ room, state }: { room: RoomApi; state: PublicRoomState }) {
  const [error, setError] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}/?sala=${state.code}`;
  const count = state.players.length;
  const max = maxImpostors(count);

  async function copy() {
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: 'Jogo do Impostor', url: link });
        return;
      }
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setShowQr(true); // clipboard indisponível (ex.: http na rede local): mostra o QR/link
    }
  }

  async function start() {
    const res = await room.start();
    setError(res.ok ? null : res.error);
  }

  return (
    <div className="stack">
      <section className="card center stack-sm">
        <span className="muted">Código da sala</span>
        <div className="big-code">{state.code}</div>
        <div className="row">
          <button className="btn small" onClick={copy}>
            {copied ? 'Link copiado!' : 'Compartilhar link'}
          </button>
          <button className="btn small" onClick={() => setShowQr((v) => !v)}>
            {showQr ? 'Esconder QR' : 'QR code'}
          </button>
        </div>
        {showQr && (
          <div className="qr stack-sm">
            <QRCodeSVG value={link} size={200} marginSize={2} />
            <code className="link">{link}</code>
          </div>
        )}
      </section>

      <section className="card">
        <h2>
          Jogadores <span className="muted">({count})</span>
        </h2>
        <PlayerList room={room} state={state} />
        {count < MIN_PLAYERS && (
          <p className="muted small">Esperando jogadores… mínimo de {MIN_PLAYERS}.</p>
        )}
      </section>

      <section className="card stack-sm">
        <h2>Configurações</h2>
        {room.isHost ? (
          <SettingsEditor room={room} state={state} max={max} />
        ) : (
          <SettingsSummary state={state} />
        )}
      </section>

      {room.isHost ? (
        <button className="btn primary big" disabled={count < MIN_PLAYERS} onClick={start}>
          Começar rodada
        </button>
      ) : (
        <p className="center muted">Aguardando o anfitrião começar…</p>
      )}
      {error && <p className="error center">{error}</p>}

      <button className="btn ghost" onClick={room.leave}>
        Sair da sala
      </button>
    </div>
  );
}

function SettingsEditor({ room, state, max }: { room: RoomApi; state: PublicRoomState; max: number }) {
  const s = state.settings;
  const update = (patch: Partial<Settings>) => room.updateSettings(patch);
  const allIds = state.categories.map((c) => c.id);
  const allSelected = allIds.every((id) => s.categories.includes(id));

  function toggleCategory(id: string) {
    update({
      categories: s.categories.includes(id) ? s.categories.filter((c) => c !== id) : [...s.categories, id],
    });
  }

  return (
    <div className="stack-sm">
      <div className="setting">
        <span className="label">Modo</span>
        <div className="segmented">
          <button className={s.mode === 'similar' ? 'on' : ''} onClick={() => update({ mode: 'similar' })}>
            Palavra parecida
          </button>
          <button className={s.mode === 'blank' ? 'on' : ''} onClick={() => update({ mode: 'blank' })}>
            Sem palavra
          </button>
        </div>
        <p className="muted small">
          {s.mode === 'similar'
            ? 'O impostor recebe uma palavra relacionada à do grupo.'
            : 'O impostor não recebe palavra: só sabe que é o impostor.'}
        </p>
      </div>

      <div className="setting">
        <span className="label">Impostores</span>
        <div className="stepper">
          <button
            disabled={s.impostorCount <= 1}
            onClick={() => update({ impostorCount: s.impostorCount - 1 })}
            aria-label="Menos impostores"
          >
            −
          </button>
          <strong>{s.impostorCount}</strong>
          <button
            disabled={s.impostorCount >= max}
            onClick={() => update({ impostorCount: s.impostorCount + 1 })}
            aria-label="Mais impostores"
          >
            +
          </button>
        </div>
        {s.impostorCount > max ? (
          <p className="error small">Com {state.players.length} jogadores, o máximo é {max}.</p>
        ) : (
          <p className="muted small">Máximo com {state.players.length} jogadores: {max}.</p>
        )}
      </div>

      {s.mode === 'similar' && (
        <label className="setting toggle">
          <input
            type="checkbox"
            checked={s.impostorKnows}
            onChange={(e) => update({ impostorKnows: e.target.checked })}
          />
          <span>
            <span className="label">Impostor sabe que é o impostor</span>
            <span className="muted small block">
              Desligado (clássico): ele só vê a palavra dele e precisa perceber sozinho.
            </span>
          </span>
        </label>
      )}

      {state.categories.length > 1 && (
      <div className="setting">
        <span className="label">Categorias</span>
        <div className="chips">
          <button
            className={`chip ${allSelected ? 'on' : ''}`}
            onClick={() => update({ categories: allSelected ? [] : allIds })}
          >
            Todas
          </button>
          {state.categories.map((c) => (
            <button
              key={c.id}
              className={`chip ${s.categories.includes(c.id) ? 'on' : ''}`}
              onClick={() => toggleCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}

function SettingsSummary({ state }: { state: PublicRoomState }) {
  const s = state.settings;
  const cats = state.categories.filter((c) => s.categories.includes(c.id)).map((c) => c.label);
  return (
    <ul className="summary">
      <li>
        <span>Modo</span>
        <strong>{s.mode === 'similar' ? 'Palavra parecida' : 'Sem palavra'}</strong>
      </li>
      <li>
        <span>Impostores</span>
        <strong>{s.impostorCount}</strong>
      </li>
      {s.mode === 'similar' && (
        <li>
          <span>Impostor sabe?</span>
          <strong>{s.impostorKnows ? 'Sim' : 'Não'}</strong>
        </li>
      )}
      {state.categories.length > 1 && (
        <li>
          <span>Categorias</span>
          <strong>{cats.length === 0 || cats.length === state.categories.length ? 'Todas' : cats.join(', ')}</strong>
        </li>
      )}
    </ul>
  );
}
