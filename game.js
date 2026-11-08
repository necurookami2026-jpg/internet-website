'use strict';

const DIRECTIONS = [
  { name: 'north', row: -1, col: 0, bit: 1, x: 25, y: 0 },
  { name: 'east', row: 0, col: 1, bit: 2, x: 50, y: 25 },
  { name: 'south', row: 1, col: 0, bit: 4, x: 25, y: 50 },
  { name: 'west', row: 0, col: -1, bit: 8, x: 0, y: 25 },
];

const CIRCUITS = [
  {
    name: 'Allodial Border',
    codex: 'SYSTEM 49',
    brief: 'Open the flood channel between the protected entry and exit.',
    size: 5,
    paths: [
      [[2, 0], [2, 1], [1, 1], [0, 1], [0, 2], [1, 2], [1, 3], [2, 3], [3, 3], [3, 4], [4, 4]],
    ],
  },
  {
    name: 'Flood Fever',
    codex: 'CODEX 129',
    brief: 'Split the flood at the junction and carry it to both rune seals.',
    size: 5,
    paths: [
      [[4, 0], [3, 0], [3, 1], [2, 1], [2, 2], [2, 3], [1, 3], [0, 3], [0, 4]],
      [[2, 2], [3, 2], [4, 2], [4, 3], [3, 3], [3, 4], [2, 4]],
    ],
  },
  {
    name: 'Final Quilt',
    codex: 'CODEX 5',
    brief: 'Join three branches into a single sealed circuit to restore the Final Quilt.',
    size: 6,
    paths: [
      [[5, 0], [4, 0], [4, 1], [4, 2], [3, 2], [3, 3], [2, 3], [2, 4], [1, 4], [0, 4], [0, 5]],
      [[3, 2], [2, 2], [1, 2], [1, 1], [0, 1], [0, 0]],
      [[3, 3], [4, 3], [5, 3], [5, 4], [5, 5], [4, 5], [3, 5], [3, 4]],
    ],
  },
];

function rotate(mask) {
  return ((mask << 1) | (mask >> 3)) & 15;
}

function makeBoard(circuit, seed) {
  const tiles = Array.from({ length: circuit.size ** 2 }, () => ({ solution: 0, mask: 0 }));
  const indexOf = ([row, col]) => row * circuit.size + col;
  tiles[indexOf(circuit.paths[0][0])].role = 'source';

  for (const path of circuit.paths) {
    tiles[indexOf(path.at(-1))].role = 'seal';
    for (let i = 1; i < path.length; i++) {
      const [row, col] = path[i - 1];
      const [nextRow, nextCol] = path[i];
      const direction = DIRECTIONS.findIndex((step) => step.row === nextRow - row && step.col === nextCol - col);
      tiles[indexOf(path[i - 1])].solution |= DIRECTIONS[direction].bit;
      tiles[indexOf(path[i])].solution |= DIRECTIONS[(direction + 2) % 4].bit;
    }
  }

  tiles.forEach((tile, index) => {
    tile.mask = tile.solution;
    if (tile.role || !tile.mask) return;
    const turns = (index * 17 + Math.floor(index / circuit.size) + seed) % 4;
    for (let i = 0; i < turns; i++) tile.mask = rotate(tile.mask);
  });
  return tiles;
}

function neighbor(index, direction, size) {
  const row = Math.floor(index / size) + direction.row;
  const col = index % size + direction.col;
  if (row < 0 || col < 0 || row >= size || col >= size) return -1;
  return row * size + col;
}

function trace(tiles, size) {
  const source = tiles.findIndex((tile) => tile.role === 'source');
  const active = new Set([source]);
  const leaks = new Map();
  let lit = 0;

  for (const index of active) {
    const tile = tiles[index];
    if (tile.role === 'seal') lit++;
    DIRECTIONS.forEach((direction, i) => {
      if (!(tile.mask & direction.bit)) return;
      const next = neighbor(index, direction, size);
      if (tiles[next]?.mask & DIRECTIONS[(i + 2) % 4].bit) {
        active.add(next);
      } else {
        leaks.set(index, (leaks.get(index) ?? 0) | direction.bit);
      }
    });
  }

  const seals = tiles.filter((tile) => tile.role === 'seal').length;
  const leakCount = [...leaks.values()].reduce((total, mask) =>
    total + DIRECTIONS.filter((direction) => mask & direction.bit).length, 0);
  return { active, leaks, lit, seals, leakCount, solved: lit === seals && leakCount === 0 };
}

