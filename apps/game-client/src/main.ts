import "./style.css";
import { createGame } from "./app/createGame.js";

const game = createGame();

if (import.meta.env.DEV) {
  (globalThis as typeof globalThis & { __ISORTS_GAME__?: typeof game }).__ISORTS_GAME__ = game;
}
