import { MODULE_ID, CardStateManager } from "../models/card-state.mjs";
import { CardEngine } from "../api/card-engine.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Interface Principal de Mesa Virtual, Crupiê Texas Hold'em, Banca de Fichas e Hand Dock
 * Construída em ApplicationV2 nativa do Foundry VTT (v13/v14)
 */
export class TabletopBoardApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.selectedCardIds = new Set();
    this.soloViewActive = false;
  }

  get activeGameMode() {
    return game.settings.get(MODULE_ID, "defaultGameMode") ?? "poker";
  }

  static DEFAULT_OPTIONS = {
    id: "fvtt-card-table-board",
    classes: ["fvtt-card-table-app"],
    tag: "section",
    window: {
      title: "FVTT_CARD_TABLE.App.Title",
      icon: "fa-solid fa-diamond",
      resizable: true,
      minimizable: true
    },
    position: {
      width: 980,
      height: 680
    },
    actions: {
      setGameMode: TabletopBoardApp.#onSetGameMode,
      bootstrapZones: TabletopBoardApp.#onBootstrapZones,
      ensureMyHand: TabletopBoardApp.#onEnsureMyHand,
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
      pokerStartRound: TabletopBoardApp.#onPokerStartRound,
      pokerStage: TabletopBoardApp.#onPokerStage,
      pokerBet: TabletopBoardApp.#onPokerBet,
      pokerCustomBet: TabletopBoardApp.#onPokerCustomBet,
      pokerCheckOrCall: TabletopBoardApp.#onPokerCheckOrCall,
      pokerAllIn: TabletopBoardApp.#onPokerAllIn,
      pokerFold: TabletopBoardApp.#onPokerFold,
      pokerResetPot: TabletopBoardApp.#onPokerResetPot,
      pokerAwardPot: TabletopBoardApp.#onPokerAwardPot,
      pokerBuyInAll: TabletopBoardApp.#onPokerBuyInAll,
      toggleAllowSoloPoker: TabletopBoardApp.#onToggleAllowSoloPoker,
      switchPokerSubMode: TabletopBoardApp.#onSwitchPokerSubMode,
      soloStartHand: TabletopBoardApp.#onSoloStartHand,
      soloStep: TabletopBoardApp.#onSoloStep,
      soloFold: TabletopBoardApp.#onSoloFold,
      buracoSetup: TabletopBoardApp.#onBuracoSetup,
      buracoBuyTrash: TabletopBoardApp.#onBuracoBuyTrash,
      buracoPlayMeld: TabletopBoardApp.#onBuracoPlayMeld
    }
  };

  static PARTS = {
    board: {
      template: `modules/${MODULE_ID}/templates/tabletop.hbs`,
      scrollable: [".fvtt-card-table-container", ".fvtt-ct-battlefield", ".fvtt-ct-hand-dock"]
    }
  };

  _resolveZones() {
    const mode = this.activeGameMode;
    const decks = game.cards.filter((c) => c.type === "deck");
    const allHands = game.cards.filter((c) => c.type === "hand");
    const piles = game.cards.filter((c) => c.type === "pile");

    const mainDeck =
      decks.find((d) => CardStateManager.getStackState(d).gameMode === mode) ??
      decks[0] ??
      null;

    const playerHand =
      allHands.find((h) => CardStateManager.getStackState(h).ownerUserId === game.user.id) ??
      allHands.find((h) => h.name === `Mão de ${game.user.name}`) ??
      allHands.find((h) => !game.user.isGM && h.testUserPermission(game.user, "OWNER")) ??
      null;

    const battlefieldPile =
      piles.find((p) => ["battlefield", "community", "meld"].includes(CardStateManager.getStackState(p).zoneType)) ??
      piles[0] ??
      null;

    const discardPile =
      piles.find(
        (p) =>
          p.id !== battlefieldPile?.id &&
          ["graveyard", "lixo", "burn"].includes(CardStateManager.getStackState(p).zoneType)
      ) ??
      piles.find((p) => p.id !== battlefieldPile?.id) ??
      null;

    const secondaryPile =
      piles.find((p) => ["exile", "morto"].includes(CardStateManager.getStackState(p).zoneType)) ??
      piles[2] ??
      null;

    return { mainDeck, playerHand, battlefieldPile, discardPile, secondaryPile, decks, allHands, piles };
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const zones = this._resolveZones();
    const mode = this.activeGameMode;

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
        boardRole: state.boardRole,
        communitySlot: state.communitySlot,
        playedBy: state.playedBy,
        attachedTo: state.attachedTo,
        meldGroupId: state.meldGroupId,
        counters: state.counters,
        metadata: state.metadata,
        pointValue: CardStateManager.getBuracoPointValue(card)
      };
    };

    context.isGM = game.user.isGM;
    context.gameMode = mode;
    context.isMtg = mode === "mtg";
    context.isPoker = mode === "poker";
    context.isBuraco = mode === "buraco";
    context.gameModeLabel =
      mode === "poker"
        ? "Poker (Texas Hold'em)"
        : mode === "buraco"
          ? "Buraco / Canastra"
          : "Magic: The Gathering / Cockatrice";
    context.ccmActive = game.modules.get("complete-card-management")?.active ?? false;

    context.deck = zones.mainDeck
      ? {
          id: zones.mainDeck.id,
          name: zones.mainDeck.name,
          availableCount: zones.mainDeck.availableCards.length,
          totalCount: zones.mainDeck.cards.size
        }
      : null;

    const tableStackState = zones.battlefieldPile
      ? CardStateManager.getStackState(zones.battlefieldPile)
      : { pot: 0, currentBet: 0 };

    const handStackState = zones.playerHand
      ? CardStateManager.getStackState(zones.playerHand)
      : { chips: 1000, roundBet: 0, folded: false };

    const toCall = Math.max(0, (tableStackState.currentBet ?? 0) - (handStackState.roundBet ?? 0));

    context.hand = zones.playerHand
      ? {
          id: zones.playerHand.id,
          name: zones.playerHand.name,
          chips: handStackState.chips ?? 1000,
          roundBet: handStackState.roundBet ?? 0,
          folded: handStackState.folded ?? false,
          toCall,
          canCheck: toCall === 0,
          cards: [...zones.playerHand.cards.contents]
            .sort((a, b) => a.sort - b.sort)
            .map(formatCard)
        }
      : null;

    // Lista de bancas de fichas de todos os jogadores na mesa (para exibir placar e entregar Pote)
    context.playerChipStacks = zones.allHands.map((h) => {
      const st = CardStateManager.getStackState(h);
      return {
        handId: h.id,
        name: h.name.replace(/^Mão de\s+/i, ""),
        chips: st.chips ?? 1000,
        roundBet: st.roundBet ?? 0,
        folded: st.folded ?? false,
        cardCount: h.cards.size
      };
    });

    const allBattlefieldCards = zones.battlefieldPile
      ? [...zones.battlefieldPile.cards.contents]
          .sort((a, b) => a.sort - b.sort)
          .map(formatCard)
      : [];

    const communityCards = allBattlefieldCards.filter((c) => c.boardRole !== "showdown");
    const showdownCards = allBattlefieldCards.filter((c) => c.boardRole === "showdown");

    const slotLabels = [
      { slot: 1, stage: "FLOP 1" },
      { slot: 2, stage: "FLOP 2" },
      { slot: 3, stage: "FLOP 3" },
      { slot: 4, stage: "TURN" },
      { slot: 5, stage: "RIVER" }
    ];

    context.dealerSlots = slotLabels.map((s, idx) => ({
      slot: s.slot,
      label: s.stage,
      card: communityCards[idx] ?? null
    }));

    context.showdownCards = showdownCards;

    // Configuração do Modo Solo vs. Crupiê (controlado pelo GM e 100% isolado do Pote Multiplayer)
    context.allowSoloPoker = game.settings.get(MODULE_ID, "allowSoloPoker") ?? false;
    context.canSeeSoloPoker = context.isGM || context.allowSoloPoker;
    if (!context.canSeeSoloPoker) {
      this.soloViewActive = false;
    }
    context.isSoloPokerView = context.isPoker && context.canSeeSoloPoker && this.soloViewActive;

    const soloRaw = handStackState.soloGame ?? {};
    const soloStage = soloRaw.stage || "idle";
    const soloCommunity = soloRaw.communityCards ?? [];
    const soloPlayerCards = soloRaw.playerCards ?? [];
    const soloDealerCards = soloRaw.dealerCards ?? [];

    const nextStageMap = {
      preflop: "Abrir Flop (3)",
      flop: "Abrir Turn (1)",
      turn: "Abrir River (1)",
      river: "Ver Showdown"
    };

    context.solo = {
      active: Boolean(soloRaw.active),
      stage: soloStage,
      stageLabel:
        soloStage === "preflop"
          ? "Pré-Flop"
          : soloStage === "flop"
            ? "Flop"
            : soloStage === "turn"
              ? "Turn"
              : soloStage === "river"
                ? "River"
                : soloStage === "showdown"
                  ? "Showdown Finalizado"
                  : "Aguardando Início",
      isInProgress: ["preflop", "flop", "turn", "river"].includes(soloStage),
      isShowdown: soloStage === "showdown",
      nextStageLabel: nextStageMap[soloStage] ?? "Avançar",
      pot: soloRaw.pot ?? 0,
      playerInvested: soloRaw.playerInvested ?? 0,
      burnedCount: soloRaw.burnedCount ?? 0,
      playerCards: soloPlayerCards,
      dealerCards: soloDealerCards,
      playerLiveEval:
        soloPlayerCards.length > 0
          ? CardEngine.poker.evaluateBestHand([...soloPlayerCards, ...soloCommunity]).name
          : "",
      dealerSlots: slotLabels.map((s, idx) => ({
        slot: s.slot,
        label: s.stage,
        card: soloCommunity[idx] ?? null
      })),
      lastResult: soloRaw.lastResult
        ? {
            ...soloRaw.lastResult,
            isWin: soloRaw.lastResult.outcome === "win",
            isTie: soloRaw.lastResult.outcome === "tie"
          }
        : null
    };

    context.battlefield = zones.battlefieldPile
      ? {
          id: zones.battlefieldPile.id,
          name: zones.battlefieldPile.name,
          pot: tableStackState.pot ?? 0,
          currentBet: tableStackState.currentBet ?? 0,
          buracoScore: context.isBuraco
            ? CardEngine.buraco.calculateTeamScore(zones.battlefieldPile)
            : null,
          cards: allBattlefieldCards
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
    if (!game.user.isGM) return;
    const mode = target.dataset.mode || "poker";
    await game.settings.set(MODULE_ID, "defaultGameMode", mode);
    await this.render();
  }

  static async #onBootstrapZones() {
    if (!game.user.isGM) return;
    await CardEngine.bootstrapWorldZones(this.activeGameMode);
    await this.render();
  }

  static async #onEnsureMyHand() {
    await CardEngine.ensureUserPrivateHand(game.user);
    await this.render();
  }

  static async #onDrawCard(event, target) {
    let { mainDeck, playerHand } = this._resolveZones();
    if (!playerHand) playerHand = await CardEngine.ensureUserPrivateHand(game.user);
    if (!mainDeck) {
      const setup = await CardEngine.bootstrapWorldZones(this.activeGameMode);
      mainDeck = setup.deck;
    }
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
    let { playerHand, battlefieldPile } = this._resolveZones();
    if (!playerHand) return;
    if (!battlefieldPile) {
      const setup = await CardEngine.bootstrapWorldZones(this.activeGameMode);
      battlefieldPile = setup.battlefieldPile;
    }

    const cardId = target.closest("[data-card-id]")?.dataset.cardId;
    const ids = cardId ? [cardId] : [...this.selectedCardIds];
    if (ids.length === 0) return;

    const faceDown = event.shiftKey;
    await playerHand.pass(battlefieldPile, ids, {
      updateData: {
        face: faceDown ? null : 0,
        [`flags.${MODULE_ID}.state.boardRole`]: this.activeGameMode === "poker" ? "showdown" : "battlefield",
        [`flags.${MODULE_ID}.state.playedBy`]: game.user.name
      },
      chatNotification: true
    });
    ids.forEach((id) => this.selectedCardIds.delete(id));
    await this.render();
  }

  static async #onDiscardCard(event, target) {
    let { playerHand, battlefieldPile, discardPile } = this._resolveZones();
    if (!discardPile) {
      const setup = await CardEngine.bootstrapWorldZones(this.activeGameMode);
      discardPile = setup.discardPile;
    }
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

  /* ======================================================================== */
  /*  ACTIONS DE POKER (CRUPIÊ, FICHAS, APOSTAS E POTE)                       */
  /* ======================================================================== */

  static async #onPokerStartRound() {
    let { mainDeck, battlefieldPile } = this._resolveZones();
    if (!mainDeck || !battlefieldPile) {
      const setup = await CardEngine.bootstrapWorldZones("poker");
      mainDeck = setup.deck;
      battlefieldPile = setup.battlefieldPile;
    }
    const playerHands = [];
    for (const u of game.users.contents) {
      const h = await CardEngine.ensureUserPrivateHand(u);
      if (h) playerHands.push(h);
    }
    await CardEngine.poker.startRound(mainDeck, playerHands, battlefieldPile, 2);
    await this.render();
  }

  static async #onPokerStage(event, target) {
    let { mainDeck, battlefieldPile, discardPile, allHands } = this._resolveZones();
    if (!mainDeck || !battlefieldPile || !discardPile) {
      const setup = await CardEngine.bootstrapWorldZones("poker");
      mainDeck = setup.deck;
      battlefieldPile = setup.battlefieldPile;
      discardPile = setup.discardPile;
    }
    const stage = target.dataset.stage || "auto";
    await CardEngine.poker.dealCommunity(mainDeck, discardPile, battlefieldPile, stage, allHands);
    await this.render();
  }

  static async #onPokerBet(event, target) {
    let { battlefieldPile, playerHand } = this._resolveZones();
    if (!playerHand) playerHand = await CardEngine.ensureUserPrivateHand(game.user);
    if (!battlefieldPile) {
      const setup = await CardEngine.bootstrapWorldZones("poker");
      battlefieldPile = setup.battlefieldPile;
    }
    const amount = Number(target.dataset.amount ?? 10);
    await CardEngine.poker.bet(battlefieldPile, playerHand, amount);
    await this.render();
  }

  static async #onPokerCustomBet(event, target) {
    let { battlefieldPile, playerHand } = this._resolveZones();
    if (!playerHand) playerHand = await CardEngine.ensureUserPrivateHand(game.user);
    if (!battlefieldPile) {
      const setup = await CardEngine.bootstrapWorldZones("poker");
      battlefieldPile = setup.battlefieldPile;
    }
    const input = this.element.querySelector(".fvtt-ct-custom-bet-input");
    const amount = Number(input?.value ?? 0);
    if (amount <= 0) {
      ui.notifications.warn("Digite um valor de fichas válido para apostar.");
      return;
    }
    await CardEngine.poker.bet(battlefieldPile, playerHand, amount);
    await this.render();
  }

  static async #onPokerCheckOrCall() {
    let { battlefieldPile, playerHand } = this._resolveZones();
    if (!playerHand) playerHand = await CardEngine.ensureUserPrivateHand(game.user);
    if (!battlefieldPile) return;
    await CardEngine.poker.checkOrCall(battlefieldPile, playerHand);
    await this.render();
  }

  static async #onPokerAllIn() {
    let { battlefieldPile, playerHand } = this._resolveZones();
    if (!playerHand) playerHand = await CardEngine.ensureUserPrivateHand(game.user);
    if (!battlefieldPile) return;
    await CardEngine.poker.allIn(battlefieldPile, playerHand);
    await this.render();
  }

  static async #onPokerFold() {
    let { playerHand, discardPile } = this._resolveZones();
    if (!playerHand) return;
    if (!discardPile) {
      const setup = await CardEngine.bootstrapWorldZones("poker");
      discardPile = setup.discardPile;
    }
    await CardEngine.poker.fold(playerHand, discardPile);
    await this.render();
  }

  static async #onPokerResetPot() {
    if (!game.user.isGM) return;
    const { battlefieldPile, allHands } = this._resolveZones();
    if (!battlefieldPile) return;
    await CardEngine.poker.resetPot(battlefieldPile, allHands);
    await this.render();
  }

  static async #onPokerAwardPot(event, target) {
    if (!game.user.isGM) return;
    const { battlefieldPile, allHands } = this._resolveZones();
    const winnerHandId = target.dataset.handId;
    const winnerHand = allHands.find((h) => h.id === winnerHandId);
    if (!battlefieldPile || !winnerHand) return;
    await CardEngine.poker.awardPot(battlefieldPile, winnerHand, allHands);
    await this.render();
  }

  static async #onPokerBuyInAll(event, target) {
    if (!game.user.isGM) return;
    const { allHands } = this._resolveZones();
    const amount = Number(target.dataset.amount ?? 1000);
    await CardEngine.poker.buyInAll(allHands, amount);
    await this.render();
  }

  static async #onToggleAllowSoloPoker() {
    if (!game.user.isGM) return;
    const current = game.settings.get(MODULE_ID, "allowSoloPoker") ?? false;
    const next = !current;
    await game.settings.set(MODULE_ID, "allowSoloPoker", next);
    ui.notifications.info(
      next
        ? "Modo Solo vs. Crupiê LIBERADO para os jogadores!"
        : "Modo Solo vs. Crupiê OCULTADO para os jogadores."
    );
    await this.render();
  }

  static async #onSwitchPokerSubMode(event, target) {
    const submode = target.dataset.submode;
    this.soloViewActive = submode === "solo";
    await this.render();
  }

  static async #onSoloStartHand(event, target) {
    let { playerHand } = this._resolveZones();
    if (!playerHand) playerHand = await CardEngine.ensureUserPrivateHand(game.user);
    const ante = Number(target.dataset.ante ?? 10);
    this.soloViewActive = true;
    await CardEngine.poker.startSoloHand(playerHand, ante);
    await this.render();
  }

  static async #onSoloStep(event, target) {
    let { playerHand } = this._resolveZones();
    if (!playerHand) return;
    const bet = Number(target.dataset.bet ?? 0);
    const runToShowdown = target.dataset.allin === "true";
    const handState = CardStateManager.getStackState(playerHand);
    const actualBet = runToShowdown ? (handState.chips ?? 0) : bet;
    await CardEngine.poker.advanceSoloHand(playerHand, actualBet, { runToShowdown });
    await this.render();
  }

  static async #onSoloFold() {
    let { playerHand } = this._resolveZones();
    if (!playerHand) return;
    await CardEngine.poker.foldSoloHand(playerHand);
    await this.render();
  }

  /* ======================================================================== */
  /*  ACTIONS DE BURACO                                                       */
  /* ======================================================================== */

  static async #onBuracoSetup() {
    let { mainDeck, battlefieldPile, discardPile, secondaryPile } = this._resolveZones();
    if (!mainDeck || !battlefieldPile || !discardPile) {
      const setup = await CardEngine.bootstrapWorldZones("buraco");
      mainDeck = setup.deck;
      battlefieldPile = setup.battlefieldPile;
      discardPile = setup.discardPile;
    }
    const playerHands = [];
    for (const u of game.users.contents) {
      const h = await CardEngine.ensureUserPrivateHand(u);
      if (h) playerHands.push(h);
    }
    secondaryPile = game.cards.find((c) => c.type === "pile" && CardStateManager.getStackState(c).zoneType === "morto");
    await CardEngine.buraco.setupTable({
      deck: mainDeck,
      playerHands,
      morto1: secondaryPile,
      lixoPile: discardPile
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
