import { MODULE_ID, CardStateManager } from "../models/card-state.mjs";
import { ScryDialogApp } from "../apps/tabletop-app.mjs";

const SUIT_ORDER = { spades: 1, hearts: 2, clubs: 3, diamonds: 4, joker: 5 };

/**
 * Motor principal de automação de cartas para Foundry VTT v13 (Cockatrice, MTG, Poker e Buraco)
 */
export class CardEngine {
  /* ======================================================================== */
  /*  GERADOR AUTOMÁTICO DE BARALHOS E ZONAS NO MUNDO (1-CLICK SETUP V13)     */
  /* ======================================================================== */

  /**
   * Cria automaticamente o Baralho completo (52 cartas p/ Poker, 108 p/ Buraco ou Grimório MTG)
   * mais a Mão do Jogador, a Mesa/Campo de Batalha e o Lixo/Cemitério no mundo atual.
   * @param {"mtg"|"poker"|"buraco"} mode
   */
  static async bootstrapWorldZones(mode = "mtg") {
    const defaultImg = "icons/sundries/gaming/playing-cards-grey.webp";
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

    const deck = await Cards.create({
      name: deckName,
      type: "deck",
      img: defaultImg,
      cards: cardsData,
      flags: { [MODULE_ID]: { stackState: { gameMode: mode, zoneType: "library" } } }
    });

    await deck.shuffle({ chatNotification: false });

    if (!game.cards.some((c) => c.type === "hand" && c.testUserPermission(game.user, "OWNER"))) {
      await Cards.create({
        name: `Mão de ${game.user.name}`,
        type: "hand",
        img: defaultImg,
        flags: { [MODULE_ID]: { stackState: { gameMode: mode, zoneType: "hand" } } }
      });
    }

    if (!game.cards.some((c) => c.type === "pile" && ["battlefield", "community", "meld"].includes(CardStateManager.getStackState(c).zoneType))) {
      await Cards.create({
        name: mode === "poker" ? "Mesa Comunitária (Flop/Turn/River)" : mode === "buraco" ? "Jogos Baixados / Canastras" : "Campo de Batalha (TableZone)",
        type: "pile",
        img: defaultImg,
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

    if (!game.cards.some((c) => c.type === "pile" && ["graveyard", "lixo", "burn"].includes(CardStateManager.getStackState(c).zoneType))) {
      await Cards.create({
        name: mode === "poker" ? "Queima / Descarte (Burn)" : mode === "buraco" ? "Lixo" : "Cemitério (Graveyard)",
        type: "pile",
        img: defaultImg,
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
        flags: { [MODULE_ID]: { stackState: { gameMode: "buraco", zoneType: "morto" } } }
      });
    }

    ui.notifications.info(`Baralho "${deckName}" (${cardsData.length} cartas) e zonas de jogo criados com sucesso!`);
    return deck;
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

    const moduleVersion = game.modules.get(MODULE_ID)?.version ?? "13.0.0";
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
  /*  MECÂNICAS DE POKER (TEXAS HOLD'EM / OMAHA)                              */
  /* ======================================================================== */

  static poker = {
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

    async dealCommunity(deck, burnPile, communityPile, stage = "flop") {
      if (burnPile && deck.availableCards.length > 0) {
        await burnPile.draw(deck, 1, {
          how: CONST.CARD_DRAW_MODES.TOP,
          updateData: { face: null },
          chatNotification: false
        });
      }

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
