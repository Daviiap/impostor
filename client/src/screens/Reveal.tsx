import { useState } from 'react';
import type { MyRole, PublicRoomState } from '@impostor/shared';
import type { RoomApi } from '../useRoom';
import PlayerList from './PlayerList';

export default function Reveal({ room, state }: { room: RoomApi; state: PublicRoomState }) {
  const [error, setError] = useState<string | null>(null);

  async function reveal() {
    if (!confirm('Revelar quem são os impostores para todos?')) return;
    const res = await room.reveal();
    setError(res.ok ? null : res.error);
  }

  return (
    <div className="stack">
      <p className="center muted">Rodada {state.roundNumber}</p>

      {/* key: cartão volta a ficar escondido a cada rodada nova */}
      <SecretCard key={state.roundNumber} role={room.role} />

      {state.starterName && (
        <p className="center starter">
          Quem começa: <strong>{state.starterName}</strong>
        </p>
      )}
      <p className="center muted small">
        Deem as dicas em voz alta, um de cada vez, e votem em quem acham que é o impostor.
      </p>

      {room.isHost ? (
        <div className="stack-sm">
          <button className="btn primary big" onClick={reveal}>
            Revelar resultado
          </button>
          <button className="btn ghost" onClick={() => confirm('Cancelar a rodada e voltar ao lobby?') && room.toLobby()}>
            Cancelar rodada
          </button>
        </div>
      ) : (
        <p className="center muted">O anfitrião revela o resultado depois da votação.</p>
      )}
      {error && <p className="error center">{error}</p>}

      <details className="card">
        <summary>Jogadores ({state.players.length})</summary>
        <PlayerList room={room} state={state} />
      </details>
    </div>
  );
}

function SecretCard({ role }: { role: MyRole | null }) {
  const [open, setOpen] = useState(false);

  if (!role) {
    return (
      <div className="secret spectator">
        <p>A rodada já começou.</p>
        <p className="muted small">Você entra na próxima!</p>
      </div>
    );
  }

  return (
    <button className={`secret ${open ? 'open' : ''} ${open && role.isImpostor ? 'impostor' : ''}`} onClick={() => setOpen((v) => !v)}>
      {!open ? (
        <>
          <span className="secret-icon">👁️</span>
          <span>Toque para ver sua palavra</span>
          <span className="muted small">Não deixe ninguém espiar!</span>
        </>
      ) : role.isImpostor ? (
        <>
          <span className="role">Você é o IMPOSTOR</span>
          {role.word ? (
            <>
              <span className="muted small">Sua palavra é</span>
              <span className="word">{role.word}</span>
              <span className="muted small">Ela é parecida com a do grupo, mas não é a mesma.</span>
            </>
          ) : (
            <span className="muted small">Você não tem palavra. Preste atenção nas dicas e se misture!</span>
          )}
          <span className="hint">Toque para esconder</span>
        </>
      ) : (
        <>
          <span className="muted small">Sua palavra é</span>
          <span className="word">{role.word}</span>
          <span className="hint">Toque para esconder</span>
        </>
      )}
    </button>
  );
}
