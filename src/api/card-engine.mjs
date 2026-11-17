import { MODULE_ID, CardStateManager } from "../models/card-state.mjs";
import { ScryDialogApp } from "../apps/tabletop-app.mjs";

const SUIT_ORDER = { spades: 1, hearts: 2, clubs: 3, diamonds: 4, joker: 5 };

/**
 * Motor principal de automação de cartas (Cockatrice, MTG, Poker e Buraco)
 */
export class CardEngine {
  /* ======================================================================== */
  /*  UTILITÁRIOS GERAIS & ORDENAÇÃO (COCKATRICE UX)                          */
  /* ======================================================================== */

  /**
   * Ordena uma mão ou pilha por Naipe + Valor, apenas Valor, ou Custo de Mana (CMC)
   * @param {Cards} stack - Documento Cards (Mão ou Pilha)
   * @param {"suit"|"value"|"cmc"|"name"} by - Critério de ordenação
   */
  static async sortStack(stack, by = "suit") {
    const cards = [...stack.cards.contents];
    cards.sort((a, b) => {
      if (by === "suit") {
        const suitA = SUIT_ORDER[a.suit?.toLowerCase()] ?? 99;
        const suitB = SUIT_ORDER[b.suit?.toLowerCase()] ?? 99;
        if (suitA !== suitB) return suitA - suitB;
        return (a.value ?? 0) - (b.value ?? 0);
      }
      if (by === "value") {
        const valDiff = (a.value ?? 0) - (b.value ?? 0);
        if (valDiff !== 0) return valDiff;
        const suitA = SUIT_ORDER[a.suit?.toLowerCase()] ?? 99;
        const suitB = SUIT_ORDER[b.suit?.toLowerCase()] ?? 99;
        return suitA - suitB;
      }
      if (by === "cmc") {
        const cmcA = CardStateManager.getCardState(a).metadata?.cmc ?? a.value ?? 0;
        const cmcB = CardStateManager.getCardState(b).metadata?.cmc ?? b.value ?? 0;
        if (cmcA !== cmcB) return cmcA - cmcB;
        return a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name);
    });

    const updates = cards.map((c, idx) => ({ _id: c.id, sort: (idx + 1) * 100 }));
    if (updates.length) {
      await stack.updateEmbeddedDocuments("Card", updates);
    }
    return stack;
  }

  /**
   * Sincroniza baralhos já importados no Mundo com as versões mais recentes do Compêndio
   * (Garante atualizações consistentes via GitHub sem quebrar partidas em andamento)
   */
  static async syncWorldDecksWithCompendium({ notify = true } = {}) {
    const pack = game.packs.get(`${MODULE_ID}.decks`);
    if (!pack) return 0;

    const moduleVersion = game.modules.get(MODULE_ID)?.version ?? "1.0.0";
    const packDocs = await pack.getDocuments();
    let updatedCount = 0;

    for (const packDeck of packDocs) {
      const worldDeck = game.cards.find(
        (c) =>
          c.getFlag(MODULE_ID, "stackState.sourceCompendiumUuid") === packDeck.uuid ||
          (c.name === packDeck.name && c.type === "deck")
      );
      if (!worldDeck) continue;

      const currentVersion = CardStateManager.getStackState(worldDeck).sourceVersion;
      if (currentVersion === moduleVersion) continue;

      // Atualiza metadados, imagens e descrições das cartas existentes mantendo estado drawn/sort
      const updates = [];
      for (const srcCard of packDeck.cards) {
        const targetCard = worldDeck.cards.find((c) => c.name === srcCard.name && c.suit === srcCard.suit);
        if (targetCard) {
          updates.push({
            _id: targetCard.id,
            description: srcCard.description,
            faces: srcCard.faces,
            back: srcCard.back,
            value: srcCard.value,
            [`flags.${MODULE_ID}`]: srcCard.flags?.[MODULE_ID] ?? {}
          });
        }
      }

      if (updates.length > 0) {
        await worldDeck.updateEmbeddedDocuments("Card", updates);
      }
      await CardStateManager.updateStackState(worldDeck, {
        sourceCompendiumUuid: packDeck.uuid,
        sourceVersion: moduleVersion
      });
      updatedCount++;
    }

    if (notify && updatedCount > 0) {
      ui.notifications.info(
        game.i18n.format("FVTT_CARD_TABLE.Notifications.DecksSynced", {
          count: updatedCount,
          version: moduleVersion
        })
      );
    }
    return updatedCount;
  }

