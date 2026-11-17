# DiogoLabs Card Table (`fvtt-card-table`)
**Motor de Cartas para Foundry VTT v14 — Inspirado em Poker, Buraco, Magic: The Gathering e Cockatrice**

Módulo agnóstico de sistema que adiciona uma **Mesa Virtual e Hand Dock em `ApplicationV2`** (estilo Cockatrice), automações completas para **Poker**, **Buraco (Canastra)** e **Magic: The Gathering**, suporte nativo a cartas no Canvas (Standalone ou integrado ao *Complete Card Management*) e fluxo automatizado de atualização de Compêndios via GitHub Actions.

---

## Principais Recursos

1. **Arquitetura de Zonas estilo Cockatrice (`ApplicationV2`):**
   * **Grimório / Baralho (`Library`):** Compra rápida, embaralhamento, *Scry $X$* (inspecionar e enviar para o topo ou fundo) e *London Mulligan*.
   * **Campo de Batalha / Mesa (`TableZone`):** **Tap / Untap (girar 90°)** com 1 clique, **Untap All**, **Contadores (`+1/+1`, Lealdade, Carga)**, **Cartas Dupla Face (DFC)**, criação de **Tokens** e agrupamento de jogos.
   * **Mão do Jogador (`Hand Dock`):** Ordenação instantânea por **Naipe**, **Valor** ou **Custo de Mana (CMC)**, seleção múltipla e `Shift + Clique` para baixar cartas viradas para baixo (*Face Down*).
2. **Modo Poker (Texas Hold'em / Omaha):**
   * Distribuição de *Hole Cards*, abertura de **Flop (3)**, **Turn (1)** e **River (1)** com queima automática (*Burn Card*) e controle de **Pote de Fichas**.
3. **Modo Buraco / Canastra:**
   * Preparação automática da mesa (separa os **2 Mortos de 11 cartas**, distribui **11 cartas por jogador** já ordenadas por naipe e abre o **Lixo**).
   * Compra do Lixo inteiro, baixada de jogos agrupados e detecção automática de **Canastra Limpa (+200 pts)** e **Canastra Suja (+100 pts)** com soma da pontuação das cartas.
4. **Modo Standalone + Integração Opcional com Complete Card Management (CCM):**
   * Funciona 100% sozinho (incluindo arrastar cartas para o Canvas como Tiles sincronizados que giram 90° ao dar Tap) e também detecta o módulo `complete-card-management` caso esteja ativo.
5. **Atualização Contínua via GitHub:**
   * Os baralhos ficam salvos como JSON legível em `packs/decks/_source/`.
   * O workflow `.github/workflows/release.yml` compila automaticamente os arquivos para LevelDB usando `@foundryvtt/foundryvtt-cli` e publica `module.json` + `module.zip`.
   * Ao iniciar o mundo no Foundry, o módulo sincroniza os baralhos já importados com as novidades do Compêndio sem perder o progresso da mesa.

---

## Instalação no Foundry VTT

Use a URL do Manifesto na tela de instalação de módulos do Foundry VTT:
```text
https://github.com/diogolabs/fvtt-card-table/releases/latest/download/module.json
```

---

## Comandos de Desenvolvimento (`@foundryvtt/foundryvtt-cli`)

```bash
# Instalar dependências
npm install

# Compilar os JSONs de packs/decks/_source para o banco LevelDB do Foundry
npm run pack

# Extrair alterações feitas dentro do Foundry de volta para JSON legível no Git
npm run unpack
```
