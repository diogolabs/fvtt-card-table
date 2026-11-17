import { MODULE_ID, CardStateManager } from "../models/card-state.mjs";
import { ScryDialogApp } from "../apps/tabletop-app.mjs";

const SUIT_ORDER = { spades: 1, hearts: 2, clubs: 3, diamonds: 4, joker: 5 };

/**
 * Motor principal de automação de cartas (Cockatrice, MTG, Poker e Buraco)
 */
export class CardEngine {
  /* ======================================================================== */
  /*  GERADOR AUTOMÁTICO DE BARALHOS, MÃOS PRIVADAS E ZONAS DA MESA           */
  /* ======================================================================== */

  /**
   * Busca ou cria uma Mão Privada exclusiva para um jogador específico,
   * garantindo permissão privada e banca inicial de 1.000 fichas.
   * @param {User} user
   */
  static async ensureUserPrivateHand(user = game.user) {
    let hand = game.cards.find(
      (c) =>
        c.type === "hand" &&
        CardStateManager.getStackState(c).ownerUserId === user.id
    );

    if (!hand) {
      hand = game.cards.find(
        (c) =>
          c.type === "hand" &&
          (c.name === `Mão de ${user.name}` ||
            (!user.isGM && c.ownership?.[user.id] === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && c.ownership?.default === CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE))
      );
    }

    const privateOwnership = {
      default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
      [user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
    };

    if (!hand) {
      hand = await Cards.create({
        name: `Mão de ${user.name}`,
        type: "hand",
        img: "icons/sundries/gaming/playing-cards-grey.webp",
        ownership: privateOwnership,
        flags: {
          [MODULE_ID]: {
            stackState: {
              zoneType: "hand",
              ownerUserId: user.id,
              chips: 1000,
              roundBet: 0,
              folded: false
            }
          }
        }
      });
    } else if (game.user.isGM) {
      const currentState = CardStateManager.getStackState(hand);
      await hand.update({
        ownership: privateOwnership,
        [`flags.${MODULE_ID}.stackState.ownerUserId`]: user.id,
        [`flags.${MODULE_ID}.stackState.chips`]: currentState.chips ?? 1000
      });
    }

    return hand;
  }

  /**
   * Garante que todas as zonas da mesa existam e tenham permissão compartilhada correta.
   * @param {"mtg"|"poker"|"buraco"} mode
   */
  static async bootstrapWorldZones(mode = "poker") {
    const defaultImg = "icons/sundries/gaming/playing-cards-grey.webp";
    const sharedOwnership = {
      default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
    };

    const suits = [
      { key: "spades", symbol: "♠", label: "Espadas" },
      { key: "hearts", symbol: "♥", label: "Copas" },
      { key: "clubs", symbol: "♣", label: "Paus" },
      { key: "diamonds", symbol: "♦", label: "Ouros" }
    ];
    const ranks = [
      { value: 2, name: "2" },
      { value: 3, name: "3" },
      { value: 4, name: "4" },
      { value: 5, name: "5" },
      { value: 6, name: "6" },
      { value: 7, name: "7" },
      { value: 8, name: "8" },
      { value: 9, name: "9" },
      { value: 10, name: "10" },
      { value: 11, name: "Valete (J)" },
      { value: 12, name: "Dama (Q)" },
      { value: 13, name: "Rei (K)" },
      { value: 14, name: "Ás (A)" }
    ];

    const buildStandard52 = (copyIndex = 1) => {
      const list = [];
      for (const s of suits) {
        for (const r of ranks) {
          const isTwo = r.value === 2;
          const ptVal = r.value === 14 ? 15 : r.value >= 8 || isTwo ? 10 : 5;
          list.push({
            name: `${r.name} de ${s.label} (${s.symbol})`,
            type: "base",
            suit: s.key,
            value: r.value,
            face: 0,
            faces: [{ name: `${r.name} de ${s.label} (${s.symbol})`, img: defaultImg, text: `Baralho #${copyIndex}` }],
            back: { name: "Verso", img: defaultImg },
            flags: {
              [MODULE_ID]: {
                state: {
                  isWildcard: mode === "buraco" && isTwo,
                  metadata: { pointValue: ptVal }
                }
              }
            }
          });
        }
      }
      return list;
    };

    let deck =
      game.cards.find(
        (c) => c.type === "deck" && CardStateManager.getStackState(c).gameMode === mode
      ) ??
      (mode === "standard" ? game.cards.find((c) => c.type === "deck") : null);

    if (!deck) {
      let deckName = "Baralho Principal";
      let cardsData = [];

      if (mode === "standard") {
        deckName = "Baralho Padrão (52 Cartas)";
        cardsData = buildStandard52(1);
      } else if (mode === "poker") {
        deckName = "Baralho de Poker (52 Cartas)";
        cardsData = buildStandard52(1);
      } else if (mode === "buraco") {
        deckName = "Baralho Duplo de Buraco (108 Cartas)";
        cardsData = [...buildStandard52(1), ...buildStandard52(2)];
        for (let j = 1; j <= 4; j++) {
          cardsData.push({
            name: `Curingão #${j} (Joker)`,
            type: "base",
            suit: "joker",
            value: 0,
            face: 0,
            faces: [{ name: `Curingão #${j}`, img: defaultImg, text: "Curinga (20 pts)" }],
            back: { name: "Verso", img: defaultImg },
            flags: {
              [MODULE_ID]: {
                state: { isWildcard: true, metadata: { pointValue: 20 } }
              }
            }
          });
        }
      } else {
        deckName = "Grimório MTG / Cockatrice";
        const mtgSamples = [
          { name: "Island (Ilha)", suit: "lands", cmc: 0, img: "icons/magic/water/wave-water-blue.webp", types: ["Basic Land", "Island"], count: 8 },
          { name: "Mountain (Montanha)", suit: "lands", cmc: 0, img: "icons/magic/fire/flame-burning-earth-orange.webp", types: ["Basic Land", "Mountain"], count: 8 },
          { name: "Lightning Bolt", suit: "spells", cmc: 1, img: "icons/magic/lightning/bolt-strike-blue.webp", types: ["Instant"], count: 4 },
          { name: "Counterspell", suit: "spells", cmc: 2, img: "icons/magic/defensive/shield-barrier-glowing-blue.webp", types: ["Instant"], count: 4 },
          { name: "Delver of Secrets // Insectile Aberration", suit: "creatures", cmc: 1, img: "icons/magic/control/silhouette-hold-change-blue.webp", types: ["Creature", "Human", "Wizard"], count: 4 },
          { name: "Shivan Dragon (5/5 Flying)", suit: "creatures", cmc: 6, img: "icons/creatures/reptiles/dragon-horned-flame-red.webp", types: ["Creature", "Dragon"], count: 2 }
        ];
        for (const sample of mtgSamples) {
          for (let i = 0; i < sample.count; i++) {
            cardsData.push({
              name: sample.name,
              type: "base",
              suit: sample.suit,
              value: sample.cmc,
              face: 0,
              faces: [{ name: sample.name, img: sample.img, text: sample.types.join(" — ") }],
              back: { name: "Deckmaster", img: defaultImg },
              flags: {
                [MODULE_ID]: {
                  state: {
                    tapped: false,
                    counters: { plusOne: 0, loyalty: 0, charge: 0, custom: [] },
                    metadata: { cmc: sample.cmc, cardTypes: sample.types }
                  }
                }
              }
            });
          }
        }
      }

      deck = await Cards.create({
        name: deckName,
        type: "deck",
        img: defaultImg,
        ownership: sharedOwnership,
        cards: cardsData,
        flags: { [MODULE_ID]: { stackState: { gameMode: mode, zoneType: "library" } } }
      });
      await deck.shuffle({ chatNotification: false });
    } else if (game.user.isGM) {
      await deck.update({ ownership: sharedOwnership });
    }

    const targetUsers = game.user.isGM ? game.users.contents : [game.user];
    for (const u of targetUsers) {
      await this.ensureUserPrivateHand(u);
    }

    let battlefieldPile = game.cards.find(
      (c) => c.type === "pile" && ["battlefield", "community", "meld"].includes(CardStateManager.getStackState(c).zoneType)
    );
    if (!battlefieldPile) {
      battlefieldPile = await Cards.create({
        name:
          mode === "standard"
            ? "Pilha da Mesa"
            : mode === "poker"
              ? "Mesa Comunitária (Crupiê)"
              : mode === "buraco"
                ? "Jogos Baixados / Canastras"
                : "Campo de Batalha (TableZone)",
        type: "pile",
        img: defaultImg,
        ownership: sharedOwnership,
        flags: {
          [MODULE_ID]: {
            stackState: {
              gameMode: mode,
              zoneType: mode === "poker" ? "community" : mode === "buraco" ? "meld" : "battlefield",
              pot: 0,
              currentBet: 0
            }
          }
        }
      });
    } else if (game.user.isGM) {
      await battlefieldPile.update({ ownership: sharedOwnership });
    }

    let discardPile = game.cards.find(
      (c) =>
        c.type === "pile" &&
        c.id !== battlefieldPile.id &&
        ["graveyard", "lixo", "burn", "discard"].includes(CardStateManager.getStackState(c).zoneType)
    );
    if (!discardPile) {
      discardPile = await Cards.create({
        name:
          mode === "standard"
            ? "Pilha de Descarte"
            : mode === "poker"
              ? "Queima / Descarte (Muck)"
              : mode === "buraco"
                ? "Lixo"
                : "Cemitério (Graveyard)",
        type: "pile",
        img: defaultImg,
        ownership: sharedOwnership,
        flags: {
          [MODULE_ID]: {
            stackState: {
              gameMode: mode,
              zoneType:
                mode === "standard"
                  ? "discard"
                  : mode === "poker"
                    ? "burn"
                    : mode === "buraco"
                      ? "lixo"
                      : "graveyard"
            }
          }
        }
      });
    } else if (game.user.isGM) {
      await discardPile.update({ ownership: sharedOwnership });
    }

    if (mode === "buraco" && !game.cards.some((c) => c.type === "pile" && CardStateManager.getStackState(c).zoneType === "morto")) {
      await Cards.create({
        name: "Morto (11 Cartas)",
        type: "pile",
        img: defaultImg,
        ownership: sharedOwnership,
        flags: { [MODULE_ID]: { stackState: { gameMode: "buraco", zoneType: "morto" } } }
      });
    }

    ui.notifications.info(`Mesa de ${mode.toUpperCase()} pronta! Mãos privadas e bancas de fichas configuradas.`);
    return { deck, battlefieldPile, discardPile };
  }

  /* ======================================================================== */
  /*  UTILITÁRIOS GERAIS & ORDENAÇÃO (COCKATRICE UX)                          */
  /* ======================================================================== */

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

  static async syncWorldDecksWithCompendium({ notify = true } = {}) {
    const pack = game.packs.get(`${MODULE_ID}.decks`);
    if (!pack) return 0;

    const moduleVersion = game.modules.get(MODULE_ID)?.version ?? "1.0.3";
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
    async toggleTap(card) {
      const state = CardStateManager.getCardState(card);
      const nextTapped = !state.tapped;
      await CardStateManager.updateCardState(card, { tapped: nextTapped });

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

    async attachCard(attachmentCard, targetCard = null) {
      return CardStateManager.updateCardState(attachmentCard, {
        attachedTo: targetCard ? targetCard.id : null
      });
    },

    async scry(deck, count = 2) {
      const available = [...deck.availableCards].sort((a, b) => a.sort - b.sort);
      const topCards = available.slice(0, count);
      if (topCards.length === 0) {
        ui.notifications.warn(game.i18n.localize("FVTT_CARD_TABLE.Notifications.EmptyDeck"));
        return;
      }
      const dialog = new ScryDialogApp({ deck, cards: topCards });
      dialog.render({ force: true });
      return dialog;
    },

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

    async mulligan(hand, deck, drawCount = 7) {
      await hand.recall({ chatNotification: false });
      await deck.shuffle({ chatNotification: false });
      await hand.draw(deck, drawCount, { how: CONST.CARD_DRAW_MODES.TOP, chatNotification: true });
      ui.notifications.info(
        game.i18n.format("FVTT_CARD_TABLE.Notifications.MulliganDone", { count: drawCount })
      );
    },

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
  /*  MECÂNICAS DE POKER, FICHAS, POTE & CRUPIÊ (TEXAS HOLD'EM / OMAHA)       */
  /* ======================================================================== */

  static poker = {
    /**
     * Crupiê: Inicia uma nova mão de Texas Hold'em
     */
    async startRound(deck, playerHands = [], communityPile = null, holeCardCount = 2) {
      await deck.recall({ chatNotification: false });
      await deck.shuffle({ chatNotification: false });

      for (const hand of playerHands) {
        await CardStateManager.updateStackState(hand, {
          roundBet: 0,
          folded: false
        });
      }

      if (communityPile) {
        await CardStateManager.updateStackState(communityPile, {
          currentBet: 0
        });
      }

      if (playerHands.length > 0) {
        await deck.deal(playerHands, holeCardCount, {
          how: CONST.CARD_DRAW_MODES.TOP,
          chatNotification: false
        });
      }

      await ChatMessage.create({
        content: `<div class="fvtt-card-table-chat"><strong>🎩 Crupiê (Texas Hold'em):</strong> Nova mão iniciada! Baralho embaralhado e ${holeCardCount} cartas privadas distribuídas para ${playerHands.length} jogador(es). Apostas da rodada zeradas!</div>`
      });
    },

    /**
     * Crupiê: Queima 1 carta e abre Flop (3), Turn (1) ou River (1), zerando a aposta da rodada anterior
     */
    async dealCommunity(deck, burnPile, communityPile, stage = "flop", playerHands = []) {
      const existingCommunity = communityPile.cards.filter(
        (c) => CardStateManager.getCardState(c).boardRole !== "showdown"
      );

      if (stage === "auto") {
        if (existingCommunity.length === 0) stage = "flop";
        else if (existingCommunity.length < 4) stage = "turn";
        else if (existingCommunity.length === 4) stage = "river";
        else {
          ui.notifications.info("As 5 cartas comunitárias (Flop, Turn e River) já estão abertas na mesa!");
          return [];
        }
      }

      if (burnPile && burnPile.id !== communityPile.id && deck.availableCards.length > 0) {
        await burnPile.draw(deck, 1, {
          how: CONST.CARD_DRAW_MODES.TOP,
          updateData: { face: null },
          chatNotification: false
        });
      }

      const count = stage === "flop" ? 3 : 1;
      const startSlot = existingCommunity.length + 1;
      const drawn = await communityPile.draw(deck, count, {
        how: CONST.CARD_DRAW_MODES.TOP,
        updateData: {
          face: 0,
          [`flags.${MODULE_ID}.state.boardRole`]: "community"
        },
        chatNotification: false
      });

      const slotUpdates = drawn.map((c, idx) => ({
        _id: c.id,
        [`flags.${MODULE_ID}.state.boardRole`]: "community",
        [`flags.${MODULE_ID}.state.communitySlot`]: startSlot + idx
      }));
      if (slotUpdates.length) {
        await communityPile.updateEmbeddedDocuments("Card", slotUpdates);
      }

      // Nova street (Flop/Turn/River) zera a aposta da rodada atual mantendo o Pote acumulado
      await CardStateManager.updateStackState(communityPile, { currentBet: 0 });
      for (const h of playerHands) {
        await CardStateManager.updateStackState(h, { roundBet: 0 });
      }

      await ChatMessage.create({
        content: `<div class="fvtt-card-table-chat"><strong>🎩 Crupiê (${stage.toUpperCase()}):</strong> Queimou 1 carta e abriu ${drawn.map((c) => `<strong>[${c.name}]</strong>`).join(" ")} na mesa comunitária!</div>`
      });
      return drawn;
    },

    /**
     * Jogador aposta fichas da própria banca (Stack) para o Pote da mesa
     */
    async bet(communityPile, playerHand, amount, { isCall = false, isAllIn = false, playerName = game.user.name } = {}) {
      const requested = Math.max(0, Math.floor(Number(amount) || 0));
      if (requested <= 0) return;

      const tableState = CardStateManager.getStackState(communityPile);
      let actualBet = requested;
      let remainingChips = null;
      let nextPlayerRoundBet = requested;

      if (playerHand) {
        const handState = CardStateManager.getStackState(playerHand);
        const currentChips = handState.chips ?? 1000;
        if (currentChips <= 0) {
          ui.notifications.warn("Você não possui fichas suficientes na sua banca!");
          return;
        }
        actualBet = Math.min(requested, currentChips);
        remainingChips = currentChips - actualBet;
        nextPlayerRoundBet = (handState.roundBet ?? 0) + actualBet;

        await CardStateManager.updateStackState(playerHand, {
          chips: remainingChips,
          roundBet: nextPlayerRoundBet
        });
      }

      const nextPot = (tableState.pot ?? 0) + actualBet;
      const nextCurrentBet = Math.max(tableState.currentBet ?? 0, nextPlayerRoundBet);

      await CardStateManager.updateStackState(communityPile, {
        pot: nextPot,
        currentBet: nextCurrentBet
      });

      const actionTag =
        isAllIn || remainingChips === 0
          ? "🔥 deu ALL-IN de"
          : isCall
            ? "pagou (Call)"
            : "apostou";

      await ChatMessage.create({
        content: `<div class="fvtt-card-table-chat">🪙 <strong>${playerName}</strong> ${actionTag} <strong>${actualBet} fichas</strong> (Na rodada: ${nextPlayerRoundBet} | Restante: ${remainingChips ?? "—"}).<br/>💰 <strong>Pote Total: ${nextPot} fichas</strong> (Aposta a pagar: ${nextCurrentBet}).</div>`
      });
      return nextPot;
    },

    /**
     * Jogador dá Check (se já igualou a aposta da rodada) ou Call (paga a diferença exata)
     */
    async checkOrCall(communityPile, playerHand, playerName = game.user.name) {
      if (!communityPile || !playerHand) return;
      const tableState = CardStateManager.getStackState(communityPile);
      const handState = CardStateManager.getStackState(playerHand);
      const toCall = Math.max(0, (tableState.currentBet ?? 0) - (handState.roundBet ?? 0));

      if (toCall === 0) {
        await ChatMessage.create({
          content: `<div class="fvtt-card-table-chat">✊ <strong>${playerName}</strong> deu <strong>Check (Mesa)</strong>.</div>`
        });
        return 0;
      }
      return this.bet(communityPile, playerHand, toCall, { isCall: true, playerName });
    },

    /**
     * Jogador aposta todas as fichas restantes (All-In)
     */
    async allIn(communityPile, playerHand, playerName = game.user.name) {
      if (!communityPile || !playerHand) return;
      const handState = CardStateManager.getStackState(playerHand);
      const allChips = handState.chips ?? 0;
      if (allChips <= 0) {
        ui.notifications.warn("Você não tem fichas para dar All-In!");
        return;
      }
      return this.bet(communityPile, playerHand, allChips, { isAllIn: true, playerName });
    },

    /**
     * Jogador desiste da mão (Fold): envia todas as cartas da mão viradas para baixo para o Muck/Descarte
     */
    async fold(playerHand, discardPile, playerName = game.user.name) {
      if (!playerHand) return;
      const cardIds = playerHand.cards.map((c) => c.id);
      if (cardIds.length > 0 && discardPile) {
        await playerHand.pass(discardPile, cardIds, {
          updateData: { face: null },
          chatNotification: false
        });
      }
      await CardStateManager.updateStackState(playerHand, { folded: true });
      await ChatMessage.create({
        content: `<div class="fvtt-card-table-chat">🏳️ <strong>${playerName}</strong> desistiu da mão (<strong>Fold</strong>).</div>`
      });
    },

    /**
     * Zera o Pote e as apostas da rodada atual
     */
    async resetPot(communityPile, playerHands = []) {
      if (!communityPile) return;
      await CardStateManager.updateStackState(communityPile, {
        pot: 0,
        currentBet: 0
      });
      for (const h of playerHands) {
        await CardStateManager.updateStackState(h, { roundBet: 0 });
      }
      await ChatMessage.create({
        content: `<div class="fvtt-card-table-chat">🧹 <strong>Pote da mesa zerado pelo Crupiê.</strong></div>`
      });
    },

    /**
     * Transfere todas as fichas do Pote para a banca do jogador vencedor e zera o Pote
     */
    async awardPot(communityPile, winnerHand, allPlayerHands = []) {
      if (!communityPile || !winnerHand) return;
      const tableState = CardStateManager.getStackState(communityPile);
      const potAmount = tableState.pot ?? 0;
      if (potAmount <= 0) {
        ui.notifications.warn("O Pote está vazio (0 fichas).");
        return;
      }

      const winnerState = CardStateManager.getStackState(winnerHand);
      const newChips = (winnerState.chips ?? 0) + potAmount;

      await CardStateManager.updateStackState(winnerHand, {
        chips: newChips,
        roundBet: 0
      });

      await CardStateManager.updateStackState(communityPile, {
        pot: 0,
        currentBet: 0
      });

      for (const h of allPlayerHands) {
        if (h.id !== winnerHand.id) {
          await CardStateManager.updateStackState(h, { roundBet: 0 });
        }
      }

      await ChatMessage.create({
        content: `<div class="fvtt-card-table-chat">🏆 <strong>${winnerHand.name}</strong> venceu o Pote de <strong>${potAmount} fichas</strong>! (Nova banca: <strong>${newChips} fichas</strong>).</div>`
      });
      return newChips;
    },

    /**
     * Define ou reseta a banca de fichas (Buy-in / Rebuy) para todas as mãos de jogadores
     */
    async buyInAll(playerHands = [], amount = 1000) {
      const chips = Math.max(0, Math.floor(Number(amount) || 1000));
      for (const h of playerHands) {
        await CardStateManager.updateStackState(h, {
          chips,
          roundBet: 0,
          folded: false
        });
      }
      await ChatMessage.create({
        content: `<div class="fvtt-card-table-chat">🪙 <strong>Buy-in realizado:</strong> Todos os jogadores agora possuem <strong>${chips} fichas</strong> na banca!</div>`
      });
    },

    /* ====================================================================== */
    /*  AVALIADOR OFICIAL DE MÃOS DE TEXAS HOLD'EM (5 A 7 CARTAS)             */
    /* ====================================================================== */

    rankLabel(val) {
      const map = {
        14: "Ás",
        13: "Rei",
        12: "Dama",
        11: "Valete",
        10: "10",
        9: "9",
        8: "8",
        7: "7",
        6: "6",
        5: "5",
        4: "4",
        3: "3",
        2: "2"
      };
      return map[val] ?? String(val);
    },

    evaluateFiveCards(five) {
      const values = five.map((c) => Number(c.value)).sort((a, b) => b - a);
      const suits = five.map((c) => c.suit);
      const isFlush = suits.every((s) => s === suits[0]);

      const uniqueVals = [...new Set(values)];
      let isStraight = false;
      let straightHigh = values[0];

      if (uniqueVals.length === 5) {
        if (uniqueVals[0] - uniqueVals[4] === 4) {
          isStraight = true;
          straightHigh = uniqueVals[0];
        } else if (
          uniqueVals[0] === 14 &&
          uniqueVals[1] === 5 &&
          uniqueVals[2] === 4 &&
          uniqueVals[3] === 3 &&
          uniqueVals[4] === 2
        ) {
          // Sequência Baixa A-2-3-4-5 (Wheel)
          isStraight = true;
          straightHigh = 5;
        }
      }

      const counts = new Map();
      for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
      const groups = [...counts.entries()].sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return b[0] - a[0];
      });

      const tiebreakers = groups.map((g) => g[0]);

      if (isFlush && isStraight) {
        if (straightHigh === 14) {
          return { category: 9, name: "Royal Flush", tiebreakers: [14] };
        }
        return {
          category: 8,
          name: `Straight Flush (Alta de ${this.rankLabel(straightHigh)})`,
          tiebreakers: [straightHigh]
        };
      }

      if (groups[0][1] === 4) {
        return {
          category: 7,
          name: `Quadra de ${this.rankLabel(groups[0][0])}`,
          tiebreakers
        };
      }

      if (groups[0][1] === 3 && groups[1][1] === 2) {
        return {
          category: 6,
          name: `Full House (${this.rankLabel(groups[0][0])} e ${this.rankLabel(groups[1][0])})`,
          tiebreakers
        };
      }

      if (isFlush) {
        return {
          category: 5,
          name: `Flush (Carta Alta ${this.rankLabel(values[0])})`,
          tiebreakers: values
        };
      }

      if (isStraight) {
        return {
          category: 4,
          name: `Sequência (Alta de ${this.rankLabel(straightHigh)})`,
          tiebreakers: [straightHigh]
        };
      }

      if (groups[0][1] === 3) {
        return {
          category: 3,
          name: `Trinca de ${this.rankLabel(groups[0][0])}`,
          tiebreakers
        };
      }

      if (groups[0][1] === 2 && groups[1][1] === 2) {
        return {
          category: 2,
          name: `Dois Pares (${this.rankLabel(groups[0][0])} e ${this.rankLabel(groups[1][0])})`,
          tiebreakers
        };
      }

      if (groups[0][1] === 2) {
        return {
          category: 1,
          name: `Par de ${this.rankLabel(groups[0][0])}`,
          tiebreakers
        };
      }

      return {
        category: 0,
        name: `Carta Alta (${this.rankLabel(values[0])})`,
        tiebreakers: values
      };
    },

    compareEvaluations(evalA, evalB) {
      if (evalA.category !== evalB.category) {
        return evalA.category > evalB.category ? 1 : -1;
      }
      const len = Math.max(evalA.tiebreakers.length, evalB.tiebreakers.length);
      for (let i = 0; i < len; i++) {
        const a = evalA.tiebreakers[i] ?? 0;
        const b = evalB.tiebreakers[i] ?? 0;
        if (a !== b) return a > b ? 1 : -1;
      }
      return 0;
    },

    evaluateBestHand(cards = []) {
      if (!cards || cards.length < 5) {
        if (!cards || cards.length === 0) return { category: -1, name: "Sem cartas", tiebreakers: [] };
        const vals = cards.map((c) => Number(c.value)).sort((a, b) => b - a);
        if (vals.length >= 2 && vals[0] === vals[1]) {
          return { category: 1, name: `Par de ${this.rankLabel(vals[0])}`, tiebreakers: vals };
        }
        return { category: 0, name: `Carta Alta (${this.rankLabel(vals[0])})`, tiebreakers: vals };
      }

      let best = null;
      const n = cards.length;
      for (let i = 0; i < n - 4; i++) {
        for (let j = i + 1; j < n - 3; j++) {
          for (let k = j + 1; k < n - 2; k++) {
            for (let l = k + 1; l < n - 1; l++) {
              for (let m = l + 1; m < n; m++) {
                const combo = [cards[i], cards[j], cards[k], cards[l], cards[m]];
                const current = this.evaluateFiveCards(combo);
                if (!best || this.compareEvaluations(current, best) > 0) {
                  best = current;
                }
              }
            }
          }
        }
      }
      return best;
    },

    /* ====================================================================== */
    /*  MODO SOLO VS. CRUPIÊ (POTE ISOLADO — NÃO AFETA MESA MULTIPLAYER)      */
    /* ====================================================================== */

    buildSoloDeck() {
      const defaultImg = "icons/sundries/gaming/playing-cards-grey.webp";
      const suits = [
        { key: "spades", symbol: "♠", label: "Espadas" },
        { key: "hearts", symbol: "♥", label: "Copas" },
        { key: "clubs", symbol: "♣", label: "Paus" },
        { key: "diamonds", symbol: "♦", label: "Ouros" }
      ];
      const ranks = [
        { value: 2, short: "2", name: "2" },
        { value: 3, short: "3", name: "3" },
        { value: 4, short: "4", name: "4" },
        { value: 5, short: "5", name: "5" },
        { value: 6, short: "6", name: "6" },
        { value: 7, short: "7", name: "7" },
        { value: 8, short: "8", name: "8" },
        { value: 9, short: "9", name: "9" },
        { value: 10, short: "10", name: "10" },
        { value: 11, short: "J", name: "Valete (J)" },
        { value: 12, short: "Q", name: "Dama (Q)" },
        { value: 13, short: "K", name: "Rei (K)" },
        { value: 14, short: "A", name: "Ás (A)" }
      ];

      const deck = [];
      for (const s of suits) {
        for (const r of ranks) {
          deck.push({
            id: `${r.short}${s.key[0].toUpperCase()}`,
            name: `${r.name} de ${s.label} (${r.short}${s.symbol})`,
            shortLabel: `${r.short}${s.symbol}`,
            suit: s.key,
            symbol: s.symbol,
            isRed: s.key === "hearts" || s.key === "diamonds",
            value: r.value,
            img: defaultImg
          });
        }
      }

      // Embaralhamento Fisher-Yates
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      return deck;
    },

    async startSoloHand(playerHand, ante = 10) {
      if (!playerHand) return;
      const isAllowed = game.settings.get(MODULE_ID, "allowSoloPoker") || game.user.isGM;
      if (!isAllowed) {
        ui.notifications.warn("O Modo Solo contra o Crupiê está desativado pelo GM.");
        return;
      }

      const handState = CardStateManager.getStackState(playerHand);
      const currentChips = handState.chips ?? 1000;
      const betAnte = Math.min(Math.max(1, Number(ante) || 10), currentChips);

      if (currentChips <= 0) {
        ui.notifications.warn("Você não possui fichas suficientes para iniciar uma mão contra o Crupiê!");
        return;
      }

      const deck = this.buildSoloDeck();
      const playerCards = [deck.shift(), deck.shift()];
      const dealerCards = [deck.shift(), deck.shift()];

      const nextChips = currentChips - betAnte;
      const soloPot = betAnte * 2; // O Crupiê (Banca) casa o mesmo valor do Ante no Pote Solo!

      await CardStateManager.updateStackState(playerHand, {
        chips: nextChips,
        soloGame: {
          active: true,
          stage: "preflop",
          pot: soloPot,
          playerInvested: betAnte,
          burnedCount: 0,
          deck,
          playerCards,
          dealerCards,
          communityCards: [],
          lastResult: null
        }
      });

      return soloPot;
    },

    async advanceSoloHand(playerHand, betAmount = 0, { runToShowdown = false } = {}) {
      if (!playerHand) return;
      const handState = CardStateManager.getStackState(playerHand);
      const solo = foundry.utils.deepClone(handState.soloGame ?? {});

      if (!solo.active || solo.stage === "idle" || solo.stage === "showdown") {
        return;
      }

      let currentChips = handState.chips ?? 0;
      const requestedBet = Math.max(0, Math.floor(Number(betAmount) || 0));
      const actualBet = Math.min(requestedBet, currentChips);

      if (actualBet > 0) {
        currentChips -= actualBet;
        solo.playerInvested = (solo.playerInvested ?? 0) + actualBet;
        // O Crupiê cobre a aposta do jogador no Pote Solo (1:1)
        solo.pot = (solo.pot ?? 0) + actualBet * 2;
      }

      const dealStreet = (currentStage) => {
        if (currentStage === "preflop") {
          solo.deck.shift(); // Queima 1
          solo.burnedCount = (solo.burnedCount ?? 0) + 1;
          solo.communityCards.push(solo.deck.shift(), solo.deck.shift(), solo.deck.shift());
          return "flop";
        }
        if (currentStage === "flop") {
          solo.deck.shift(); // Queima 1
          solo.burnedCount = (solo.burnedCount ?? 0) + 1;
          solo.communityCards.push(solo.deck.shift());
          return "turn";
        }
        if (currentStage === "turn") {
          solo.deck.shift(); // Queima 1
          solo.burnedCount = (solo.burnedCount ?? 0) + 1;
          solo.communityCards.push(solo.deck.shift());
          return "river";
        }
        return "showdown";
      };

      if (runToShowdown) {
        while (solo.stage !== "river" && solo.stage !== "showdown") {
          solo.stage = dealStreet(solo.stage);
        }
        solo.stage = "showdown";
      } else {
        solo.stage = dealStreet(solo.stage);
      }

      // Se chegou no Showdown, combina as cartas do Jogador com a Mesa vs. Crupiê com a Mesa
      if (solo.stage === "showdown") {
        const playerEval = this.evaluateBestHand([...solo.playerCards, ...solo.communityCards]);
        const dealerEval = this.evaluateBestHand([...solo.dealerCards, ...solo.communityCards]);
        const cmp = this.compareEvaluations(playerEval, dealerEval);

        let outcome = "lose";
        let payout = 0;
        let title = "";
        let summary = "";

        if (cmp > 0) {
          outcome = "win";
          payout = solo.pot;
          currentChips += payout;
          title = "🎉 VOCÊ VENCEU O CRUPIÊ!";
          summary = `Seu jogo (${playerEval.name}) superou o jogo do Crupiê (${dealerEval.name})! Você ganhou o Pote Solo de ${payout} fichas.`;
        } else if (cmp < 0) {
          outcome = "lose";
          payout = 0;
          title = "🏦 O CRUPIÊ VENCEU!";
          summary = `O Crupiê formou ${dealerEval.name} e superou seu jogo (${playerEval.name}). A Banca levou o Pote Solo de ${solo.pot} fichas.`;
        } else {
          outcome = "tie";
          payout = Math.floor(solo.pot / 2);
          currentChips += payout;
          title = "🤝 EMPATE (SPLIT POT)!";
          summary = `Ambos empataram com ${playerEval.name}! Suas ${payout} fichas voltaram para sua banca.`;
        }

        solo.lastResult = {
          outcome,
          title,
          summary,
          playerHandName: playerEval.name,
          dealerHandName: dealerEval.name,
          potTotal: solo.pot,
          payout
        };
        solo.pot = 0;

        await ChatMessage.create({
          content: `<div class="fvtt-card-table-chat"><strong>🤖 Solo vs. Crupiê (${game.user.name}):</strong> ${title}<br/>• <strong>${game.user.name}:</strong> ${solo.playerCards.map((c) => c.shortLabel).join(" ")} → <em>${playerEval.name}</em><br/>• <strong>Crupiê:</strong> ${solo.dealerCards.map((c) => c.shortLabel).join(" ")} → <em>${dealerEval.name}</em><br/>• <strong>Mesa:</strong> ${solo.communityCards.map((c) => c.shortLabel).join(" ")}</div>`
        });
      }

      await CardStateManager.updateStackState(playerHand, {
        chips: currentChips,
        soloGame: solo
      });

      return solo;
    },

    async foldSoloHand(playerHand) {
      if (!playerHand) return;
      const handState = CardStateManager.getStackState(playerHand);
      const solo = foundry.utils.deepClone(handState.soloGame ?? {});
      if (!solo.active || solo.stage === "idle" || solo.stage === "showdown") return;

      const lostPot = solo.pot ?? 0;
      solo.stage = "showdown";
      solo.pot = 0;
      solo.lastResult = {
        outcome: "fold",
        title: "🏳️ VOCÊ DESISTIU (FOLD)",
        summary: `Você desistiu da mão e o Crupiê recolheu o Pote Solo de ${lostPot} fichas.`,
        playerHandName: "Desistiu (Fold)",
        dealerHandName: "Vencedor por desistência",
        potTotal: lostPot,
        payout: 0
      };

      await CardStateManager.updateStackState(playerHand, {
        soloGame: solo
      });
    }
  };

  /* ======================================================================== */
  /*  MECÂNICAS DE BURACO / CANASTRA                                          */
  /* ======================================================================== */

  static buraco = {
    async setupTable({ deck, playerHands = [], morto1, morto2, lixoPile }) {
      await deck.recall({ chatNotification: false });
      await deck.shuffle({ chatNotification: false });

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

      if (playerHands.length > 0) {
        await deck.deal(playerHands, 11, {
          how: CONST.CARD_DRAW_MODES.TOP,
          chatNotification: false
        });
        for (const hand of playerHands) {
          await CardEngine.sortStack(hand, "suit");
        }
      }

      if (lixoPile) {
        await lixoPile.draw(deck, 1, {
          how: CONST.CARD_DRAW_MODES.TOP,
          updateData: { face: 0 },
          chatNotification: false
        });
      }

      await ChatMessage.create({
        content: `<div class="fvtt-card-table-chat"><strong>Mesa de Buraco Pronta!</strong> 11 cartas distribuídas para ${playerHands.length} jogador(es), Morto separado e Lixo aberto.</div>`
      });
    },

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

    async playMeld(hand, teamMeldPile, cardIds = [], meldGroupId = null) {
      if (cardIds.length === 0) return null;
      const groupId = meldGroupId ?? foundry.utils.randomID(8);

      await hand.pass(teamMeldPile, cardIds, {
        updateData: {
          face: 0,
          [`flags.${MODULE_ID}.state.meldGroupId`]: groupId
        },
        chatNotification: false
      });

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

  /* ======================================================================== */
  /*  MODO PADRÃO (SISTEMA INTEGRADO NATIVO DO FOUNDRY VTT)                   */
  /* ======================================================================== */

  static standard = {
    /**
     * Distribui N cartas do Baralho para todas as mãos dos jogadores usando o método nativo deck.deal()
     */
    async dealToAllHands(deck, hands = [], count = 1, { faceDown = false } = {}) {
      if (!deck || hands.length === 0) return;
      const dealCount = Math.max(1, Number(count) || 1);
      await deck.deal(hands, dealCount, {
        how: CONST.CARD_DRAW_MODES.TOP,
        updateData: { face: faceDown ? null : 0 },
        chatNotification: true
      });
    },

    /**
     * Pega uma carta da Pilha da Mesa ou de qualquer Pilha de Descarte e traz para a Mão do jogador
     */
    async takeCardToHand(sourcePile, playerHand, cardId) {
      if (!sourcePile || !playerHand || !cardId) return;
      await sourcePile.pass(playerHand, [cardId], {
        updateData: { face: 0 },
        chatNotification: true
      });
    },

    /**
     * Passa cartas selecionadas da Mão do jogador para a Mão de outro jogador
     */
    async passToOtherHand(sourceHand, targetHand, cardIds = []) {
      if (!sourceHand || !targetHand || cardIds.length === 0) return;
      if (sourceHand.id === targetHand.id) return;
      await sourceHand.pass(targetHand, cardIds, {
        chatNotification: true
      });
    },

    /**
     * Devolve todas as cartas de uma Pilha de Descarte de volta para o Baralho e embaralha
     */
    async returnPileToDeck(pile, deck) {
      if (!pile || !deck) return;
      const cardIds = pile.cards.map((c) => c.id);
      if (cardIds.length === 0) {
        ui.notifications.warn(`A pilha "${pile.name}" já está vazia.`);
        return;
      }
      await pile.pass(deck, cardIds, {
        updateData: { face: 0 },
        chatNotification: false
      });
      await deck.shuffle({ chatNotification: true });
      ui.notifications.info(`${cardIds.length} carta(s) de "${pile.name}" devolvidas e embaralhadas em "${deck.name}".`);
    },

    /**
     * Cria uma nova Pilha de Descarte integrada ao Foundry
     */
    async createDiscardPile(name = null) {
      const existingDiscards = game.cards.filter(
        (c) => c.type === "pile" && ["discard", "graveyard", "lixo", "burn"].includes(CardStateManager.getStackState(c).zoneType)
      );
      const pileName = name || `Pilha de Descarte #${existingDiscards.length + 1}`;
      return Cards.create({
        name: pileName,
        type: "pile",
        img: "icons/sundries/gaming/playing-cards-grey.webp",
        ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
        flags: {
          [MODULE_ID]: {
            stackState: {
              gameMode: "standard",
              zoneType: "discard"
            }
          }
        }
      });
    }
  };
}