  /* ======================================================================== */
  /*  MECÂNICAS MAGIC: THE GATHERING & COCKATRICE                             */
  /* ======================================================================== */

  static mtg = {
    /**
     * Vira (Tap 90°) ou desvira (Untap 0°) uma carta na mesa (Atalho estilo Cockatrice: Duplo Clique)
     * @param {Card} card
     */
    async toggleTap(card) {
      const state = CardStateManager.getCardState(card);
      const nextTapped = !state.tapped;
      await CardStateManager.updateCardState(card, { tapped: nextTapped });

      // Se houver Tile correspondente no Canvas (modo Standalone ou CCM), rotaciona 90 graus
      if (canvas?.ready) {
        const linkedTiles = canvas.scene.tiles.filter(
          (t) => t.getFlag(MODULE_ID, "cardUuid") === card.uuid
        );
        for (const tile of linkedTiles) {
          await tile.update({ rotation: nextTapped ? 90 : 0 });
        }
      }
      return nextTapped;
    },

    /**
     * Desvira todas as cartas de uma zona de campo de batalha (Ctrl+U no Cockatrice)
     * @param {Cards} battlefieldPile
     */
    async untapAll(battlefieldPile) {
      const updates = battlefieldPile.cards.map((c) => ({
        _id: c.id,
        [`flags.${MODULE_ID}.state.tapped`]: false
      }));
      if (updates.length) {
        await battlefieldPile.updateEmbeddedDocuments("Card", updates);
      }
      if (canvas?.ready) {
        const cardUuids = new Set(battlefieldPile.cards.map((c) => c.uuid));
        const tileUpdates = canvas.scene.tiles
          .filter((t) => cardUuids.has(t.getFlag(MODULE_ID, "cardUuid")))
          .map((t) => ({ _id: t.id, rotation: 0 }));
        if (tileUpdates.length) {
          await canvas.scene.updateEmbeddedDocuments("Tile", tileUpdates);
        }
      }
      ui.notifications.info(game.i18n.localize("FVTT_CARD_TABLE.Notifications.UntappedAll"));
    },

    /**
     * Modifica um contador na carta (+1/+1, lealdade, carga)
     * @param {Card} card
     * @param {"plusOne"|"loyalty"|"charge"} counterType
     * @param {number} delta
     */
    async modifyCounter(card, counterType = "plusOne", delta = 1) {
      const state = CardStateManager.getCardState(card);
      const current = state.counters?.[counterType] ?? 0;
      const nextVal = Math.max(0, current + delta);
      await CardStateManager.updateCardState(card, {
        counters: {
          ...state.counters,
          [counterType]: nextVal
        }
      });
      return nextVal;
    },

    /**
     * Anexa uma carta a outra (ex: Aura, Equipamento)
     * @param {Card} attachmentCard
     * @param {Card|null} targetCard
     */
    async attachCard(attachmentCard, targetCard = null) {
      return CardStateManager.updateCardState(attachmentCard, {
        attachedTo: targetCard ? targetCard.id : null
      });
    },

    /**
     * Abre a janela de Scry / Peek nas X cartas do topo do baralho
     * Permite colocar cartas no topo (em qualquer ordem) ou no fundo do grimório
     * @param {Cards} deck
     * @param {number} count
     */
    async scry(deck, count = 2) {
      const available = [...deck.availableCards].sort((a, b) => a.sort - b.sort);
      const topCards = available.slice(0, count);
      if (topCards.length === 0) {
        ui.notifications.warn(game.i18n.localize("FVTT_CARD_TABLE.Notifications.EmptyDeck"));
        return;
      }
      const dialog = new ScryDialogApp({ deck, cards: topCards });
      dialog.render(true);
      return dialog;
    },

    /**
     * Aplica a resolução do Scry (cartas que ficam no topo vs cartas enviadas ao fundo)
     * @param {Cards} deck
     * @param {string[]} topCardIds - IDs na ordem do topo
     * @param {string[]} bottomCardIds - IDs enviados para o fundo
     */
    async resolveScry(deck, topCardIds = [], bottomCardIds = []) {
      const allCards = [...deck.availableCards].sort((a, b) => a.sort - b.sort);
      const minSort = allCards.length ? allCards[0].sort : 0;
      const maxSort = allCards.length ? allCards[allCards.length - 1].sort : 0;

      const updates = [];
      topCardIds.forEach((id, index) => {
        updates.push({
          _id: id,
          sort: minSort - (topCardIds.length - index) * 100
        });
      });
      bottomCardIds.forEach((id, index) => {
        updates.push({
          _id: id,
          sort: maxSort + (index + 1) * 100
        });
      });

      if (updates.length) {
        await deck.updateEmbeddedDocuments("Card", updates);
      }

      await ChatMessage.create({
        content: `<div class="fvtt-card-table-chat"><strong>${game.user.name}</strong> realizou <em>Scry ${topCardIds.length + bottomCardIds.length}</em> (${topCardIds.length} no topo, ${bottomCardIds.length} no fundo).</div>`
      });
    },

    /**
     * Executa um London Mulligan: devolve a mão para o baralho, embaralha e compra N cartas
     * @param {Cards} hand
     * @param {Cards} deck
     * @param {number} drawCount
     */
    async mulligan(hand, deck, drawCount = 7) {
      await hand.recall({ chatNotification: false });
      await deck.shuffle({ chatNotification: false });
      await hand.draw(deck, drawCount, { how: CONST.CARD_DRAW_MODES.TOP, chatNotification: true });
      ui.notifications.info(
        game.i18n.format("FVTT_CARD_TABLE.Notifications.MulliganDone", { count: drawCount })
      );
    },

    /**
     * Cria uma ficha (Token de criatura/tesouro) diretamente no Campo de Batalha
     * @param {Cards} battlefieldPile
     * @param {object} tokenConfig
     */
    async createToken(
      battlefieldPile,
      { name = "Treasure Token", img = "icons/commodities/currency/coins-assorted-mix-copper-silver-gold.webp", power = "", toughness = "", types = ["Token", "Artifact", "Treasure"] } = {}
    ) {
      const created = await battlefieldPile.createEmbeddedDocuments("Card", [
        {
          name,
          type: "base",
          face: 0,
          faces: [{ name, img, text: types.join(" — ") }],
          back: { name: "Token", img },
          [`flags.${MODULE_ID}.state`]: {
            tapped: false,
            counters: { plusOne: 0, loyalty: 0, charge: 0, custom: [] },
            metadata: {
              cardTypes: types,
              power,
              toughness
            }
          }
        }
      ]);
      return created[0];
    }
  };

