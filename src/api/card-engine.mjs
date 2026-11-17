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
   * garantindo que outros jogadores tenham permissão NONE (não vejam as cartas dele)
   * e que até o GM tenha sua própria mão separada da dos jogadores.
   * @param {User} user
   */
  static async ensureUserPrivateHand(user = game.user) {
    let hand = game.cards.find(
      (c) =>
        c.type === "hand" &&
        CardStateManager.getStackState(c).ownerUserId === user.id
    );

    if (!hand) {
      // Verifica se já existe uma mão com o nome exato ou onde apenas esse jogador (não-GM) é OWNER
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
              ownerUserId: user.id
            }
          }
        }
      });
    } else if (game.user.isGM) {
      await hand.update({
        ownership: privateOwnership,
        [`flags.${MODULE_ID}.stackState.ownerUserId`]: user.id
      });
    }

    return hand;
  }

  /**
   * Garante que todas as zonas da mesa (Baralho, Mãos Privadas de cada jogador ativo,
   * Mesa Comunitária/Campo de Batalha e Descarte/Queima/Lixo) existam e tenham permissão correta.
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

    let deck = game.cards.find(
      (c) => c.type === "deck" && CardStateManager.getStackState(c).gameMode === mode
    );

    if (!deck) {
      let deckName = "Baralho Principal";
      let cardsData = [];

      if (mode === "poker") {
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
    }

    // Cria uma Mão Privada para cada usuário ativo (ou todos os usuários cadastrados se for GM)
    const targetUsers = game.user.isGM ? game.users.contents : [game.user];
    for (const u of targetUsers) {
      await this.ensureUserPrivateHand(u);
    }

    // Garante a Pilha de Mesa Comunitária / Campo de Batalha
    let battlefieldPile = game.cards.find(
      (c) => c.type === "pile" && ["battlefield", "community", "meld"].includes(CardStateManager.getStackState(c).zoneType)
    );
    if (!battlefieldPile) {
      battlefieldPile = await Cards.create({
        name: mode === "poker" ? "Mesa Comunitária (Crupiê)" : mode === "buraco" ? "Jogos Baixados / Canastras" : "Campo de Batalha (TableZone)",
        type: "pile",
        img: defaultImg,
        ownership: sharedOwnership,
        flags: {
          [MODULE_ID]: {
            stackState: {
              gameMode: mode,
              zoneType: mode === "poker" ? "community" : mode === "buraco" ? "meld" : "battlefield",
              pot: 0
            }
          }
        }
      });
    }

    // Garante a Pilha de Descarte / Queima / Lixo (separada da Mesa!)
    let discardPile = game.cards.find(
      (c) =>
        c.type === "pile" &&
        c.id !== battlefieldPile.id &&
        ["graveyard", "lixo", "burn"].includes(CardStateManager.getStackState(c).zoneType)
    );
    if (!discardPile) {
      discardPile = await Cards.create({
        name: mode === "poker" ? "Queima / Descarte (Muck)" : mode === "buraco" ? "Lixo" : "Cemitério (Graveyard)",
        type: "pile",
        img: defaultImg,
        ownership: sharedOwnership,
        flags: {
          [MODULE_ID]: {
            stackState: {
              gameMode: mode,
              zoneType: mode === "poker" ? "burn" : mode === "buraco" ? "lixo" : "graveyard"
            }
          }
        }
      });
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

    ui.notifications.info(`Mesa de ${mode.toUpperCase()} pronta! Mãos privadas configuradas por jogador.`);
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

    const moduleVersion = game.modules.get(MODULE_ID)?.version ?? "1.0.1";
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
  /*  MECÂNICAS DE POKER & CRUPIÊ (TEXAS HOLD'EM / OMAHA)                     */
  /* ======================================================================== */

  static poker = {
    /**
     * Crupiê: Inicia uma nova rodada de Texas Hold'em
     * - Recolhe todas as cartas da mesa, queima e mãos para o baralho
     * - Embaralha o baralho
     * - Distribui 2 Hole Cards fechadas na Mão Privada de cada jogador
     */
    async startRound(deck, playerHands = [], holeCardCount = 2) {
      await deck.recall({ chatNotification: false });
      await deck.shuffle({ chatNotification: false });

      if (playerHands.length > 0) {
        await deck.deal(playerHands, holeCardCount, {
          how: CONST.CARD_DRAW_MODES.TOP,
          chatNotification: false
        });
      }

      await ChatMessage.create({
        content: `<div class="fvtt-card-table-chat"><strong>🎩 Crupiê (Texas Hold'em):</strong> Nova mão iniciada! Baralho embaralhado e ${holeCardCount} cartas privadas distribuídas para ${playerHands.length} jogador(es). Faça suas apostas (Pré-Flop)!</div>`
      });
    },

    /**
     * Crupiê: Queima 1 carta (Burn) e abre as cartas comunitárias no centro da mesa
     * (Flop = Slots 1, 2 e 3 | Turn = Slot 4 | River = Slot 5)
     */
    async dealCommunity(deck, burnPile, communityPile, stage = "flop") {
      const existingCommunity = communityPile.cards.filter(
        (c) => CardStateManager.getCardState(c).boardRole !== "showdown"
      );

      // Se o estágio for "auto", o Crupiê descobre sozinho se é Flop (0->3), Turn (3->4) ou River (4->5)
      if (stage === "auto") {
        if (existingCommunity.length === 0) stage = "flop";
        else if (existingCommunity.length < 4) stage = "turn";
        else if (existingCommunity.length === 4) stage = "river";
        else {
          ui.notifications.info("As 5 cartas comunitárias (Flop, Turn e River) já estão abertas na mesa!");
          return [];
        }
      }

      // 1. Crupiê queima 1 carta virada para baixo (Burn Card)
      if (burnPile && burnPile.id !== communityPile.id && deck.availableCards.length > 0) {
        await burnPile.draw(deck, 1, {
          how: CONST.CARD_DRAW_MODES.TOP,
          updateData: { face: null },
          chatNotification: false
        });
      }

      // 2. Crupiê abre as cartas comunitárias na mesa e marca como "community"
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

      // Numera os slots do Crupiê (1..5)
      const slotUpdates = drawn.map((c, idx) => ({
        _id: c.id,
        [`flags.${MODULE_ID}.state.boardRole`]: "community",
        [`flags.${MODULE_ID}.state.communitySlot`]: startSlot + idx
      }));
      if (slotUpdates.length) {
        await communityPile.updateEmbeddedDocuments("Card", slotUpdates);
      }

      await ChatMessage.create({
        content: `<div class="fvtt-card-table-chat"><strong>🎩 Crupiê (${stage.toUpperCase()}):</strong> Queimou 1 carta e abriu ${drawn.map((c) => `<strong>[${c.name}]</strong>`).join(" ")} na mesa comunitária!</div>`
      });
      return drawn;
    },

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
}
