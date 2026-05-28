import { AuthClient } from "./auth/AuthClient.js";
import { Game } from "./game/Game.js";
import "./styles.css";

const root = document.querySelector("#game-root");
const hudShell = document.querySelector(".hud-shell");
const loginOverlay = document.querySelector("#loginOverlay");
const loginForm = document.querySelector("#loginForm");
const loginError = document.querySelector("#loginError");
const loginButton = document.querySelector("#loginButton");
const usernameInput = document.querySelector("#loginUsername");
const passwordInput = document.querySelector("#loginPassword");
const sessionPanel = document.querySelector("#sessionPanel");
const sessionName = document.querySelector("#sessionName");
const sessionRole = document.querySelector("#sessionRole");
const saveStatus = document.querySelector("#saveStatus");
const logoutButton = document.querySelector("#logoutButton");

const auth = new AuthClient();
let game = null;

function setLoginBusy(busy) {
  if (loginButton) {
    loginButton.disabled = busy;
    loginButton.textContent = busy ? "Accesso..." : "Entra";
  }
}

function showLogin(message = "") {
  loginOverlay.hidden = false;
  hudShell.hidden = true;
  sessionPanel.hidden = true;
  loginError.textContent = message;
  setLoginBusy(false);
  usernameInput?.focus();
}

function showSession(user) {
  loginOverlay.hidden = true;
  hudShell.hidden = false;
  sessionPanel.hidden = false;
  sessionName.textContent = user.displayName ?? user.username;
  sessionRole.textContent = user.role === "admin" ? "admin" : "test";
}

function updateSaveStatus(status) {
  if (!saveStatus) {
    return;
  }
  saveStatus.textContent = status;
  saveStatus.dataset.status = status;
}

function startGame(session) {
  showSession(session.user);
  game = new Game(root, {
    authClient: auth,
    session: session.user,
    progress: session.save,
    onSaveStatus: updateSaveStatus,
  });
  window.__polyhesi = game;
  game.start();
}

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";
  setLoginBusy(true);

  try {
    const session = await auth.login(usernameInput.value, passwordInput.value);
    passwordInput.value = "";
    startGame(session);
  } catch (error) {
    showLogin(error.message || "Accesso non riuscito.");
  }
});

logoutButton?.addEventListener("click", async () => {
  logoutButton.disabled = true;
  await game?.flushProgressSave?.({ force: true });
  auth.logout();
  window.location.reload();
});

setLoginBusy(true);
auth.restoreSession().then((session) => {
  if (session) {
    startGame(session);
  } else {
    showLogin();
  }
});
