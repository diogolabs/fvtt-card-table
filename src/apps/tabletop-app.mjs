import { MODULE_ID, CardStateManager } from "../models/card-state.mjs";
import { CardEngine } from "../api/card-engine.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Interface Principal de Mesa Virtual e Hand Dock (Inspirada no Cockatrice)
 * Construída em ApplicationV2 nativa do Foundry VTT v14
 */
export class TabletopBoardApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.activeGameMode = game.settings.get(MODULE_ID, "defaultGameMode") ?? "mtg";
    this.selectedCardIds = new Set();
  }

  static DEFAULT_OPTIONS = {
    id: "fvtt-card-table-board",
    classes: ["fvtt-card-table-app"],
    tag: "section",
    window: {
      title: "FVTT_CARD_TABLE.App.Title",
      icon: "fa-solid fa-Playing-cards",
      resizable: true,
      minimizable: true
    },
    position: {
      width: 980,
      height: 680
    },
    actions: {
      setGameMode: TabletopBoardApp.#onSetGameMode,
      drawCard: TabletopBoardApp.#onDrawCard,
      shuffleDeck: TabletopBoardApp.#onShuffleDeck,
      recallDeck: TabletopBoardApp.#onRecallDeck,
      sortHand: TabletopBoardApp.#onSortHand,
      toggleSelectCard: TabletopBoardApp.#onToggleSelectCard,
      playCardToTable: TabletopBoardApp.#onPlayCardToTable,
      discardCard: TabletopBoardApp.#onDiscardCard,
      flipCard: TabletopBoardApp.#onFlipCard,
      toggleTapCard: TabletopBoardApp.#onToggleTapCard,
      untapAll: TabletopBoardApp.#onUntapAll,
      modifyCounter: TabletopBoardApp.#onModifyCounter,
      scryDeck: TabletopBoardApp.#onScryDeck,
      mulliganHand: TabletopBoardApp.#onMulliganHand,
      createToken: TabletopBoardApp.#onCreateToken,
      pokerStage: TabletopBoardApp.#onPokerStage,
      pokerBet: TabletopBoardApp.#onPokerBet,
      buracoSetup: TabletopBoardApp.#onBuracoSetup,
      buracoBuyTrash: TabletopBoardApp.#onBuracoBuyTrash,
      buracoPlayMeld: TabletopBoardApp.#onBuracoPlayMeld
    }
  };

  static PARTS = {
    board: {
      template: `modules/${MODULE_ID}/templates/tabletop.hbs`
    }
  };

  /**
   * Localiza ou sugere as pilhas ativas para cada zona da mesa
   */
  _resolveZones() {
    const decks = game.cards.filter((c) => c.type === "deck");
    const hands = game.cards.filter((c) => c.type === "hand" && c.testUserPermission(game.user, "OWNER"));
    const piles = game.cards.filter((c) => c.type === "pile");

    const mainDeck = decks[0] ?? null;
    const playerHand = hands[0] ?? null;
    const battlefieldPile =
      piles.find((p) => ["battlefield", "community", "meld"].includes(CardStateManager.getStackState(p).zoneType)) ??
      piles[0] ??
      null;
    const discardPile =
      piles.find((p) => ["graveyard", "lixo", "burn"].includes(CardStateManager.getStackState(p).zoneType)) ??
      piles[1] ??
      piles[0] ??
      null;
    const secondaryPile =
      piles.find((p) => ["exile", "morto"].includes(CardStateManager.getStackState(p).zoneType)) ??
      piles[2] ??
      null;

    return { mainDeck, playerHand, battlefieldPile, discardPile, secondaryPile, decks, hands, piles };
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const zones = this._resolveZones();

    const formatCard = (card) => {
      const state = CardStateManager.getCardState(card);
      return {
        id: card.id,
        uuid: card.uuid,
        name: card.name,
        img: card.img,
        suit: card.suit,
        value: card.value,
        isFaceDown: card.face === null,
        selected: this.selectedCardIds.has(card.id),
        tapped: state.tapped,
        attachedTo: state.attachedTo,
        meldGroupId: state.meldGroupId,
        counters: state.counters,
        metadata: state.metadata,
        pointValue: CardStateManager.getBuracoPointValue(card)
      };
    };

    context.gameMode = this.activeGameMode;
    context.isMtg = this.activeGameMode === "mtg";
    context.isPoker = this.activeGameMode === "poker";
    context.isBuraco = this.activeGameMode === "buraco";
    context.ccmActive = game.modules.get("complete-card-management")?.active ?? false;

    context.deck = zones.mainDeck
      ? {
          id: zones.mainDeck.id,
          name: zones.mainDeck.name,
          availableCount: zones.mainDeck.availableCards.length,
          totalCount: zones.mainDeck.cards.size
        }
      : null;

    context.hand = zones.playerHand
      ? {
          id: zones.playerHand.id,
          name: zones.playerHand.name,
          cards: [...zones.playerHand.cards.contents]
            .sort((a, b) => a.sort - b.sort)
            .map(formatCard)
        }
      : null;

    context.battlefield = zones.battlefieldPile
      ? {
          id: zones.battlefieldPile.id,
          name: zones.battlefieldPile.name,
          pot: CardStateManager.getStackState(zones.battlefieldPile).pot ?? 0,
          buracoScore: context.isBuraco
            ? CardEngine.buraco.calculateTeamScore(zones.battlefieldPile)
            : null,
          cards: [...zones.battlefieldPile.cards.contents]
            .sort((a, b) => a.sort - b.sort)
            .map(formatCard)
        }
      : null;

    context.discard = zones.discardPile
      ? {
          id: zones.discardPile.id,
          name: zones.discardPile.name,
          count: zones.discardPile.cards.size,
          topCard: zones.discardPile.cards.contents.at(-1)
            ? formatCard(zones.discardPile.cards.contents.at(-1))
            : null,
          cards: [...zones.discardPile.cards.contents].map(formatCard)
        }
      : null;

    return context;
  }

  /* ======================================================================== */
  /*  ACTIONS DECLARATIVOS (APPLICATION V2)                                   */
  /* ======================================================================== */

  static async #onSetGameMode(event, target) {
    this.activeGameMode = target.dataset.mode || "mtg";
    await this.render();
  }

  static async #onDrawCard(event, target) {
    const { mainDeck, playerHand } = this._resolveZones();
    if (!mainDeck || !playerHand) return;
    const count = Number(target.dataset.count ?? 1);
    await playerHand.draw(mainDeck, count, { how: CONST.CARD_DRAW_MODES.TOP });
    await this.render();
  }

  static async #onShuffleDeck() {
    const { mainDeck } = this._resolveZones();
    if (!mainDeck) return;
    await mainDeck.shuffle({ chatNotification: true });
    await this.render();
  }

  static async #onRecallDeck() {
    const { mainDeck } = this._resolveZones();
    if (!mainDeck) return;
    await mainDeck.recall({ chatNotification: true });
    this.selectedCardIds.clear();
    await this.render();
  }

  static async #onSortHand(event, target) {
    const { playerHand } = this._resolveZones();
    if (!playerHand) return;
    const by = target.dataset.sortBy || "suit";
    await CardEngine.sortStack(playerHand, by);
    await this.render();
  }

  static async #onToggleSelectCard(event, target) {
    const cardId = target.closest("[data-card-id]")?.dataset.cardId;
    if (!cardId) return;
    if (this.selectedCardIds.has(cardId)) this.selectedCardIds.delete(cardId);
    else this.selectedCardIds.add(cardId);
    await this.render();
  }

  static async #onPlayCardToTable(event, target) {
    const { playerHand, battlefieldPile } = this._resolveZones();
    if (!playerHand || !battlefieldPile) return;
    const cardId = target.closest("[data-card-id]")?.dataset.cardId;
    const ids = cardId ? [cardId] : [...this.selectedCardIds];
    if (ids.length === 0) return;

    const faceDown = event.shiftKey; // Shift + clique joga virada para baixo (estilo Cockatrice)
    await playerHand.pass(battlefieldPile, ids, {
      updateData: { face: faceDown ? null : 0 },
      chatNotification: true
    });
    ids.forEach((id) => this.selectedCardIds.delete(id));
    await this.render();
  }

  static async #onDiscardCard(event, target) {
    const { playerHand, battlefieldPile, discardPile } = this._resolveZones();
    if (!discardPile) return;
    const cardEl = target.closest("[data-card-id]");
    const cardId = cardEl?.dataset.cardId;
    const zone = cardEl?.dataset.zone;
    const sourceStack = zone === "battlefield" ? battlefieldPile : playerHand;
    if (!sourceStack || !cardId) return;

    await sourceStack.pass(discardPile, [cardId], {
      updateData: { face: 0 },
      chatNotification: true
    });
    this.selectedCardIds.delete(cardId);
    await this.render();
  }

  static async #onFlipCard(event, target) {
    const { playerHand, battlefieldPile } = this._resolveZones();
    const cardEl = target.closest("[data-card-id]");
    const cardId = cardEl?.dataset.cardId;
    const zone = cardEl?.dataset.zone;
    const stack = zone === "battlefield" ? battlefieldPile : playerHand;
    const card = stack?.cards.get(cardId);
    if (!card) return;
    await card.flip();
    await this.render();
  }

  static async #onToggleTapCard(event, target) {
    const { battlefieldPile } = this._resolveZones();
    const cardId = target.closest("[data-card-id]")?.dataset.cardId;
    const card = battlefieldPile?.cards.get(cardId);
    if (!card) return;
    await CardEngine.mtg.toggleTap(card);
    await this.render();
  }

  static async #onUntapAll() {
    const { battlefieldPile } = this._resolveZones();
    if (!battlefieldPile) return;
    await CardEngine.mtg.untapAll(battlefieldPile);
    await this.render();
  }

  static async #onModifyCounter(event, target) {
    const { battlefieldPile } = this._resolveZones();
    const cardId = target.closest("[data-card-id]")?.dataset.cardId;
    const card = battlefieldPile?.cards.get(cardId);
    if (!card) return;
    const counterType = target.dataset.counter || "plusOne";
    const delta = Number(target.dataset.delta ?? 1);
    await CardEngine.mtg.modifyCounter(card, counterType, delta);
    await this.render();
  }

  static async #onScryDeck(event, target) {
    const { mainDeck } = this._resolveZones();
    if (!mainDeck) return;
    const count = Number(target.dataset.count ?? 2);
    await CardEngine.mtg.scry(mainDeck, count);
  }

  static async #onMulliganHand() {
    const { mainDeck, playerHand } = this._resolveZones();
    if (!mainDeck || !playerHand) return;
    await CardEngine.mtg.mulligan(playerHand, mainDeck, 7);
    await this.render();
  }

  static async #onCreateToken() {
    const { battlefieldPile } = this._resolveZones();
    if (!battlefieldPile) return;
    await CardEngine.mtg.createToken(battlefieldPile);
    await this.render();
  }

  static async #onPokerStage(event, target) {
    const { mainDeck, battlefieldPile, discardPile } = this._resolveZones();
    if (!mainDeck || !battlefieldPile) return;
    const stage = target.dataset.stage || "flop";
    await CardEngine.poker.dealCommunity(mainDeck, discardPile, battlefieldPile, stage);
    await this.render();
  }

  static async #onPokerBet(event, target) {
    const { battlefieldPile } = this._resolveZones();
    if (!battlefieldPile) return;
    const amount = Number(target.dataset.amount ?? 10);
    await CardEngine.poker.bet(battlefieldPile, amount);
    await this.render();
  }

  static async #onBuracoSetup() {
    const { mainDeck, hands, battlefieldPile, discardPile, secondaryPile } = this._resolveZones();
    if (!mainDeck) return;
    await CardEngine.buraco.setupTable({
      deck: mainDeck,
      playerHands: hands,
      morto1: secondaryPile,
      lixoPile: discardPile ?? battlefieldPile
    });
    await this.render();
  }

  static async #onBuracoBuyTrash() {
    const { playerHand, discardPile } = this._resolveZones();
    if (!playerHand || !discardPile) return;
    await CardEngine.buraco.buyTrash(playerHand, discardPile);
    await this.render();
  }

  static async #onBuracoPlayMeld() {
    const { playerHand, battlefieldPile } = this._resolveZones();
    if (!playerHand || !battlefieldPile) return;
    const ids = [...this.selectedCardIds];
    if (ids.length === 0) {
      ui.notifications.warn(game.i18n.localize("FVTT_CARD_TABLE.Notifications.SelectCardsForMeld"));
      return;
    }
    await CardEngine.buraco.playMeld(playerHand, battlefieldPile, ids);
    this.selectedCardIds.clear();
    await this.render();
  }
}

