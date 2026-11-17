import { MODULE_ID, CardStateManager } from "./models/card-state.mjs";
import { CardEngine } from "./api/card-engine.mjs";
import { TabletopBoardApp, ScryDialogApp } from "./apps/tabletop-app.mjs";

let tabletopBoardInstance = null;

function openCardTableBoard() {
  if (!tabletopBoardInstance) tabletopBoardInstance = new TabletopBoardApp();
  tabletopBoardInstance.render({ force: true });
  return tabletopBoardInstance;
}

/* ========================================================================== */
/*  HOOK: INIT (Configurações, API Pública e Keybindings)                     */
/* ========================================================================== */
Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Inicializando módulo de cartas (Poker, Buraco, MTG & Cockatrice)`);

  game.settings.register(MODULE_ID, "defaultGameMode", {
    name: "FVTT_CARD_TABLE.Settings.DefaultGameMode.Name",
    hint: "FVTT_CARD_TABLE.Settings.DefaultGameMode.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      standard: "Padrão (Sistema Integrado do Foundry)",
      poker: "Poker (Texas Hold'em / Crupiê)",
      buraco: "Buraco / Canastra",
      mtg: "Magic: The Gathering / Cockatrice"
    },
    default: "poker",
    onChange: () => {
      if (tabletopBoardInstance?.rendered) {
        tabletopBoardInstance.render();
      }
    }
  });

  game.settings.register(MODULE_ID, "autoSyncCompendiums", {
    name: "FVTT_CARD_TABLE.Settings.AutoSync.Name",
    hint: "FVTT_CARD_TABLE.Settings.AutoSync.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "allowSoloPoker", {
    name: "FVTT_CARD_TABLE.Settings.AllowSoloPoker.Name",
    hint: "FVTT_CARD_TABLE.Settings.AllowSoloPoker.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => {
      if (tabletopBoardInstance?.rendered) {
        tabletopBoardInstance.render();
      }
    }
  });

  game.keybindings.register(MODULE_ID, "openTabletopBoard", {
    name: "FVTT_CARD_TABLE.Keybindings.OpenBoard",
    editable: [{ key: "KeyK", modifiers: ["Control"] }],
    onDown: () => {
      openCardTableBoard();
      return true;
    }
  });

  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      CardEngine,
      CardStateManager,
      TabletopBoardApp,
      ScryDialogApp,
      openBoard: openCardTableBoard
    };
  }
});

/* ========================================================================== */
/*  HOOK: READY (Mãos Privadas Automáticas e Sincronização de Compêndios)     */
/* ========================================================================== */
Hooks.once("ready", async () => {
  if (game.user.isGM) {
    if (game.settings.get(MODULE_ID, "autoSyncCompendiums")) {
      await CardEngine.syncWorldDecksWithCompendium({ notify: true });
    }
    for (const u of game.users.contents) {
      await CardEngine.ensureUserPrivateHand(u);
    }
  }

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
/*  HOOK: SCENE CONTROLS & ABA DE CARTAS                                      */
/* ========================================================================== */
Hooks.on("getSceneControlButtons", (controls) => {
  const tokenControls = Array.isArray(controls)
    ? controls.find((c) => c.name === "token" || c.name === "tokens")
    : controls.tokens ?? controls.token;

  if (!tokenControls) return;

  const toolConfig = {
    name: "cardTableBoard",
    title: "FVTT_CARD_TABLE.App.Title",
    icon: "fa-solid fa-diamond",
    order: 99,
    button: true,
    visible: true,
    onChange: () => openCardTableBoard(),
    onClick: () => openCardTableBoard()
  };

  if (Array.isArray(tokenControls.tools)) {
    tokenControls.tools.push(toolConfig);
  } else if (tokenControls.tools && typeof tokenControls.tools === "object") {
    tokenControls.tools.cardTableBoard = toolConfig;
  }
});

Hooks.on("renderCardsDirectory", (app, html) => {
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root || root.querySelector(".fvtt-ct-directory-btn")) return;

  const headerActions = root.querySelector(".header-actions");
  if (!headerActions) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "fvtt-ct-directory-btn";
  btn.innerHTML = `<i class="fa-solid fa-diamond"></i> Mesa de Cartas`;
  btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    openCardTableBoard();
  });
  headerActions.appendChild(btn);
});

/* ========================================================================== */
/*  HOOK: DROP DE CARTA DIRETO NO CANVAS (Modo Standalone Tile Card)          */
/* ========================================================================== */
Hooks.on("dropCanvasData", async (canvas, data) => {
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
for (const hookName of ["createCard", "updateCard", "deleteCard", "updateCards", "createCards", "deleteCards"]) {
  Hooks.on(hookName, () => {
    if (tabletopBoardInstance?.rendered) {
      tabletopBoardInstance.render();
    }
  });
}
