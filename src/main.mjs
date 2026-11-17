import { MODULE_ID, CardStateManager } from "./models/card-state.mjs";
import { CardEngine } from "./api/card-engine.mjs";
import { TabletopBoardApp, ScryDialogApp } from "./apps/tabletop-app.mjs";

let tabletopBoardInstance = null;

/* ========================================================================== */
/*  HOOK: INIT (Configurações, API Pública e Keybindings estilo Cockatrice)   */
/* ========================================================================== */
Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Inicializando módulo de cartas (Poker, Buraco, MTG & Cockatrice)`);

  // Configurações do Módulo
  game.settings.register(MODULE_ID, "defaultGameMode", {
    name: "FVTT_CARD_TABLE.Settings.DefaultGameMode.Name",
    hint: "FVTT_CARD_TABLE.Settings.DefaultGameMode.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      mtg: "Magic: The Gathering / Cockatrice",
      poker: "Poker (Texas Hold'em / Omaha)",
      buraco: "Buraco / Canastra"
    },
    default: "mtg"
  });

  game.settings.register(MODULE_ID, "autoSyncCompendiums", {
    name: "FVTT_CARD_TABLE.Settings.AutoSync.Name",
    hint: "FVTT_CARD_TABLE.Settings.AutoSync.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // Atalhos de teclado inspirados no Cockatrice (Ctrl+D = Comprar, Ctrl+U = Desvirar Tudo, Ctrl+M = Mulligan)
  game.keybindings.register(MODULE_ID, "openTabletopBoard", {
    name: "FVTT_CARD_TABLE.Keybindings.OpenBoard",
    editable: [{ key: "KeyK", modifiers: ["Control"] }],
    onDown: () => {
      if (!tabletopBoardInstance) tabletopBoardInstance = new TabletopBoardApp();
      tabletopBoardInstance.render(true);
      return true;
    }
  });

  // Exposição da API pública no módulo para Macros, Scripts e Integrações
  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      CardEngine,
      CardStateManager,
      TabletopBoardApp,
      ScryDialogApp,
      openBoard: () => {
        if (!tabletopBoardInstance) tabletopBoardInstance = new TabletopBoardApp();
        tabletopBoardInstance.render(true);
        return tabletopBoardInstance;
      }
    };
  }
});

/* ========================================================================== */
/*  HOOK: READY (Sincronização de Compêndios e Integração Opcional com CCM)   */
/* ========================================================================== */
Hooks.once("ready", async () => {
  if (game.user.isGM && game.settings.get(MODULE_ID, "autoSyncCompendiums")) {
    await CardEngine.syncWorldDecksWithCompendium({ notify: true });
  }

  // Integração opcional com Complete Card Management (CCM) se estiver instalado e ativo
  if (game.modules.get("complete-card-management")?.active) {
    console.log(`${MODULE_ID} | Complete Card Management detectado! Ativando ponte de compatibilidade.`);
    Hooks.on("ccm.dropCard", async (card, dropData) => {
      if (dropData?.shiftKey) {
        await card.update({ face: null });
      }
    });
  }
});

/* ========================================================================== */
/*  HOOK: BOTÃO NA BARRA LATERAL DE CARTAS E SCENE CONTROLS                   */
/* ========================================================================== */
Hooks.on("getSceneControlButtons", (controls) => {
  const tokenControls = Array.isArray(controls)
    ? controls.find((c) => c.name === "token")
    : controls.tokens;

  const toolConfig = {
    name: "cardTableBoard",
    title: "FVTT_CARD_TABLE.App.Title",
    icon: "fa-solid fa-diamond",
    button: true,
    onClick: () => {
      if (!tabletopBoardInstance) tabletopBoardInstance = new TabletopBoardApp();
      tabletopBoardInstance.render(true);
    }
  };

  if (Array.isArray(tokenControls?.tools)) {
    tokenControls.tools.push(toolConfig);
  } else if (tokenControls?.tools) {
    tokenControls.tools.cardTableBoard = toolConfig;
  }
});

/* ========================================================================== */
/*  HOOK: DROP DE CARTA DIRETO NO CANVAS (Modo Standalone Tile Card)          */
/* ========================================================================== */
Hooks.on("dropCanvasData", async (canvas, data) => {
  // Se o Complete Card Management estiver ativo, deixamos o Card Layer dele cuidar do drop nativo
  if (game.modules.get("complete-card-management")?.active) return true;

  if (data.type !== "Card" || !data.uuid) return true;
  const card = await fromUuid(data.uuid);
  if (!card) return true;

  const state = CardStateManager.getCardState(card);
  const img = card.face === null ? card.back?.img || card.img : card.img;

  await canvas.scene.createEmbeddedDocuments("Tile", [
    {
      texture: { src: img },
      width: (card.width || 2) * canvas.grid.size,
      height: (card.height || 3) * canvas.grid.size,
      x: data.x,
      y: data.y,
      rotation: state.tapped ? 90 : 0,
      flags: {
        [MODULE_ID]: {
          cardUuid: card.uuid,
          stackId: card.parent?.id
        }
      }
    }
  ]);
  return false;
});

/* ========================================================================== */
/*  HOOK: ATUALIZAÇÃO REATIVA DA MESA VIRTUAL QUANDO CARTAS MUDAM             */
/* ========================================================================== */
for (const hookName of ["createCard", "updateCard", "deleteCard", "updateCards"]) {
  Hooks.on(hookName, () => {
    if (tabletopBoardInstance?.rendered) {
      tabletopBoardInstance.render();
    }
  });
}
