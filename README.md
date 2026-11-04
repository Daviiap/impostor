# 🕵️ Jogo do Impostor

Site multiplayer para jogar o Jogo do Impostor com os amigos, cada um no próprio celular.
Todos recebem a mesma palavra, menos o(s) impostor(es). O sorteio é automático, então ninguém
precisa ficar de fora para distribuir as palavras.

Funciona 100% no **plano gratuito (Spark) do Firebase**: Hosting, Realtime Database e
autenticação anônima. Não há servidor próprio.

## Como jogar
1. Uma pessoa cria a sala e compartilha o código, o link ou o QR code.
2. O anfitrião escolhe:
   - **Modo**
     - **Palavra parecida:** o impostor recebe uma palavra relacionada (ex.: *Praia* × *Piscina*).
     - **Sem palavra:** o impostor só sabe que é o impostor.
   - **Quantidade de impostores:** de 1 até ⌊(jogadores − 1) / 2⌋.
   - **Impostor sabe que é impostor?** Só no modo palavra parecida. Desligado é a regra clássica.
   - O banco tem ~1.270 pares de palavras (`shared/src/words/pt-br.json`, um par por linha).
3. Cada um toca no cartão para ver a palavra. O app sorteia quem começa (no modo sem palavra,
   nunca um impostor).
4. As dicas e a votação acontecem ao vivo. Depois, o anfitrião toca em **Revelar resultado**.

## Deploy no Firebase (gratuito)

Publicado em **https://impostor-krj.web.app** (projeto `impostor-krj`). Para atualizar depois de mudar o código: `npm run deploy`.

### 1. Criar o projeto (uma vez só)
No [Console do Firebase](https://console.firebase.google.com):
1. **Criar projeto.** O plano Spark (gratuito) basta.
2. O login anônimo é ativado pelo próprio deploy (`auth` no `firebase.json`).
3. **Realtime Database → Criar banco de dados.** Escolha um local e comece em *modo bloqueado*;
   as regras do repositório são publicadas no deploy.
4. **Configurações do projeto → Seus apps → Web (`</>`)**: registre um app e copie o `firebaseConfig`.

### 2. Configurar e publicar
```bash
cp client/.env.example client/.env.local   # cole os valores do firebaseConfig (inclusive databaseURL)
npx firebase login
npx firebase use --add                     # escolha o projeto criado
npm run deploy                             # build + publica o site e as regras do banco
```
O site fica em `https://<seu-projeto>.web.app`.

> As chaves do `firebaseConfig` não são secretas: elas vão para o navegador de qualquer jeito.
> A proteção vem das regras em `database.rules.json`.

## Desenvolvimento local
```bash
npm install
npm run dev        # emuladores do Firebase (auth + banco) + Vite em http://localhost:5173
npm test           # testes da lógica + testes ponta a ponta das regras nos emuladores
npm run typecheck
```
- Não precisa de projeto real nem de `.env.local`: o modo dev usa os emuladores (requer Java).
- Cada aba do navegador é um jogador diferente, então dá para testar com várias abas.
- Celulares na mesma rede Wi-Fi podem acessar `http://<IP-do-PC>:5173`.
- O painel dos emuladores fica em http://localhost:4000.

## Como funciona (sem servidor)
- `rooms/{code}`: estado público da sala (jogadores, fase, configurações). Não tem palavras.
- `roles/{code}/{uid}`: a palavra de cada jogador. **Só o próprio jogador consegue ler.**
- `secrets/{code}`: impostores e palavras da rodada. Só o anfitrião lê, para montar o resultado.
- A presença (online/offline) usa o `onDisconnect` do Realtime Database. Se o anfitrião ficar
  offline por mais de 30 s, o jogador online mais antigo assume.

**Limitação:** como não há servidor, quem faz o sorteio é o navegador do anfitrião. Os outros
jogadores não conseguem ver papéis alheios, mas um anfitrião que abra o DevTools de propósito
conseguiria. Entre amigos isso não costuma ser problema. Se precisar evitar, a saída é mover o
sorteio para uma Cloud Function, que exige o plano Blaze.

**Cota gratuita (Spark):** até 100 conexões simultâneas no banco, o que dá cerca de 100 jogadores
online ao mesmo tempo, além de 1 GB armazenado e 10 GB/mês de download. Para jogos entre amigos
sobra bastante. Salas abandonadas ficam no banco (são poucos KB) e o código é reaproveitado
depois de 6 h sem atividade.

## Estrutura
- `shared/`: tipos, regras do jogo (`game.ts`) e banco de palavras (`words/pt-br.json`)
- `client/src/roomService.ts`: operações da sala no Realtime Database
- `client/src/useRoom.ts`: hook React (login anônimo, presença, troca de anfitrião)
- `client/src/screens/`: telas
- `database.rules.json`: regras de segurança · `firebase.json`: Hosting + emuladores