/**
 * Dialogo ApplicationV2 para Scry / Peek (Olhar e ordenar topo/fundo do baralho)
 */
export class ScryDialogApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor({ deck, cards = [] }, options = {}) {
    super(options);
    this.deck = deck;
    this.scryItems = cards.map((c) => ({
      id: c.id,
      name: c.name,
      img: c.faces?.[0]?.img || c.img,
      destination: "top"
    }));
  }

  static DEFAULT_OPTIONS = {
    id: "fvtt-card-table-scry",
    classes: ["fvtt-card-table-scry-app"],
    tag: "section",
    window: {
      title: "FVTT_CARD_TABLE.Scry.Title",
      icon: "fa-solid fa-eye",
      resizable: false
    },
    position: {
      width: 520,
      height: "auto"
    },
    actions: {
      toggleDestination: ScryDialogApp.#onToggleDestination,
      moveUp: ScryDialogApp.#onMoveUp,
      confirmScry: ScryDialogApp.#onConfirmScry
    }
  };

  static PARTS = {
    scry: {
      template: `modules/${MODULE_ID}/templates/scry-dialog.hbs`
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.deckName = this.deck.name;
    context.items = this.scryItems.map((item, idx) => ({
      ...item,
      index: idx,
      isTop: item.destination === "top"
    }));
    return context;
  }

  static async #onToggleDestination(event, target) {
    const id = target.closest("[data-card-id]")?.dataset.cardId;
    const item = this.scryItems.find((i) => i.id === id);
    if (!item) return;
    item.destination = item.destination === "top" ? "bottom" : "top";
    await this.render();
  }

  static async #onMoveUp(event, target) {
    const idx = Number(target.closest("[data-index]")?.dataset.index ?? -1);
    if (idx <= 0) return;
    const temp = this.scryItems[idx - 1];
    this.scryItems[idx - 1] = this.scryItems[idx];
    this.scryItems[idx] = temp;
    await this.render();
  }

  static async #onConfirmScry() {
    const topIds = this.scryItems.filter((i) => i.destination === "top").map((i) => i.id);
    const bottomIds = this.scryItems.filter((i) => i.destination === "bottom").map((i) => i.id);
    await CardEngine.mtg.resolveScry(this.deck, topIds, bottomIds);
    await this.close();
  }
}
