import { useState } from 'react';
import type { PublicRoomState } from '@impostor/shared';
import type { RoomApi } from '../useRoom';

export default function Result({ room, state }: { room: RoomApi; state: PublicRoomState }) {
  const { result, playerId } = room;
  const [error, setError] = useState<string | null>(null);

  if (!result) return <p className="center muted">Carregando resultado…</p>;

  const plural = result.impostors.length > 1;
  const iWasImpostor = result.impostors.some((i) => i.id === playerId);

  async function next() {
    const res = await room.start();
    setError(res.ok ? null : res.error);
  }

  return (
    <div className="stack">
      <section className="card center stack-sm reveal-card">
        <span className="muted">{plural ? 'Os impostores eram' : 'O impostor era'}</span>
        <div className="impostors">
          {result.impostors.map((i) => (
            <span key={i.id} className="impostor-name">
              {i.name}
              {i.id === playerId && ' (você)'}
            </span>
          ))}
        </div>
      </section>

      <section className="card">
        <ul className="summary">
          <li>
            <span>Palavra do grupo</span>
            <strong>{result.crewWord}</strong>
          </li>
          <li>
            <span>Palavra do impostor</span>
            <strong>{result.impostorWord ?? '— (sem palavra)'}</strong>
          </li>
          {state.categories.length > 1 && (
            <li>
              <span>Categoria</span>
              <strong>{result.categoryLabel}</strong>
            </li>
          )}
        </ul>
        {iWasImpostor && <p className="center small muted">Você era impostor nesta rodada.</p>}
      </section>

      {room.isHost ? (
        <div className="stack-sm">
          <button className="btn primary big" onClick={next}>
            Nova rodada
          </button>
          <button className="btn" onClick={room.toLobby}>
            Voltar ao lobby (mudar configurações)
          </button>
        </div>
      ) : (
        <p className="center muted">Aguardando o anfitrião iniciar a próxima rodada…</p>
      )}
      {error && <p className="error center">{error}</p>}

      <p className="center muted small">Rodada {state.roundNumber}</p>
      <button className="btn ghost" onClick={room.leave}>
        Sair da sala
      </button>
    </div>
  );
}
