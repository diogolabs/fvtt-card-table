# Guia do Desenvolvedor & Log de Arquitetura (`fvtt-card-table`)

Este documento registra toda a arquitetura, decisões técnicas, modelo de dados, histórico de releases e instruções de manutenção do módulo **DiogoLabs Card Table (`fvtt-card-table`)**, desenvolvido para **Foundry VTT v14 (e v13)**.

O objetivo deste guia é permitir que qualquer programador assuma o projeto e continue a evolução com total contexto.

---

## 1. Visão Geral do Projeto

* **ID do Módulo no Foundry:** `fvtt-card-table`
* **Repositório Oficial:** `https://github.com/diogolabs/fvtt-card-table`
* **Escopo:** Módulo **agnóstico de sistema** (`system: ""`) que transforma o sistema nativo de cartas do Foundry VTT (`Cards` e `Card`) em uma mesa virtual completa inspirada no **Cockatrice**, com motores de regras dedicados para:
  1. **Poker (Texas Hold'em / Omaha):** Mesa com Crupiê (5 slots comunitários Flop/Turn/River + queima automática), área separada de Showdown, banca individual de fichas por jogador, Check/Call inteligente, apostas rápidas/customizadas, All-In, Fold, Zerar Pote e Entregar Pote ao vencedor.
  2. **Buraco / Canastra:** Baralho duplo (108 cartas), preparação automática de 2 Mortos (11 cartas cada), mãos de 11 cartas ordenadas por naipe, compra do Lixo, baixada de jogos agrupados (`meldGroupId`) e cálculo automático de pontos + bônus de Canastra Limpa (+200) e Suja (+100).
  3. **Magic: The Gathering / Cockatrice:** Tap/Untap (rotação de 90° sincronizada com a UI e Tiles no Canvas), Untap All, Contadores (`+1/+1`, Lealdade, Carga), Anexos (`attachedTo`), criação de Tokens, London Mulligan e janela interativa de **Scry / Peek** (reordenar topo ou enviar para o fundo do grimório).

---

## 2. Estratégia de Branches e Releases (Foundry v14 vs. Foundry v13)

Para suportar simultaneamente o **Foundry VTT 14** e o **Foundry VTT 13** no mesmo repositório GitHub sem conflitos de atualização:

| Ambiente Alvo | Branch Git | Tag / Release | URL do Manifesto (Instalação no Foundry) | Observação Técnica |
| :--- | :--- | :--- | :--- | :--- |
| **Foundry VTT 14** | `main` | `v1.0.x` (**Latest**) | `https://github.com/diogolabs/fvtt-card-table/releases/latest/download/module.json` | Usa a flag `--latest=true` no GitHub Releases. |
| **Foundry VTT 13** | `v13` | `v13.0.x` | `https://github.com/diogolabs/fvtt-card-table/releases/download/v13.0.0/module.json` | Usa `--latest=false` e trava `"maximum": "13"` no `module.json` para não atualizar para a v14 por engano. |

---

## 3. Histórico do que foi Construído (Changelog Técnico)

### `v1.0.0` — Arquitetura Inicial (Foundry VTT v14)
* Criação da estrutura base do módulo com ESModules (`src/main.mjs`), estilos (`styles/card-table.css`), internacionalização (`lang/pt-BR.json`, `lang/en.json`) e fontes JSON de compêndio (`packs/decks/_source/`).
* Implementação da interface em **`ApplicationV2`** (`HandlebarsApplicationMixin(ApplicationV2)`), livre de jQuery, usando `DEFAULT_OPTIONS`, `PARTS` e `actions` declarativos.
* Implementação do `CardStateManager` e `CardEngine` com suporte a MTG/Cockatrice, Poker e Buraco.
* Suporte a arrastar cartas para o Canvas no modo **Standalone** (criando `TileDocument` vinculado via `flags.fvtt-card-table.cardUuid`) e ponte de compatibilidade opcional caso o módulo **Complete Card Management (`complete-card-management`)** esteja ativo.

### `v13.0.0` — Adaptação Dedicada para Foundry VTT v13 (Branch `v13`)
* Criação da branch `v13` com `compatibility` restrita à v13 (`minimum: "13"`, `verified: "13"`, `maximum: "13"`).
* Padronização das chamadas `app.render({ force: true })` para eliminar avisos de depreciação da v13.
* Adaptação do hook `getSceneControlButtons` para suportar tanto estrutura em Objeto (`controls.tokens.tools.cardTableBoard`) quanto Array.
* Adição do botão `"♦ Mesa de Cartas"` diretamente no cabeçalho da aba `CardsDirectory` da barra lateral direita.
* Criação do método `CardEngine.bootstrapWorldZones(mode)`, gerando programaticamente baralhos completos (52 cartas de Poker, 108 de Buraco com 4 Jokers, ou Grimório MTG) + zonas da mesa com 1 clique.

### `v1.0.1` — Mesa Estilo Crupiê (Texas Hold'em) & Mãos Privadas Automáticas
* **Isolamento de Mãos Privadas (`ensureUserPrivateHand`):**
  * Criação automática de uma `Hand` para cada jogador cadastrado no mundo (`Mão de <Nome>`).
  * Configuração automática de permissões: `ownership: { default: NONE, [user.id]: OWNER }`.
  * Vinculação explícita via flag `stackState.ownerUserId = user.id`. Isso resolveu o problema clássico do Foundry onde o **GM (Mestre)**, por ter permissão `OWNER` global em tudo, acabava visualizando a mão do primeiro jogador da lista em vez da sua própria mão.
* **Mesa Visual do Crupiê no Poker:**
  * Divisão da zona central do Poker em duas áreas distintas usando a flag `state.boardRole`:
    1. **Board do Crupiê (`boardRole: "community"`):** Exibe os **5 Slots Oficiais** (`FLOP 1`, `FLOP 2`, `FLOP 3`, `TURN`, `RIVER`).
    2. **Área de Showdown (`boardRole: "showdown"`):** Exibe as cartas que os jogadores baixam da própria mão (`⬆️ Jogar`), identificando quem jogou cada carta (`state.playedBy`).
  * Adição do botão **`Crupiê: Próxima Etapa`** (`stage: "auto"`), que verifica quantas cartas comunitárias já estão abertas (0 → abre Flop com 3; 3 → abre Turn com 1; 4 → abre River com 1), queimando automaticamente 1 carta fechada (`face: null`) na pilha de *Queima / Muck* antes de cada etapa.

### `v1.0.2` — Controle de Modo Exclusivo do GM & Responsividade de Tela
* **Restrição de Controles ao GM (`context.isGM`):**
  * Os botões de troca de jogo (`Poker`, `Buraco`, `MTG`), `Preparar Mesa`, `Resetar` e ações do Crupiê passaram a ser renderizados apenas para o GM (`{{#if isGM}}`).
  * A escolha do modo de jogo foi vinculada ao `game.settings` (`defaultGameMode` com escopo `world` e callback `onChange`), sincronizando automaticamente a tela de todos os jogadores quando o GM muda o jogo.
* **Correção da Área de Descarte e Barra de Rolagem Vertical:**
  * Restrição rígida das dimensões da miniatura do topo do descarte (`.fvtt-ct-card-mini img` fixado em `44px x 62px`) para impedir que imagens grandes expandam a barra lateral.
  * Remoção de `overflow: hidden` no grid principal e ativação de `overflow-y: auto !important` em `.fvtt-card-table-app .window-content`, garantindo barra de rolagem vertical em qualquer resolução de monitor.

### `v1.0.3` — Sistema Completo de Banca de Fichas, Apostas e Pote (Opção 1)
* **Banca de Fichas por Jogador (`stackState.chips`, `roundBet`, `folded`):**
  * Cada mão privada de jogador armazena seu saldo de fichas (padrão inicial: `1000`), quanto apostou na street atual (`roundBet`) e se desistiu (`folded`).
* **Ações de Aposta do Jogador:**
  * `checkOrCall`: Calcula `toCall = Math.max(0, table.currentBet - hand.roundBet)`. Se `0`, anuncia *Check (Mesa)*; se `> 0`, desconta a diferença exata da banca do jogador e soma ao Pote (*Call*).
  * Botões de fichas rápidas (`+10`, `+25`, `+50`, `+100`) e input numérico para aposta customizada.
  * `allIn`: Aposta todo o saldo restante (`chips`) do jogador.
  * `fold`: Envia todas as cartas da mão viradas para baixo (`face: null`) para a pilha de *Queima / Muck* e marca `folded: true`.
* **Gestão do Pote pelo GM / Crupiê:**
  * Quadro lateral **Banca dos Jogadores** listando o saldo de fichas e a aposta na rodada de cada participante.
  * Botão **`🏆 Dar Pote`** ao lado de cada jogador (transfere todo o `pot` da mesa para o `chips` do vencedor e zera o pote).
  * Botão **`🧹 Zerar Pote`** e botão **`🪙 Buy-in (1.000)`** para resetar/abastecer as bancas.

---

## 4. Mapa de Arquivos do Projeto

```text
fvtt-card-table/
├── .github/
│   └── workflows/
│       └── release.yml              # CI/CD: Compila JSON -> LevelDB e publica release
├── lang/
│   ├── en.json                      # Traduções em Inglês
│   └── pt-BR.json                   # Traduções em Português (Brasil)
├── packs/
│   └── decks/
│       └── _source/                 # Fontes JSON dos baralhos (versionados no Git)
│           ├── buraco_double_deck.json
│           ├── mtg_starter_deck.json
│           └── poker_standard_deck.json
├── scripts/
│   └── release.workflow.yml         # Cópia de referência do workflow do GitHub Actions
├── src/
│   ├── api/
│   │   └── card-engine.mjs          # Regras de negócio (Poker, Buraco, MTG, Sort, Bootstrap)
│   ├── apps/
│   │   └── tabletop-app.mjs         # UI em ApplicationV2 (TabletopBoardApp e ScryDialogApp)
│   ├── models/
│   │   └── card-state.mjs           # Schemas de Flags e helpers (CardStateManager)
│   └── main.mjs                     # Entrypoint, Hooks do Foundry, Settings e Keybindings
├── styles/
│   └── card-table.css               # Estilos da mesa, slots do Crupiê, fichas, rotação 90° e scroll
├── templates/
│   ├── scry-dialog.hbs              # Template Handlebars da janela de Scry
│   └── tabletop.hbs                 # Template Handlebars principal da Mesa de Cartas
├── DEVELOPER_GUIDE.md               # Este documento de orientação técnica
├── README.md                        # Documentação de uso e instalação
├── module.json                      # Manifesto oficial do Foundry VTT
└── package.json                     # Scripts NPM (@foundryvtt/foundryvtt-cli)
```

---

## 5. Modelo de Dados (Flags do Foundry VTT)

Como o módulo é agnóstico de sistema (`system: ""`), todos os dados extras são persistidos no banco do Foundry através de **Document Flags** sob o namespace `fvtt-card-table`.

### 5.1. Flags no Documento `Card` (`card.getFlag("fvtt-card-table", "state")`)
Gerenciado por `CardStateManager.getCardState(card)` e `updateCardState(card, patch)` em `src/models/card-state.mjs`:

```javascript
{
  tapped: false,              // Boolean: true = rotacionada a 90° (Tap no MTG / Fecho de Canastra)
  attachedTo: null,           // String|null: ID da carta pai anexada
  meldGroupId: null,          // String|null: ID do grupo de sequência/canastra na mesa (Buraco)
  isWildcard: false,          // Boolean: true se for curinga (Joker ou 2 no Buraco)
  boardRole: null,            // "community" (5 cartas do Crupiê) | "showdown" (revelada por jogador)
  communitySlot: null,        // Number (1..5): Posição no board do Crupiê
  playedBy: "",               // String: Nome do jogador que jogou a carta na mesa
  peekingUsers: [],           // String[]: IDs de usuários com permissão de espiar a carta
  counters: {
    plusOne: 0,               // Marcadores +1/+1
    loyalty: 0,               // Marcadores de Lealdade
    charge: 0,                // Marcadores de Carga
    custom: []                // Array de objetos { label, value, color }
  },
  metadata: {
    manaCost: "",
    cmc: 0,
    cardTypes: [],
    power: "",
    toughness: "",
    pointValue: 0             // Pontuação da carta no Buraco
  }
}
```

### 5.2. Flags no Documento `Cards` (`stack.getFlag("fvtt-card-table", "stackState")`)
Gerenciado por `CardStateManager.getStackState(stack)` e `updateStackState(stack, patch)`:

```javascript
{
  gameMode: "poker",          // "poker" | "buraco" | "mtg" | "generic"
  zoneType: "deck",           // "library" | "hand" | "battlefield" | "graveyard" | "exile" | "lixo" | "morto" | "meld" | "community" | "burn"
  ownerUserId: null,          // String|null: ID do User dono exclusivo desta Hand
  chips: 1000,                // Number: Saldo de fichas do jogador (quando type === "hand")
  roundBet: 0,                // Number: Total apostado pelo jogador na street atual
  folded: false,              // Boolean: Se o jogador deu Fold na rodada atual
  pot: 0,                     // Number: Pote total acumulado na mesa (quando zoneType === "community")
  currentBet: 0,              // Number: Maior aposta a ser coberta na street atual
  teamId: null,               // String|null: Identificador de dupla no Buraco
  sourceCompendiumUuid: null, // String|null: UUID de origem para sincronismo de versão
  sourceVersion: "1.0.3"
}
```

---

## 6. Como Publicar Novas Atualizações (Workflow para o Programador)

### 6.1. Publicando uma nova versão para o Foundry 14 (Branch `main`)
1. Certifique-se de estar na branch `main`:
   ```bash
   git checkout main
   ```
2. Atualize o campo `"version"` no arquivo `module.json` (ex: `"1.0.4"`).
3. Faça o commit e o push para o GitHub:
   ```bash
   git add .
   git commit -m "feat: descrição da melhoria"
   git push origin main
   ```
4. Gere o pacote `module.zip` e publique a Release marcada como `--latest=true`:
   ```bash
   git archive --format=zip --output=module.zip main
   gh release create v1.0.4 module.json module.zip --repo diogolabs/fvtt-card-table --target main --latest=true --title "v1.0.4 - Título" --notes "Notas da versão"
   ```

### 6.2. Publicando uma atualização para o Foundry 13 (Branch `v13`)
1. Mude para a branch `v13` e traga os arquivos desejados da `main` (mantendo o `module.json` com `"minimum": "13", "verified": "13", "maximum": "13"` e URLs apontando para a tag da v13):
   ```bash
   git checkout v13
   git checkout main -- src/ templates/ styles/ lang/
   ```
2. Faça o commit, gere o `module.zip` e publique com `--latest=false` (para não sobrescrever o `latest` da v14):
   ```bash
   git commit -am "feat(v13): sincroniza recursos com a main"
   git push origin v13
   git archive --format=zip --output=module.zip v13
   gh release create v13.0.1 module.json module.zip --repo diogolabs/fvtt-card-table --target v13 --latest=false --title "v13.0.1 - Edição Foundry v13" --notes "Notas da versão v13"
   ```

---

## 7. Próximos Passos Sugeridos (Backlog Técnico)

Para o desenvolvedor que dará sequência ao projeto, estas são as evoluções naturais já previstas na arquitetura:

1. **Avaliador Automático de Mãos de Poker no Showdown (`Hand Evaluator`):**
   * Criar uma função em `CardEngine.poker.evaluateShowdown(communityPile)` que lê as 5 cartas comunitárias (`boardRole: "community"`) + as 2 cartas de cada jogador no Showdown (`boardRole: "showdown"` agrupadas por `playedBy`) e anuncia automaticamente quem tem a melhor mão (*Royal Flush, Straight Flush, Quadra, Full House, Flush, Sequência, Trinca, Dois Pares, Par ou Carta Alta*).
2. **Artes SVG Individualizadas para as 52 Cartas:**
   * Atualmente, o gerador automático (`bootstrapWorldZones`) usa o ícone nativo de cartas do Foundry (`icons/sundries/gaming/playing-cards-grey.webp`) ou os SVGs nativos do diretório `cards/` do Foundry (`cards/light-gold/...`). Mapear cada naipe e valor em `buildStandard52()` para os caminhos nativos `cards/light-gold/spades-a.svg` etc. fará com que cada carta exiba sua arte real automaticamente!
3. **Blinds Automáticos e Botão de Dealer (Small Blind / Big Blind):**
   * Adicionar um marcador rotativo de `Dealer (D)`, `Small Blind (SB)` e `Big Blind (BB)` na lista `playerChipStacks`, descontando automaticamente os Blinds ao clicar em `Nova Mão`.
4. **Suporte a Duplas no Buraco (Zona da Dupla 1 vs. Dupla 2):**
   * Permitir criar duas pilhas de `meld` separadas na mesa de Buraco para partidas 2x2, somando o placar da Dupla A e da Dupla B separadamente.