function startGame(document) {
  const byId = (id) => document.getElementById(id);
  const board = byId('board');
  const status = byId('status');
  const next = byId('next');
  const hint = byId('hint');
  const storageKey = 'temaline-femae-flood-fever-v1';
  let best = {};
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey));
    best = Object.fromEntries(CIRCUITS.flatMap((_, index) =>
      Number.isSafeInteger(saved?.[index]) && saved[index] > 0 ? [[index, saved[index]]] : []));
  } catch {
    // Local storage is optional when playing from a file or a private window.
  }

  let level = 0;
  let tiles;
  let buttons;
  let moves;
  let hinted;
  let flow;

  const unlocked = (index) => index === 0 || Boolean(best[index - 1]);
  const labelNumber = (number) => String(number).padStart(2, '0');
  const coordinates = (index) => `Row ${Math.floor(index / CIRCUITS[level].size) + 1}, column ${index % CIRCUITS[level].size + 1}`;

  function renderLevels() {
    const levels = byId('levels');
    levels.replaceChildren(...CIRCUITS.map((circuit, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'level';
      button.disabled = !unlocked(index);
      if (index === level) button.setAttribute('aria-current', 'step');
      const number = document.createElement('span');
      number.className = 'number';
      number.textContent = labelNumber(index + 1);
      const record = document.createElement('small');
      record.textContent = best[index] ? `Best · ${best[index]}` : (button.disabled ? 'Locked' : 'Open');
      button.append(number, circuit.name, record);
      button.addEventListener('click', () => load(index, true));
      return button;
    }));
  }

  function render() {
    const size = CIRCUITS[level].size;
    flow = trace(tiles, size);
    board.classList.toggle('solved', flow.solved);
    byId('moves').textContent = labelNumber(moves);
    hint.disabled = flow.solved;
    next.hidden = !flow.solved || level === CIRCUITS.length - 1;

    if (flow.solved) {
      status.textContent = level === CIRCUITS.length - 1
        ? `Final Quilt restored in ${moves} moves. All three circuits cleared.`
        : `Circuit sealed in ${moves} moves. Next circuit unlocked.`;
    } else if (hinted !== -1) {
      status.textContent = `Hint · ${coordinates(hinted)} needs another turn.`;
    } else {
      status.textContent = `${flow.lit} / ${flow.seals} seals lit · ${flow.leakCount} ${flow.leakCount === 1 ? 'leak' : 'leaks'}`;
    }

    tiles.forEach((tile, index) => {
      if (!tile.mask) return;
      const button = buttons[index];
      const active = flow.active.has(index);
      const open = flow.leaks.get(index) ?? 0;
      button.classList.toggle('active', active);
      button.classList.toggle('hinted', index === hinted);
      if (!tile.role) button.setAttribute('aria-disabled', String(flow.solved));
      const directions = DIRECTIONS.filter((direction) => tile.mask & direction.bit);
      const role = tile.role ?? 'Conduit';
      const shape = directions.map((direction) =>
        `<path class="wire" d="M25 25 L${direction.x} ${direction.y}"/>`).join('');
      const leaks = directions.filter((direction) => open & direction.bit).map((direction) =>
        `<circle class="leak" cx="${25 + (direction.x - 25) * 0.72}" cy="${25 + (direction.y - 25) * 0.72}" r="3.2"/>`).join('');
      let symbol = '<circle cx="25" cy="25" r="2.7" fill="currentColor"/>';
      if (tile.role === 'source') symbol = '<path class="symbol" d="M25 14 L28 22 L36 25 L28 28 L25 36 L22 28 L14 25 L22 22 Z"/>';
      if (tile.role === 'seal') symbol = '<path class="symbol" d="M25 17 L33 25 L25 33 L17 25 Z"/>';
      button.innerHTML = `<svg viewBox="0 0 50 50" aria-hidden="true">${shape}${symbol}${leaks}</svg>`;
      button.setAttribute('aria-label', `${coordinates(index)}. ${role}, ${directions.map(({ name }) => name).join(' and ')}. ${active ? 'Lit' : 'Unlit'}.${open ? ' Leaking.' : ''}`);
    });
  }

  function turn(index) {
    if (flow.solved) return;
    tiles[index].mask = rotate(tiles[index].mask);
    moves++;
    hinted = -1;
    render();
    if (!flow.solved) return;
    if (!best[level] || moves < best[level]) best[level] = moves;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(best));
    } catch {
      // The current session still retains the unlocked circuits.
    }
    renderLevels();
  }

  function load(index, focusBoard = false) {
    if (!unlocked(index)) return;
    level = index;
    const circuit = CIRCUITS[level];
    tiles = makeBoard(circuit, level + 2);
    moves = 0;
    hinted = -1;
    board.style.setProperty('--size', circuit.size);
    byId('codex').textContent = `${labelNumber(level + 1)} / ${labelNumber(CIRCUITS.length)} · ${circuit.codex}`;
    byId('mission-title').textContent = circuit.name;
    byId('brief').textContent = circuit.brief;

    buttons = tiles.map((tile, tileIndex) => {
      const playable = tile.mask && !tile.role;
      const element = document.createElement(playable ? 'button' : 'div');
      element.className = 'tile';
      if (playable) {
        element.type = 'button';
        element.addEventListener('click', () => turn(tileIndex));
      } else if (tile.role) {
        element.classList.add('fixed');
        element.setAttribute('role', 'img');
      } else {
        element.classList.add('block');
        element.setAttribute('aria-hidden', 'true');
      }
      return element;
    });

    board.replaceChildren(...buttons);
    renderLevels();
    render();
    if (focusBoard) board.querySelector('button')?.focus();
  }

  board.addEventListener('keydown', (event) => {
    const keys = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];
    const direction = DIRECTIONS[keys.indexOf(event.key)];
    let index = buttons.indexOf(event.target);
    if (!direction || index === -1) return;
    event.preventDefault();
    const size = CIRCUITS[level].size;
    do {
      index = neighbor(index, direction, size);
    } while (index !== -1 && buttons[index].tagName !== 'BUTTON');
    if (index !== -1) buttons[index].focus();
  });

  byId('reset').addEventListener('click', () => load(level, true));
  next.addEventListener('click', () => load(level + 1, true));
  hint.addEventListener('click', () => {
    const mismatches = tiles.map((tile, index) => tile.mask !== tile.solution ? index : -1);
    hinted = mismatches.find((index) => index > hinted) ?? mismatches.find((index) => index >= 0) ?? -1;
    render();
  });

  load(0);
}

if (typeof document !== 'undefined') startGame(document);
if (typeof module !== 'undefined') module.exports = { CIRCUITS, makeBoard, rotate, trace };
