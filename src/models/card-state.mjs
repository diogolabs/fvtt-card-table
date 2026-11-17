export const MODULE_ID = "fvtt-card-table";

/**
 * Valores padrão das flags de estado de uma carta individual (Card)
 * Unifica conceitos do Cockatrice, Magic: The Gathering, Buraco e Poker.
 */
export const DEFAULT_CARD_STATE = {
  tapped: false,              // Virada a 90° (MTG Tap / Fecho de Canastra)
  attachedTo: null,           // ID da carta à qual esta carta está anexada (Aura/Equipamento)
  meldGroupId: null,          // ID do jogo/sequência baixada na mesa (Buraco)
  isWildcard: false,          // Curinga (Joker ou 2 no Buraco)
  peekingUsers: [],           // IDs de jogadores que podem espiar a carta mesmo virada para baixo
  counters: {
    plusOne: 0,               // Marcadores +1/+1 (MTG)
    loyalty: 0,               // Lealdade (Planeswalkers)
    charge: 0,                // Carga / Genérico
    custom: []                // [{ label, value, color }]
  },
  metadata: {
    manaCost: "",             // Ex: "{1}{R}{R}"
    cmc: 0,                   // Custo de mana convertido
    cardTypes: [],            // Ex: ["Creature", "Dragon"]
    power: "",
    toughness: "",
    pointValue: 0             // Valor em pontos (Buraco: Ás=15, 2=10, 8-K=10, 3-7=5, Curinga=20)
  }
};

/**
 * Valores padrão das flags de uma pilha/zona (Cards)
 */
export const DEFAULT_STACK_STATE = {
  gameMode: "generic",        // "generic" | "poker" | "buraco" | "mtg"
  zoneType: "deck",           // "library" | "hand" | "battlefield" | "graveyard" | "exile" | "command" | "lixo" | "morto" | "meld" | "community" | "burn"
  pot: 0,                     // Pote acumulado (Poker)
  currentBet: 0,              // Aposta atual da rodada (Poker)
  teamId: null,               // Dupla dona da zona de jogos baixados (Buraco)
  sourceCompendiumUuid: null, // UUID do Compêndio de origem para sincronização de versão
  sourceVersion: "1.0.0"
};

/**
 * Utilitário para ler e gravar estados consistentes nos documentos Card e Cards
 */
export class CardStateManager {
  /**
   * Obtém o estado completo da carta mesclado com os padrões
   * @param {Card} card
   */
  static getCardState(card) {
    const raw = card.getFlag(MODULE_ID, "state") ?? {};
    return foundry.utils.mergeObject(foundry.utils.deepClone(DEFAULT_CARD_STATE), raw);
  }

  /**
   * Atualiza parcialmente o estado da carta
   * @param {Card} card
   * @param {object} patch
   */
  static async updateCardState(card, patch) {
    const current = this.getCardState(card);
    const updated = foundry.utils.mergeObject(current, patch, { inplace: false });
    return card.setFlag(MODULE_ID, "state", updated);
  }

  /**
   * Obtém o estado completo de uma pilha/zona (Cards)
   * @param {Cards} stack
   */
  static getStackState(stack) {
    const raw = stack.getFlag(MODULE_ID, "stackState") ?? {};
    return foundry.utils.mergeObject(foundry.utils.deepClone(DEFAULT_STACK_STATE), raw);
  }

  /**
   * Atualiza parcialmente o estado de uma pilha/zona (Cards)
   * @param {Cards} stack
   * @param {object} patch
   */
  static async updateStackState(stack, patch) {
    const current = this.getStackState(stack);
    const updated = foundry.utils.mergeObject(current, patch, { inplace: false });
    return stack.setFlag(MODULE_ID, "stackState", updated);
  }

  /**
   * Calcula automaticamente a pontuação de uma carta no Buraco caso não esteja definida
   * @param {Card} card
   */
  static getBuracoPointValue(card) {
    const state = this.getCardState(card);
    if (state.metadata?.pointValue > 0) return state.metadata.pointValue;
    if (card.suit === "joker" || card.value === 0) return 20;
    if (card.value === 1 || card.value === 14) return 15; // Ás
    if (card.value === 2) return 10; // Curinga numérico (2)
    if (card.value >= 8 && card.value <= 13) return 10;
    if (card.value >= 3 && card.value <= 7) return 5;
    return 5;
  }
}