  /* ======================================================================== */
  /*  MECÂNICAS DE POKER (TEXAS HOLD'EM / OMAHA)                              */
  /* ======================================================================== */

  static poker = {
    /**
     * Prepara uma nova rodada de Poker: recolhe todas as cartas, embaralha e distribui as Hole Cards
     * @param {Cards} deck - Baralho de 52 cartas
     * @param {Cards[]} playerHands - Mãos dos jogadores na mesa
     * @param {number} holeCardCount - 2 para Texas Hold'em, 4 para Omaha
     */
    async startRound(deck, playerHands = [], holeCardCount = 2) {
      await deck.recall({ chatNotification: false });
      await deck.shuffle({ chatNotification: true });
      if (playerHands.length > 0) {
        await deck.deal(playerHands, holeCardCount, {
          how: CONST.CARD_DRAW_MODES.TOP,
          chatNotification: true
        });
      }
    },

    /**
     * Queima 1 carta (Burn) e abre as cartas comunitárias (Flop = 3, Turn = 1, River = 1)
     * @param {Cards} deck
     * @param {Cards} burnPile
     * @param {Cards} communityPile
     * @param {"flop"|"turn"|"river"} stage
     */
    async dealCommunity(deck, burnPile, communityPile, stage = "flop") {
      // 1. Queima 1 carta virada para baixo (face: null)
      if (burnPile && deck.availableCards.length > 0) {
        await burnPile.draw(deck, 1, {
          how: CONST.CARD_DRAW_MODES.TOP,
          updateData: { face: null },
          chatNotification: false
        });
      }

      // 2. Abre as cartas comunitárias viradas para cima (face: 0)
      const count = stage === "flop" ? 3 : 1;
      const drawn = await communityPile.draw(deck, count, {
        how: CONST.CARD_DRAW_MODES.TOP,
        updateData: { face: 0 },
        chatNotification: true
      });

      await ChatMessage.create({
        content: `<div class="fvtt-card-table-chat"><strong>Poker (${stage.toUpperCase()}):</strong> ${drawn.map((c) => `[${c.name}]`).join(" ")}</div>`
      });
      return drawn;
    },

    /**
     * Registra uma aposta no Pote da mesa
     * @param {Cards} communityPile
     * @param {number} amount
     * @param {string} playerName
     */
    async bet(communityPile, amount, playerName = game.user.name) {
      const state = CardStateManager.getStackState(communityPile);
      const nextPot = (state.pot ?? 0) + Number(amount);
      await CardStateManager.updateStackState(communityPile, {
        pot: nextPot,
        currentBet: Number(amount)
      });
      await ChatMessage.create({
        content: `<div class="fvtt-card-table-chat"><strong>${playerName}</strong> apostou <strong>${amount} fichas</strong>. Pote Total: <strong>${nextPot}</strong>.</div>`
      });
      return nextPot;
    }
  };

