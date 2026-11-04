import type { PublicRoomState } from '@impostor/shared';
import type { RoomApi } from '../useRoom';

export default function PlayerList({ room, state }: { room: RoomApi; state: PublicRoomState }) {
  async function kick(id: string, name: string) {
    if (confirm(`Remover ${name} da sala?`)) await room.kick(id);
  }

  return (
    <ul className="players">
      {state.players.map((p) => (
        <li key={p.id} className={p.connected ? '' : 'offline'}>
          <span className={`dot ${p.connected ? 'on' : ''}`} />
          <span className="name">
            {p.name}
            {p.id === room.playerId && <span className="muted"> (você)</span>}
          </span>
          {p.id === state.hostId && <span className="tag">anfitrião</span>}
          {p.spectator && <span className="tag">próxima rodada</span>}
          {!p.connected && <span className="tag">offline</span>}
          {room.isHost && p.id !== room.playerId && (
            <button className="kick" onClick={() => kick(p.id, p.name)} aria-label={`Remover ${p.name}`}>
              ×
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
