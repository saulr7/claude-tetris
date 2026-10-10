'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#42a5f5', // J - sky blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeBtn = document.getElementById('theme-btn');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const recordsEl = document.getElementById('records');
const scoresBody = document.getElementById('scores-body');
const bestStatsEl = document.getElementById('best-stats');
const clearBtn = document.getElementById('clear-btn');

const SCORES_KEY = 'tetris-highscores';
const BEST_KEY = 'tetris-best';
const MAX_SCORES = 5;

let gridColor = '#22222e';
let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, combo, maxCombo, highlightIdx;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  return cleared;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  // Combo: locks consecutivos que limpian líneas
  if (clearLines()) {
    combo++;
    maxCombo = Math.max(maxCombo, combo);
  } else {
    combo = 0;
  }
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  if (!current) return; // pantalla de inicio: tablero neutro

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function loadScores() {
  try {
    const data = JSON.parse(localStorage.getItem(SCORES_KEY));
    if (Array.isArray(data)) {
      return data.filter(s => s && typeof s.score === 'number').slice(0, MAX_SCORES);
    }
  } catch (e) { /* localStorage no disponible o datos corruptos */ }
  return [];
}

function saveScores(list) {
  try { localStorage.setItem(SCORES_KEY, JSON.stringify(list)); } catch (e) { /* ignorar */ }
}

function loadBest() {
  try {
    const b = JSON.parse(localStorage.getItem(BEST_KEY));
    if (b && typeof b === 'object') return { maxCombo: +b.maxCombo || 0, maxLines: +b.maxLines || 0 };
  } catch (e) { /* ignorar */ }
  return { maxCombo: 0, maxLines: 0 };
}

function saveBest(b) {
  try { localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch (e) { /* ignorar */ }
}

// ¿La puntuación entra en el top 5?
function qualifies(s) {
  if (s <= 0) return false;
  const list = loadScores();
  return list.length < MAX_SCORES || s > list[list.length - 1].score;
}

function renderRecords() {
  const list = loadScores();
  scoresBody.textContent = '';
  if (!list.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.className = 'empty';
    td.textContent = 'Sin records todavía';
    tr.appendChild(td);
    scoresBody.appendChild(tr);
  }
  list.forEach((s, i) => {
    const tr = document.createElement('tr');
    if (i === highlightIdx) tr.className = 'new-record';
    let d = '';
    try { d = new Date(s.date).toLocaleDateString('es'); } catch (e) { /* ignorar */ }
    if (d === 'Invalid Date') d = '';
    [i + 1, s.name, Number(s.score).toLocaleString(), s.lines, s.level, d].forEach(v => {
      const td = document.createElement('td');
      td.textContent = v ?? '';
      tr.appendChild(td);
    });
    scoresBody.appendChild(tr);
  });
  const b = loadBest();
  bestStatsEl.textContent = `Mejor combo: ${b.maxCombo} · Máx. líneas: ${b.maxLines}`;
}

// Muestra el overlay; withRecords muestra la tabla de records
function showOverlay(title, scoreText, withRecords, btnText) {
  overlayTitle.textContent = title;
  overlayScore.textContent = scoreText;
  recordsEl.classList.toggle('hidden', !withRecords);
  if (withRecords) renderRecords();
  restartBtn.textContent = btnText;
  overlay.classList.remove('hidden');
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  const best = loadBest();
  best.maxCombo = Math.max(best.maxCombo, maxCombo);
  best.maxLines = Math.max(best.maxLines, lines);
  saveBest(best);
  const isRecord = qualifies(score);
  nameForm.classList.toggle('hidden', !isRecord);
  showOverlay('GAME OVER', `Puntuación: ${score.toLocaleString()} · Combo máx.: ${maxCombo}`, true, 'Reiniciar');
  if (isRecord) {
    nameInput.value = 'Jugador';
    nameInput.focus();
    nameInput.select();
  }
}

function submitRecord() {
  const list = loadScores();
  const entry = {
    name: nameInput.value.trim().slice(0, 12) || 'Jugador',
    score, lines, level,
    date: new Date().toISOString(),
  };
  // Insertar tras los empates existentes y recortar al top 5
  let idx = list.findIndex(s => s.score < entry.score);
  if (idx === -1) idx = list.length;
  list.splice(idx, 0, entry);
  list.length = Math.min(list.length, MAX_SCORES);
  saveScores(list);
  highlightIdx = idx;
  nameForm.classList.add('hidden');
  nameInput.blur();
  renderRecords();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    overlay.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    nameForm.classList.add('hidden');
    showOverlay('PAUSA', '', false, 'Reiniciar');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  // endGame() (vía lockPiece → spawn) ya canceló el frame; no volver a programarlo
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function applyTheme(theme, save) {
  document.documentElement.dataset.theme = theme;
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim() || gridColor;
  if (save) {
    try { localStorage.setItem('theme', theme); } catch (e) { /* localStorage no disponible */ }
  }
  // En pausa o game over el loop está cancelado: repintar a mano
  if (board && (!current || paused || gameOver)) {
    draw();
    if (current) drawNext();
  }
}

function initTheme() {
  let theme = null;
  try { theme = localStorage.getItem('theme'); } catch (e) { /* ignorar */ }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  applyTheme(theme, false);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  combo = 0;
  maxCombo = 0;
  highlightIdx = -1;
  nameForm.classList.add('hidden');
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // No pasar teclas al juego mientras se escribe el nombre
  if (e.target instanceof HTMLInputElement) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
    case 'KeyA':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
    case 'KeyD':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', () => {
  init();
  restartBtn.blur(); // evita que Space (caída) reactive el botón
});

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  submitRecord();
  restartBtn.focus();
  restartBtn.blur();
});

clearBtn.addEventListener('click', () => {
  if (!confirm('¿Borrar todos los records y mejores marcas?')) return;
  try {
    localStorage.removeItem(SCORES_KEY);
    localStorage.removeItem(BEST_KEY);
  } catch (e) { /* ignorar */ }
  highlightIdx = -1;
  nameForm.classList.add('hidden');
  renderRecords();
  clearBtn.blur();
});

themeBtn.addEventListener('click', () => {
  const isLight = document.documentElement.dataset.theme === 'light';
  applyTheme(isLight ? 'dark' : 'light', true);
  themeBtn.blur(); // evita que Space (caída) vuelva a activar el botón
});

// Pantalla de inicio: tablero neutro y overlay con records; el juego arranca con "Jugar"
board = createBoard();
gameOver = true; // bloquea el input hasta pulsar Jugar
highlightIdx = -1;
initTheme();
draw();
showOverlay('TETRIS', '', true, 'Jugar');
