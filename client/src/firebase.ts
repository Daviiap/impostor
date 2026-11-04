import { initializeApp } from 'firebase/app';
import { browserSessionPersistence, connectAuthEmulator, initializeAuth } from 'firebase/auth';
import { connectDatabaseEmulator, getDatabase } from 'firebase/database';

const env = import.meta.env;
export const usingEmulator = env.VITE_USE_EMULATOR === '1';

const config = usingEmulator
  ? {
      apiKey: 'demo-key',
      projectId: 'demo-impostor',
      databaseURL: 'https://demo-impostor-default-rtdb.firebaseio.com',
    }
  : {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      databaseURL: env.VITE_FIREBASE_DATABASE_URL,
      appId: env.VITE_FIREBASE_APP_ID,
    };

if (!usingEmulator && !config.databaseURL) {
  throw new Error('Configuração do Firebase ausente: crie client/.env.local a partir de client/.env.example');
}

const app = initializeApp(config);

// Sessão por aba: cada aba é um jogador, e recarregar a página mantém o mesmo jogador.
export const auth = initializeAuth(app, { persistence: browserSessionPersistence });
export const db = getDatabase(app);

if (usingEmulator) {
  const host = location.hostname; // funciona também no celular, acessando pelo IP do PC
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectDatabaseEmulator(db, host, 9000);
}
