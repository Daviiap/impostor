import { useRoom } from './useRoom';
import Home from './screens/Home';
import Lobby from './screens/Lobby';
import Reveal from './screens/Reveal';
import Result from './screens/Result';

export default function App() {
  const room = useRoom();
  const { state, connected, restoring } = room;

  let screen;
  if (restoring) screen = <p className="center muted">Reconectando à sala…</p>;
  else if (!state) screen = <Home room={room} />;
  else if (state.phase === 'lobby') screen = <Lobby room={room} state={state} />;
  else if (state.phase === 'playing') screen = <Reveal room={room} state={state} />;
  else screen = <Result room={room} state={state} />;

  return (
    <div className="app">
      {!connected && <div className="banner">Sem conexão… tentando reconectar</div>}
      <header className="topbar">
        <span className="logo">🕵️ Impostor</span>
        {state && (
          <span className="room-chip">
            Sala <strong>{state.code}</strong>
          </span>
        )}
      </header>
      <main>{screen}</main>
    </div>
  );
}