  /* ======================================================================== */
  /*  MECÂNICAS DE BURACO / CANASTRA                                          */
  /* ======================================================================== */

  static buraco = {
    /**
     * Prepara a mesa completa de Buraco:
     * - Recolhe e embaralha o baralho duplo (104 ou 108 cartas)
     * - Separa os 2 Mortos com 11 cartas cada (virados para baixo)
     * - Distribui 11 cartas para cada jogador e ordena por naipe
     * - Vira a 1ª carta do Lixo
     * @param {object} config
     */
    async setupTable({ deck, playerHands = [], morto1, morto2, lixoPile }) {
      await deck.recall({ chatNotification: false });
      await deck.shuffle({ chatNotification: false });

      // Cria os dois Mortos de 11 cartas
      if (morto1) {
        await morto1.draw(deck, 11, {
          how: CONST.CARD_DRAW_MODES.TOP,
          updateData: { face: null },
          chatNotification: false
        });
      }
      if (morto2) {
        await morto2.draw(deck, 11, {
          how: CONST.CARD_DRAW_MODES.TOP,
          updateData: { face: null },
          chatNotification: false
        });
      }

      // Distribui 11 cartas para cada jogador e ordena por Naipe + Valor
      if (playerHands.length > 0) {
        await deck.deal(playerHands, 11, {
          how: CONST.CARD_DRAW_MODES.TOP,
          chatNotification: false
        });
        for (const hand of playerHands) {
          await CardEngine.sortStack(hand, "suit");
        }
      }

      // Vira a primeira carta do Lixo aberta
      if (lixoPile) {
        await lixoPile.draw(deck, 1, {
          how: CONST.CARD_DRAW_MODES.TOP,
          updateData: { face: 0 },
          chatNotification: false
        });
      }

      await ChatMessage.create({
        content: `<div class="fvtt-card-table-chat"><strong>Mesa de Buraco Pronta!</strong> 11 cartas distribuídas para ${playerHands.length} jogador(es), 2 Mortos separados e Lixo aberto.</div>`
      });
    },

    /**
     * Compra o Lixo inteiro para a mão do jogador e reordena a mão por naipe
     * @param {Cards} hand
     * @param {Cards} lixoPile
     */
    async buyTrash(hand, lixoPile) {
      const cardIds = lixoPile.cards.map((c) => c.id);
      if (cardIds.length === 0) {
        ui.notifications.warn(game.i18n.localize("FVTT_CARD_TABLE.Notifications.EmptyTrash"));
        return [];
      }
      const passed = await lixoPile.pass(hand, cardIds, { chatNotification: true });
      await CardEngine.sortStack(hand, "suit");
      return passed;
    },

    /**
     * Baixa um jogo (sequência/trinca) ou adiciona cartas a uma canastra existente na zona da dupla
     * Calcula automaticamente se virou Canastra Limpa (7+ cartas sem curinga) ou Suja (com curinga)
     * @param {Cards} hand
     * @param {Cards} teamMeldPile
     * @param {string[]} cardIds
     * @param {string|null} meldGroupId
     */
    async playMeld(hand, teamMeldPile, cardIds = [], meldGroupId = null) {
      if (cardIds.length === 0) return null;
      const groupId = meldGroupId ?? foundry.utils.randomID(8);

      const movedCards = await hand.pass(teamMeldPile, cardIds, {
        updateData: {
          face: 0,
          [`flags.${MODULE_ID}.state.meldGroupId`]: groupId
        },
        chatNotification: false
      });

      // Reordena as cartas do mesmo grupo por valor
      const groupCards = teamMeldPile.cards.filter(
        (c) => CardStateManager.getCardState(c).meldGroupId === groupId
      );
      groupCards.sort((a, b) => (a.value ?? 0) - (b.value ?? 0));

      const hasWildcard = groupCards.some(
        (c) =>
          c.suit === "joker" ||
          c.value === 2 ||
          CardStateManager.getCardState(c).isWildcard
      );
      const isCanastra = groupCards.length >= 7;

      const updates = groupCards.map((c, idx) => ({
        _id: c.id,
        sort: (idx + 1) * 100,
        // Atravessa a última carta a 90° se fechar canastra (tradição do Buraco)
        [`flags.${MODULE_ID}.state.tapped`]: isCanastra && idx === groupCards.length - 1
      }));
      if (updates.length) {
        await teamMeldPile.updateEmbeddedDocuments("Card", updates);
      }

      if (isCanastra) {
        const typeLabel = hasWildcard ? "Canastra Suja (+100 pts)" : "Canastra Limpa (+200 pts)";
        await ChatMessage.create({
          content: `<div class="fvtt-card-table-chat"><strong>${game.user.name}</strong> fechou uma <strong>${typeLabel}</strong>!</div>`
        });
      }

      return { groupId, count: groupCards.length, isCanastra, isClean: isCanastra && !hasWildcard };
    },

    /**
     * Contabiliza os pontos totais de uma zona de jogos baixados da dupla
     * @param {Cards} teamMeldPile
     */
    calculateTeamScore(teamMeldPile) {
      let cardPoints = 0;
      const groups = new Map();

      for (const card of teamMeldPile.cards) {
        cardPoints += CardStateManager.getBuracoPointValue(card);
        const gId = CardStateManager.getCardState(card).meldGroupId ?? "ungrouped";
        if (!groups.has(gId)) groups.set(gId, []);
        groups.get(gId).push(card);
      }

      let canastraBonus = 0;
      for (const [gId, cards] of groups.entries()) {
        if (gId === "ungrouped" || cards.length < 7) continue;
        const hasWildcard = cards.some(
          (c) => c.suit === "joker" || c.value === 2 || CardStateManager.getCardState(c).isWildcard
        );
        canastraBonus += hasWildcard ? 100 : 200;
      }

      return {
        cardPoints,
        canastraBonus,
        total: cardPoints + canastraBonus
      };
    }
  };
}
