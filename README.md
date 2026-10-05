# 📓 Notas — caderno de estudos com IA

Caderno digital no estilo Notability/GoodNotes, com um assistente que **grava a aula, transcreve e gera um resumo fácil de entender**.

## Versão para celular (link do Claude)

`artifact/caderno-de-estudos.html` é uma versão que roda como página do claude.ai: abre no celular sem instalar nada e usa a sua conta Claude para os resumos (sem chave de API). Ela também analisa os **slides** da aula (PDF ou fotos), slide por slide, com o que pode cair na prova e o que o professor explicou em sala. Lá o microfone não está disponível, então a transcrição é colada (ex.: do gravador do celular) ou ditada pelo teclado.

No Caderno também dá para escrever por cima dos slides, criar flashcards com revisão espaçada, tirar dúvidas com a Claude e anexar o áudio do gravador.

## Gravador (GitHub Pages)

O app completo (pasta `src/`) é publicado em `https://alexandremaia22.github.io/Notas/` pelo workflow `.github/workflows/pages.yml`. No celular ele grava a aula, transcreve ao vivo, mantém a tela acesa durante a gravação e copia a transcrição para colar no Caderno de Estudos.

## O que já funciona (MVP)

- **Cadernos e páginas**: crie, renomeie e exclua cadernos; adicione páginas pautadas (formato A4).
- **Escrita à mão**: caneta com sensibilidade à pressão (Apple Pencil, S Pen, canetas Wacom), marca-texto e borracha.
  - Desfazer/refazer (botões ou `Ctrl+Z` / `Ctrl+Shift+Z`).
  - Rejeição de palma: quando uma caneta é detectada, o toque com o dedo passa a rolar a página em vez de desenhar.
- **Gravação de aula**: grava o áudio pelo microfone e mostra a **transcrição ao vivo** em português.
- **Resumo com IA (Claude)**: transforma a transcrição em material de estudo com resumo de 1 minuto, explicação passo a passo, conceitos-chave, exemplos, perguntas para revisão e avisos do professor.
- **Tudo salvo no próprio navegador** (IndexedDB): anotações, áudios, transcrições e resumos. Nada vai para a nuvem, exceto a transcrição enviada para gerar o resumo.

## Arquitetura

```
┌──────────── Navegador (React + TypeScript) ────────────┐
│  Canvas (Pointer Events) ── traços ──► IndexedDB        │
│  MediaRecorder ──────────── áudio ───► IndexedDB        │
│  Web Speech API ─────── transcrição ─► IndexedDB        │
│        │                                                │
│        └── POST /api/summarize (transcrição) ───┐       │
└─────────────────────────────────────────────────┼───────┘
                                                  ▼
                     Servidor Node (server/) ── Claude API
                     guarda a chave e devolve o resumo em streaming
```

- `src/` — front-end (Vite + React 19 + TypeScript).
  - `components/NoteCanvas.tsx` — área de desenho com dois canvas (traços salvos + traço em andamento).
  - `hooks/useLectureRecorder.ts` — gravação de áudio + transcrição ao vivo.
  - `lib/db.ts` — persistência local (IndexedDB).
- `server/` — servidor HTTP mínimo em Node. A chave da API **nunca** vai para o navegador.

## Como rodar

Requisitos: Node.js 22 ou superior.

```bash
npm install
cp .env.example .env      # coloque sua ANTHROPIC_API_KEY no arquivo .env
npm run dev               # abre o front em http://localhost:5173 e a API na porta 8787
```

Sem a chave, o caderno e a gravação funcionam normalmente; só o botão de resumo fica desativado.

### Produção

```bash
npm run build
npm start                 # serve o app e a API em http://localhost:8787
```

O microfone só funciona em `localhost` ou em HTTPS.

### Qualidade

```bash
npm run typecheck   # TypeScript em modo estrito (front, config e servidor)
npm run lint        # oxlint
npm test            # testes unitários e de API (vitest)
```

## Limitações conhecidas

- A **transcrição ao vivo** usa a Web Speech API, disponível no Chrome e no Edge. No Safari e no Firefox o áudio é gravado e a transcrição pode ser colada ou digitada depois.
- A transcrição do navegador pode errar palavras; o resumo foi instruído a lidar com isso e a apontar trechos confusos.
- Os dados ficam só neste navegador. Limpar os dados do site apaga os cadernos.

## Próximos passos sugeridos

1. Transcrição no servidor a partir do áudio gravado (funciona em qualquer navegador e é mais precisa).
2. Sincronização na nuvem e login para usar no tablet e no computador.
3. Importar PDFs/slides da aula e anotar por cima.
4. Ligar trechos do áudio às anotações (tocar na anotação e ouvir aquele momento da aula).
5. Flashcards e quizzes gerados a partir dos resumos.
6. Service worker para uso offline e instalação como app.
