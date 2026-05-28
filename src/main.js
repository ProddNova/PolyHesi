import { Game } from "./game/Game.js";
import "./styles.css";

const root = document.querySelector("#game-root");
const game = new Game(root);

window.__polyhesi = game;
game.start();
