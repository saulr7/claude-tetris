# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JS Tetris (HTML5 Canvas). No dependencies, no build, no tests, no linter. The README and UI text are in Spanish; keep user-facing strings consistent with that.

## Running

Open `index.html` directly, or serve statically: `python3 -m http.server 8000` then visit `http://localhost:8000`.

## Architecture

Three files, all loaded by `index.html` (`game.js` via a plain `<script>`, no modules):

- `index.html` — fixed DOM the script looks up by id: `board` (300×600 canvas), `next-canvas` (120×120), `score`/`lines`/`level`, and the `overlay` / `overlay-title` / `overlay-score` / `restart-btn` group. Renaming an id requires updating the lookups at the top of `game.js`.
- `style.css` — layout and theme; the overlay is shown/hidden via the `hidden` class.
- `game.js` — the whole game, in a single file using module-level mutable globals (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, …) declared on one `let` line and (re)initialized in `init()`.

### Game model

- `board` is a `ROWS×COLS` (20×10) array of color indices; `0` is empty. `PIECES[i]` and `COLORS[i]` share the same 1–7 index (I,O,T,S,Z,J,L), and the shape's cell values *are* that index, so `drawBlock` colors directly from the cell value.
- Pieces are `{type, shape, x, y}`; rotation produces a new matrix via `rotateCW`, and `tryRotate` tries horizontal wall kicks `[0,-1,1,-2,2]`.
- `collide(shape, ox, oy)` is the single collision check used for movement, rotation, ghost, and spawn (game over is detected in `spawn()` when the new piece collides).
- Piece lifecycle: `lockPiece()` → `merge()` → `clearLines()` (updates lines/score/level/`dropInterval`) → `spawn()`.

### Loop and input

- `requestAnimationFrame` `loop(ts)` accumulates elapsed time into `dropAccum` and applies gravity when it exceeds `dropInterval`, then calls `draw()` every frame. `animId` is cancelled on pause, game over and `init()` — keep that pairing when changing control flow so loops don't stack.
- Input is one `keydown` listener (arrows, `X`, Space, `P`/`Escape`). Pause shows the `#pause-menu` overlay (Reanudar/Reiniciar/controles/`startLevel` selector, persisted in localStorage; `init()` uses `startLevel`). Soft drop and hard drop add score directly (1 / 2 per row); line-clear scoring uses `LINE_SCORES * level`.
- Speed: `dropInterval = max(100, 1000 - (level-1)*90)`; level = `startLevel + floor(lines/10)`.
