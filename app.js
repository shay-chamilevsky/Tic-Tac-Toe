const STORAGE_KEYS = {
  theme: "ttt_theme",
  tieBreaker: "ttt_tie_breaker",
  burningEarth: "ttt_burning_earth",
};

const API = "/api";
const COMPUTER = "COMPUTER";
const COMPUTER_LABEL = "Computer";

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const state = {
  users: [],
  board: Array(9).fill(null),
  currentPlayer: "X",
  gameActive: false,
  replaying: false,
  coinFlipActive: false,
  moves: [],
  lastGameMoves: [],
  lastCoinFlip: null,
  winningLine: null,
  coinPicks: { p1: null, p2: null },
  coinPickManual: null,
  coinFlipping: false,
  coinFlipAwaitingClose: false,
  sessionPair: null,
  matchNumber: 0,
  sessionScores: { p1Wins: 0, p2Wins: 0, draws: 0 },
  burningIndex: null,
  lastGameMode: "classic",
  lastInitialBurning: null,
  computerThinking: false,
};

const els = {
  userList: document.getElementById("userList"),
  addUserForm: document.getElementById("addUserForm"),
  userNameInput: document.getElementById("userNameInput"),
  player1Select: document.getElementById("player1Select"),
  player2Select: document.getElementById("player2Select"),
  scoreBoard: document.getElementById("scoreBoard"),
  statusBar: document.getElementById("statusBar"),
  board: document.getElementById("board"),
  startBtn: document.getElementById("startBtn"),
  playAgainBtn: document.getElementById("playAgainBtn"),
  replayBtn: document.getElementById("replayBtn"),
  quitBtn: document.getElementById("quitBtn"),
  darkModeBtn: document.getElementById("darkModeBtn"),
  coinFlipOverlay: document.getElementById("coinFlipOverlay"),
  coinP1Name: document.getElementById("coinP1Name"),
  coinP2Name: document.getElementById("coinP2Name"),
  coinP1Status: document.getElementById("coinP1Status"),
  coinP2Status: document.getElementById("coinP2Status"),
  coin: document.getElementById("coin"),
  coinFlipMessage: document.getElementById("coinFlipMessage"),
  coinFlipBtn: document.getElementById("coinFlipBtn"),
  tieBreakerToggle: document.getElementById("tieBreakerToggle"),
  burningEarthToggle: document.getElementById("burningEarthToggle"),
  player1Difficulty: document.getElementById("player1Difficulty"),
  player2Difficulty: document.getElementById("player2Difficulty"),
};

async function apiRequest(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    throw new Error(data?.error || "Request failed");
  }

  return data;
}

async function loadUsers() {
  try {
    state.users = await apiRequest(`${API}/users`);
  } catch {
    state.users = [];
    showServerError();
  }
}

function showServerError() {
  if (location.protocol === "file:") {
    setStatus(
      "Open http://localhost:8080 in your browser after running: node server.js",
    );
    return;
  }
  setStatus("Server is offline. In the project folder run: node server.js");
}

function loadTheme() {
  const theme = localStorage.getItem(STORAGE_KEYS.theme) || "light";
  document.documentElement.setAttribute("data-theme", theme);
}

function toggleTheme() {
  const next =
    document.documentElement.getAttribute("data-theme") === "dark"
      ? "light"
      : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem(STORAGE_KEYS.theme, next);
}

function isTieBreakerEnabled() {
  return els.tieBreakerToggle?.checked ?? true;
}

function loadTieBreakerSetting() {
  const stored = localStorage.getItem(STORAGE_KEYS.tieBreaker);
  if (stored === null) return;
  els.tieBreakerToggle.checked = stored === "true";
}

function saveTieBreakerSetting() {
  localStorage.setItem(STORAGE_KEYS.tieBreaker, String(isTieBreakerEnabled()));
}

function isBurningEarthMode() {
  return els.burningEarthToggle?.checked ?? false;
}

function getActiveMode() {
  return isBurningEarthMode() ? "burningEarth" : "classic";
}

function getModeLabel() {
  return isBurningEarthMode() ? "Burning Earth 🔥" : "Classic";
}

function loadBurningEarthSetting() {
  const stored = localStorage.getItem(STORAGE_KEYS.burningEarth);
  if (stored === null) return;
  els.burningEarthToggle.checked = stored === "true";
}

function saveBurningEarthSetting() {
  localStorage.setItem(
    STORAGE_KEYS.burningEarth,
    String(isBurningEarthMode()),
  );
}

function getUserStats(user) {
  const mode = getActiveMode();
  if (user.classic && user.burningEarth) {
    return user[mode];
  }
  return {
    wins: user.wins ?? 0,
    losses: user.losses ?? 0,
    draws: user.draws ?? 0,
  };
}

function updateModeToggles() {
  const busy = state.gameActive || state.replaying || state.coinFlipActive;
  els.tieBreakerToggle.disabled = busy;
  els.burningEarthToggle.disabled = busy;
}

function findUser(name) {
  return state.users.find((u) => u.name.toLowerCase() === name.toLowerCase());
}

async function addUser(name) {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (findUser(trimmed)) return { ok: false, reason: "exists" };

  try {
    const user = await apiRequest(`${API}/users`, {
      method: "POST",
      body: JSON.stringify({ name: trimmed }),
    });
    state.users.push(user);
    state.users.sort((a, b) => a.name.localeCompare(b.name));
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: "server", message: err.message };
  }
}

async function removeUser(name) {
  await apiRequest(`${API}/users/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  state.users = state.users.filter((u) => u.name !== name);
}

function getSelectedPlayers() {
  return {
    p1: els.player1Select.value,
    p2: els.player2Select.value,
  };
}

function isComputerPlayer(id) {
  return id === COMPUTER;
}

function isComputerSlot(slot) {
  const { p1, p2 } = getSelectedPlayers();
  return slot === "p1" ? isComputerPlayer(p1) : isComputerPlayer(p2);
}

function isEvEMode() {
  const { p1, p2 } = getSelectedPlayers();
  return isComputerPlayer(p1) && isComputerPlayer(p2);
}

function isPvEMode() {
  const { p1, p2 } = getSelectedPlayers();
  return (
    (isComputerPlayer(p1) && !isComputerPlayer(p2)) ||
    (isComputerPlayer(p2) && !isComputerPlayer(p1))
  );
}

function hasComputerInGame() {
  const { p1, p2 } = getSelectedPlayers();
  return isComputerPlayer(p1) || isComputerPlayer(p2);
}

function displayName(id) {
  return isComputerPlayer(id) ? COMPUTER_LABEL : id;
}

function getDifficulty(slot) {
  const el = slot === "p1" ? els.player1Difficulty : els.player2Difficulty;
  return el?.value ?? "medium";
}

function isCurrentTurnComputer() {
  const { p1, p2 } = getSelectedPlayers();
  const currentId = state.currentPlayer === "X" ? p1 : p2;
  return isComputerPlayer(currentId);
}

function canStartGame(p1, p2) {
  return Boolean(p1 && p2 && (p1 !== p2 || p1 === COMPUTER));
}

function playersMatchSession(p1, p2) {
  return state.sessionPair?.p1 === p1 && state.sessionPair?.p2 === p2;
}

function resetSessionScores() {
  state.sessionScores = { p1Wins: 0, p2Wins: 0, draws: 0 };
}

function resetMatchSeries() {
  state.sessionPair = null;
  state.matchNumber = 0;
  resetSessionScores();
}

function startNewMatchSeries() {
  const { p1, p2 } = getSelectedPlayers();
  state.sessionPair = { p1, p2 };
  state.matchNumber = 1;
  resetSessionScores();
}

function recordSessionResult(winnerSymbol) {
  const { p1, p2 } = getSelectedPlayers();
  if (!playersMatchSession(p1, p2)) return;

  if (winnerSymbol === "X") {
    state.sessionScores.p1Wins += 1;
  } else if (winnerSymbol === "O") {
    state.sessionScores.p2Wins += 1;
  } else {
    state.sessionScores.draws += 1;
  }
}

function formatSessionRecord(slot) {
  const { p1Wins, p2Wins, draws } = state.sessionScores;
  if (slot === "p1") {
    return `${p1Wins}W · ${p2Wins}L · ${draws}D`;
  }
  return `${p2Wins}W · ${p1Wins}L · ${draws}D`;
}

function advanceMatchSeries() {
  const { p1, p2 } = getSelectedPlayers();
  if (playersMatchSession(p1, p2)) {
    state.matchNumber += 1;
  } else {
    startNewMatchSeries();
  }
}

function pickStartingPlayer() {
  return Math.random() < 0.5 ? "X" : "O";
}

function nameForSymbol(symbol) {
  const { p1, p2 } = getSelectedPlayers();
  return symbol === "X" ? p1 : p2;
}

function coloredPlayerName(name) {
  const { p1, p2 } = getSelectedPlayers();
  const label = displayName(name);
  if (name === p1) {
    return `<span class="status-player-x">${escapeHtml(label)}</span>`;
  }
  if (name === p2) {
    return `<span class="status-player-o">${escapeHtml(label)}</span>`;
  }
  return escapeHtml(label);
}

function coloredNameForSymbol(symbol) {
  return coloredPlayerName(nameForSymbol(symbol));
}

function matchPrefix() {
  return state.matchNumber > 1 ? `Match ${state.matchNumber} · ` : "";
}

function setGameStatus(message, active = false) {
  setStatus(matchPrefix() + message, active, true);
}

function setTurnGameStatus() {
  setGameStatus(
    `${coloredNameForSymbol(state.currentPlayer)}'s turn (${state.currentPlayer})`,
    true,
  );
}

function renderUserList() {
  els.userList.innerHTML = "";

  if (state.users.length === 0) {
    els.userList.innerHTML =
      '<li class="empty-users">No users yet. Add one above.</li>';
    return;
  }

  state.users.forEach((user) => {
    const stats = getUserStats(user);
    const li = document.createElement("li");
    li.className = "user-item";
    li.innerHTML = `
      <div>
        <div>${escapeHtml(user.name)}</div>
        <div class="stats">W ${stats.wins} · L ${stats.losses} · D ${stats.draws}</div>
      </div>
      <button class="remove-btn" data-name="${escapeAttr(user.name)}" ${state.gameActive ? "disabled" : ""}>Remove</button>
    `;
    els.userList.appendChild(li);
  });
}

function renderPlayerSelects() {
  const { p1, p2 } = getSelectedPlayers();
  const options = state.users.map((u) => u.name);

  [els.player1Select, els.player2Select].forEach((select, i) => {
    const current = i === 0 ? p1 : p2;
    select.innerHTML = '<option value="">— Select —</option>';
    options.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });
    const computerOpt = document.createElement("option");
    computerOpt.value = COMPUTER;
    computerOpt.textContent = COMPUTER_LABEL;
    select.appendChild(computerOpt);

    if (current === COMPUTER || options.includes(current)) {
      select.value = current;
    }
  });

  updateDifficultyVisibility();
  updateScoreBoard();
}

function updateDifficultyVisibility() {
  const { p1, p2 } = getSelectedPlayers();
  const busy = state.gameActive || state.replaying || state.coinFlipActive;

  els.player1Difficulty.hidden = !isComputerPlayer(p1);
  els.player2Difficulty.hidden = !isComputerPlayer(p2);
  els.player1Difficulty.disabled = busy;
  els.player2Difficulty.disabled = busy;
}

function updateScoreBoard() {
  const { p1, p2 } = getSelectedPlayers();

  if (!p1 || !p2) {
    els.scoreBoard.innerHTML =
      '<div style="grid-column: 1 / -1; text-align:center; color: var(--text-muted)">Select both players to see scores</div>';
    return;
  }

  const modeClass = isBurningEarthMode() ? "score-mode burning" : "score-mode";
  const matchLabel =
    state.matchNumber > 1
      ? `<div class="score-match">Match ${state.matchNumber}</div>`
      : "";

  els.scoreBoard.innerHTML = `
    <div class="score-player">
      <div class="name" style="color: var(--x-color)">${escapeHtml(displayName(p1))} (X)</div>
      <div class="record">${formatSessionRecord("p1")}</div>
    </div>
    <div class="score-vs">
      <div class="${modeClass}">${getModeLabel()}</div>
      ${matchLabel || "vs"}
    </div>
    <div class="score-player">
      <div class="name" style="color: var(--o-color)">${escapeHtml(displayName(p2))} (O)</div>
      <div class="record">${formatSessionRecord("p2")}</div>
    </div>
  `;
}

function renderBoard() {
  els.board.innerHTML = "";
  state.board.forEach((cell, index) => {
    const btn = document.createElement("button");
    btn.className = "cell";
    btn.dataset.index = index;
    btn.setAttribute("aria-label", `Cell ${index + 1}`);

    if (cell) {
      btn.textContent = cell;
      btn.classList.add("taken", cell.toLowerCase());
    }

    const blockInput =
      !state.gameActive ||
      state.replaying ||
      cell ||
      state.computerThinking ||
      isCurrentTurnComputer();

    if (blockInput) {
      btn.classList.add("disabled");
    }

    if (state.burningIndex === index) {
      btn.classList.add("burning");
    }

    if (state.winningLine && state.winningLine.includes(index)) {
      btn.classList.add("winning");
    }

    els.board.appendChild(btn);
  });
}

function setStatus(text, active = false, html = false) {
  if (html) {
    els.statusBar.innerHTML = text;
  } else {
    els.statusBar.textContent = text;
  }
  els.statusBar.classList.toggle("active", active);
}

function updateControls() {
  const { p1, p2 } = getSelectedPlayers();
  const busy = state.gameActive || state.replaying || state.coinFlipActive;
  const canStart = canStartGame(p1, p2) && !busy;

  els.startBtn.disabled = !canStart;
  els.playAgainBtn.disabled = !state.lastGameMoves.length || busy;
  els.replayBtn.disabled = !state.lastGameMoves.length || busy;
  els.quitBtn.disabled =
    !state.gameActive && !state.replaying && !state.coinFlipActive;

  els.player1Select.disabled = busy;
  els.player2Select.disabled = busy;
  updateDifficultyVisibility();
  updateModeToggles();
}

function resetBoard(keepPlayers = true) {
  state.board = Array(9).fill(null);
  state.moves = [];
  state.winningLine = null;
  state.gameActive = false;
  state.replaying = false;
  state.burningIndex = null;

  if (!keepPlayers) {
    state.lastGameMoves = [];
  }

  renderBoard();
  updateControls();
}

function beginRound() {
  state.currentPlayer = pickStartingPlayer();
  setTurnGameStatus();
}

function shouldContinueSeries() {
  const { p1, p2 } = getSelectedPlayers();
  return playersMatchSession(p1, p2) && state.lastGameMoves.length > 0;
}

function beginNextRound(continueSeries) {
  const { p1, p2 } = getSelectedPlayers();
  if (!canStartGame(p1, p2)) return;

  if (state.coinFlipActive) closeCoinFlip();

  resetBoard(true);
  state.gameActive = true;
  state.lastGameMoves = [];
  state.lastCoinFlip = null;

  if (continueSeries) {
    advanceMatchSeries();
  } else {
    startNewMatchSeries();
  }

  state.lastGameMode = getActiveMode();
  if (isBurningEarthMode()) {
    state.burningIndex = pickInitialBurningIndex();
    state.lastInitialBurning = state.burningIndex;
  } else {
    state.burningIndex = null;
    state.lastInitialBurning = null;
  }

  beginRound();
  renderBoard();
  renderUserList();
  updateScoreBoard();
  updateControls();
  scheduleComputerTurn();
}

function startGame() {
  beginNextRound(shouldContinueSeries());
}

function pickInitialBurningIndex() {
  return Math.floor(Math.random() * 9);
}

function moveBurningCell(excludeIndex) {
  const emptyCells = [];
  for (let i = 0; i < 9; i++) {
    if (!state.board[i] && i !== state.burningIndex && i !== excludeIndex) {
      emptyCells.push(i);
    }
  }

  if (emptyCells.length > 0) {
    state.burningIndex =
      emptyCells[Math.floor(Math.random() * emptyCells.length)];
    return;
  }

  const others = [];
  for (let i = 0; i < 9; i++) {
    if (i !== state.burningIndex) others.push(i);
  }
  state.burningIndex = others[Math.floor(Math.random() * others.length)];
}

function isBoardFull(board, burningIndex) {
  if (burningIndex === null || burningIndex === undefined) {
    return board.every(Boolean);
  }
  return board.every((cell, i) => i === burningIndex || cell);
}

function checkWinner(board, burningIndex = null) {
  for (const line of WIN_LINES) {
    if (
      burningIndex !== null &&
      burningIndex !== undefined &&
      line.includes(burningIndex)
    ) {
      continue;
    }
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }
  if (isBoardFull(board, burningIndex)) {
    return { winner: null, line: null, draw: true };
  }
  return null;
}

function cloneBoard(board) {
  return [...board];
}

function getValidMoves(board, burningIndex, { excludeBurning = false } = {}) {
  const moves = [];
  for (let i = 0; i < 9; i++) {
    if (board[i]) continue;
    if (excludeBurning && burningIndex !== null && i === burningIndex) continue;
    moves.push(i);
  }
  return moves;
}

function getFireDestinations(board, oldBurning, playedIndex) {
  const emptyCells = [];
  for (let i = 0; i < 9; i++) {
    if (!board[i] && i !== oldBurning && i !== playedIndex) {
      emptyCells.push(i);
    }
  }
  if (emptyCells.length > 0) return emptyCells;

  const others = [];
  for (let i = 0; i < 9; i++) {
    if (i !== oldBurning) others.push(i);
  }
  return others;
}

function simulateMove(board, burningIndex, player, index, isBurningEarth) {
  const newBoard = cloneBoard(board);
  newBoard[index] = player;

  if (!isBurningEarth) {
    return [{ board: newBoard, burningIndex: null }];
  }

  return getFireDestinations(newBoard, burningIndex, index).map((dest) => ({
    board: newBoard,
    burningIndex: dest,
  }));
}

function findWinningMove(board, burningIndex, player, isBurningEarth) {
  const moves = getValidMoves(board, burningIndex);
  for (const index of moves) {
    const outcomes = simulateMove(
      board,
      burningIndex,
      player,
      index,
      isBurningEarth,
    );
    for (const { board: simBoard, burningIndex: simBurning } of outcomes) {
      const result = checkWinner(
        simBoard,
        isBurningEarth ? simBurning : null,
      );
      if (result?.winner === player) return index;
    }
  }
  return null;
}

function findBlockingMove(board, burningIndex, opponent, isBurningEarth) {
  return findWinningMove(board, burningIndex, opponent, isBurningEarth);
}

function evaluateBoardScore(board, burningIndex, aiSymbol, oppSymbol) {
  const result = checkWinner(board, burningIndex);
  if (!result) return null;
  if (result.winner === aiSymbol) return 10;
  if (result.winner === oppSymbol) return -10;
  if (result.draw) return 0;
  return null;
}

function minimaxClassic(board, isMaximizing, aiSymbol, oppSymbol) {
  const score = evaluateBoardScore(board, null, aiSymbol, oppSymbol);
  if (score !== null) return score;

  if (isMaximizing) {
    let best = -Infinity;
    for (const i of getValidMoves(board, null)) {
      const next = cloneBoard(board);
      next[i] = aiSymbol;
      best = Math.max(best, minimaxClassic(next, false, aiSymbol, oppSymbol));
    }
    return best;
  }

  let best = Infinity;
  for (const i of getValidMoves(board, null)) {
    const next = cloneBoard(board);
    next[i] = oppSymbol;
    best = Math.min(best, minimaxClassic(next, true, aiSymbol, oppSymbol));
  }
  return best;
}

function getBestMinimaxMoveClassic(board, aiSymbol, oppSymbol) {
  let bestScore = -Infinity;
  let bestMove = null;

  for (const i of getValidMoves(board, null)) {
    const next = cloneBoard(board);
    next[i] = aiSymbol;
    const score = minimaxClassic(next, false, aiSymbol, oppSymbol);
    if (score > bestScore) {
      bestScore = score;
      bestMove = i;
    }
  }

  return bestMove;
}

function expectiminimaxBE(board, burningIndex, isMaximizing, aiSymbol, oppSymbol) {
  const score = evaluateBoardScore(board, burningIndex, aiSymbol, oppSymbol);
  if (score !== null) return score;

  if (isMaximizing) {
    let best = -Infinity;
    for (const i of getValidMoves(board, burningIndex)) {
      const outcomes = simulateMove(board, burningIndex, aiSymbol, i, true);
      let avg = 0;
      for (const outcome of outcomes) {
        avg += expectiminimaxBE(
          outcome.board,
          outcome.burningIndex,
          false,
          aiSymbol,
          oppSymbol,
        );
      }
      avg /= outcomes.length;
      best = Math.max(best, avg);
    }
    return best;
  }

  let best = Infinity;
  for (const i of getValidMoves(board, burningIndex)) {
    const outcomes = simulateMove(board, burningIndex, oppSymbol, i, true);
    let avg = 0;
    for (const outcome of outcomes) {
      avg += expectiminimaxBE(
        outcome.board,
        outcome.burningIndex,
        true,
        aiSymbol,
        oppSymbol,
      );
    }
    avg /= outcomes.length;
    best = Math.min(best, avg);
  }
  return best;
}

function getBestMinimaxMoveBE(board, burningIndex, aiSymbol, oppSymbol) {
  let bestScore = -Infinity;
  let bestMove = null;

  for (const i of getValidMoves(board, burningIndex)) {
    const outcomes = simulateMove(board, burningIndex, aiSymbol, i, true);
    let avg = 0;
    for (const outcome of outcomes) {
      avg += expectiminimaxBE(
        outcome.board,
        outcome.burningIndex,
        false,
        aiSymbol,
        oppSymbol,
      );
    }
    avg /= outcomes.length;
    if (avg > bestScore) {
      bestScore = avg;
      bestMove = i;
    }
  }

  return bestMove;
}

function pickRandomMove(moves) {
  return moves[Math.floor(Math.random() * moves.length)];
}

function getComputerMove(board, difficulty, symbol, burningIndex, isBurningEarth) {
  const opponent = symbol === "X" ? "O" : "X";
  const moves = getValidMoves(board, burningIndex, {
    excludeBurning: isBurningEarth && difficulty === "easy",
  });

  if (!moves.length) return null;

  if (difficulty === "easy") {
    return pickRandomMove(moves);
  }

  if (difficulty === "medium") {
    if (Math.random() < 0.5) {
      return pickRandomMove(getValidMoves(board, burningIndex));
    }
    const win = findWinningMove(board, burningIndex, symbol, isBurningEarth);
    if (win !== null) return win;
    const block = findBlockingMove(board, burningIndex, opponent, isBurningEarth);
    if (block !== null) return block;
    return pickRandomMove(getValidMoves(board, burningIndex));
  }

  if (isBurningEarth) {
    return (
      getBestMinimaxMoveBE(board, burningIndex, symbol, opponent) ??
      pickRandomMove(moves)
    );
  }

  return (
    getBestMinimaxMoveClassic(board, symbol, opponent) ?? pickRandomMove(moves)
  );
}

async function applyScore(winnerSymbol) {
  const { p1, p2 } = getSelectedPlayers();
  if (!p1 || !p2) return;

  if (hasComputerInGame()) {
    recordSessionResult(winnerSymbol);
    updateScoreBoard();
    return;
  }

  try {
    state.users = await apiRequest(`${API}/games/result`, {
      method: "POST",
      body: JSON.stringify({
        p1,
        p2,
        winner: winnerSymbol,
        mode: getActiveMode(),
      }),
    });
    recordSessionResult(winnerSymbol);
    renderUserList();
    updateScoreBoard();
  } catch {
    setStatus("Could not save game result to the database");
  }
}

function formatSide(side) {
  return side === "heads" ? "Heads" : "Tails";
}

function oppositeSide(side) {
  return side === "heads" ? "tails" : "heads";
}

function resetCoinFlipUi() {
  state.coinPicks = { p1: null, p2: null };
  state.coinPickManual = null;
  state.coinFlipping = false;
  els.coin.className = "coin show-heads";
  els.coinFlipMessage.textContent = "";
  els.coinFlipMessage.classList.remove("result");
  els.coinP1Status.textContent = "Choose a side";
  els.coinP2Status.textContent = "Choose a side";
  els.coinP1Status.classList.remove("ready");
  els.coinP2Status.classList.remove("ready");
  els.coinFlipBtn.disabled = true;
  els.coinFlipBtn.textContent = "Flip coin";

  els.coinFlipOverlay.querySelectorAll(".coin-side-btn").forEach((btn) => {
    btn.disabled = false;
    btn.classList.remove("selected");
  });
}

function updateCoinFlipUi() {
  const { p1, p2 } = getSelectedPlayers();
  const { p1: pick1, p2: pick2 } = state.coinPicks;

  els.coinP1Name.textContent = displayName(p1);
  els.coinP2Name.textContent = displayName(p2);

  els.coinFlipOverlay.querySelectorAll(".coin-player-pick").forEach((block) => {
    const playerKey = block.dataset.player === "1" ? "p1" : "p2";
    const pick = playerKey === "p1" ? pick1 : pick2;

    block.querySelectorAll(".coin-side-btn").forEach((btn) => {
      btn.classList.toggle("selected", btn.dataset.side === pick);
      btn.disabled = state.coinFlipping;
    });
  });

  const setPickStatus = (el, pick, playerKey) => {
    if (!pick) {
      el.textContent = "Choose a side";
      el.classList.remove("ready");
      return;
    }
    const verb = state.coinPickManual === playerKey ? "Picked" : "Assigned";
    el.textContent = `${verb} ${formatSide(pick)}`;
    el.classList.add("ready");
  };

  setPickStatus(els.coinP1Status, pick1, "p1");
  setPickStatus(els.coinP2Status, pick2, "p2");

  if (state.coinFlipping) {
    els.coinFlipBtn.disabled = true;
    return;
  }

  if (pick1 && pick2) {
    els.coinFlipMessage.textContent = "Ready — flip the coin!";
    els.coinFlipBtn.disabled = false;
  } else {
    els.coinFlipMessage.textContent = "";
    els.coinFlipBtn.disabled = true;
  }
}

async function autoResolveEvECoinFlip() {
  handleCoinPick("p1", Math.random() < 0.5 ? "heads" : "tails");
  await delay(800);
  await runCoinFlip();
}

async function maybeAutoFlipCoin() {
  if (!state.coinFlipActive || !hasComputerInGame() || isEvEMode()) return;
  if (!state.coinPicks.p1 || !state.coinPicks.p2 || state.coinFlipping) return;
  await delay(600);
  if (state.coinFlipActive && state.coinPicks.p1 && state.coinPicks.p2) {
    await runCoinFlip();
  }
}

function openCoinFlip() {
  const { p1, p2 } = getSelectedPlayers();
  state.coinFlipActive = true;
  resetCoinFlipUi();
  els.coinP1Name.textContent = displayName(p1);
  els.coinP2Name.textContent = displayName(p2);
  els.coinFlipOverlay.hidden = false;
  setGameStatus("Board full — coin flip tiebreaker!", true);
  updateCoinFlipUi();
  renderUserList();
  updateControls();

  if (isEvEMode()) {
    void autoResolveEvECoinFlip();
  }
}

function closeCoinFlip() {
  state.coinFlipActive = false;
  state.coinFlipping = false;
  state.coinFlipAwaitingClose = false;
  els.coinFlipOverlay.hidden = true;
  els.coinFlipBtn.textContent = "Flip coin";
  updateControls();
}

function handleCoinPick(playerKey, side) {
  if (!state.coinFlipActive || state.coinFlipping) return;

  const otherKey = playerKey === "p1" ? "p2" : "p1";
  state.coinPicks[playerKey] = side;
  state.coinPicks[otherKey] = oppositeSide(side);
  state.coinPickManual = playerKey;
  updateCoinFlipUi();
  void maybeAutoFlipCoin();
}

async function runCoinFlip(replayData = null) {
  const { p1, p2 } = getSelectedPlayers();
  const pick1 = replayData?.p1Pick ?? state.coinPicks.p1;
  const pick2 = replayData?.p2Pick ?? state.coinPicks.p2;

  if (!pick1 || !pick2) return;

  state.coinFlipping = true;
  els.coinFlipBtn.disabled = true;
  els.coinFlipOverlay.querySelectorAll(".coin-side-btn").forEach((btn) => {
    btn.disabled = true;
  });

  const outcome =
    replayData?.outcome ?? (Math.random() < 0.5 ? "heads" : "tails");
  const p1Wins = pick1 === outcome;
  const winnerSymbol = p1Wins ? "X" : "O";
  const winnerName = p1Wins ? p1 : p2;

  els.coinFlipMessage.textContent = "Flipping…";
  els.coin.classList.add("flipping");
  const spins = replayData ? 4 : 5 + Math.floor(Math.random() * 3);
  const endRotation = outcome === "tails" ? 180 : 0;
  const totalDeg = spins * 360 + endRotation;
  els.coin.style.transform = `rotateY(${totalDeg}deg)`;

  await delay(1150);

  els.coin.classList.remove("flipping");
  els.coin.classList.toggle("show-heads", outcome === "heads");
  els.coin.classList.toggle("show-tails", outcome === "tails");
  els.coin.style.transform = "";

  const resultText = `${formatSide(outcome)}! ${coloredPlayerName(winnerName)} wins the tiebreaker.`;
  els.coinFlipMessage.innerHTML = resultText;
  els.coinFlipMessage.classList.add("result");
  setGameStatus(`${coloredPlayerName(winnerName)} wins the coin flip!`, true);

  state.lastCoinFlip = { p1Pick: pick1, p2Pick: pick2, outcome, winnerSymbol };

  if (!replayData) {
    await applyScore(winnerSymbol);
    state.coinFlipping = false;
    state.coinFlipAwaitingClose = true;
    els.coinFlipBtn.textContent = "Done";
    els.coinFlipBtn.disabled = false;
    renderUserList();
    updateControls();
    return;
  }

  state.coinFlipping = false;
}

async function endGame(result) {
  state.gameActive = false;
  state.lastGameMoves = [...state.moves];

  const { p1, p2 } = getSelectedPlayers();

  if (result.winner) {
    state.winningLine = result.line;
    state.lastCoinFlip = null;
    const winnerName = result.winner === "X" ? p1 : p2;
    setGameStatus(`${coloredPlayerName(winnerName)} wins!`, true);
    await applyScore(result.winner);
  } else if (isTieBreakerEnabled()) {
    state.lastCoinFlip = null;
    renderBoard();
    renderUserList();
    openCoinFlip();
    return;
  } else {
    state.lastCoinFlip = null;
    setGameStatus("It's a draw!", true);
    await applyScore(null);
  }

  renderBoard();
  renderUserList();
  updateControls();
}

function executeMove(index) {
  state.board[index] = state.currentPlayer;
  const move = { player: state.currentPlayer, index };

  if (isBurningEarthMode()) {
    moveBurningCell(index);
    move.burningAfter = state.burningIndex;
  }

  state.moves.push(move);

  const burning = isBurningEarthMode() ? state.burningIndex : null;
  const result = checkWinner(state.board, burning);
  if (result) {
    void endGame(result);
    return { ended: true };
  }

  state.currentPlayer = state.currentPlayer === "X" ? "O" : "X";
  setTurnGameStatus();
  renderBoard();
  return { ended: false };
}

async function scheduleComputerTurn() {
  if (state.computerThinking) return;

  while (
    state.gameActive &&
    !state.replaying &&
    !state.coinFlipActive &&
    isCurrentTurnComputer()
  ) {
    state.computerThinking = true;
    renderBoard();

    const waitMs = isEvEMode() ? 600 : 500 + Math.floor(Math.random() * 200);

    try {
      await delay(waitMs);

      if (
        !state.gameActive ||
        state.replaying ||
        state.coinFlipActive ||
        !isCurrentTurnComputer()
      ) {
        break;
      }

      const slot = state.currentPlayer === "X" ? "p1" : "p2";
      const index = getComputerMove(
        state.board,
        getDifficulty(slot),
        state.currentPlayer,
        state.burningIndex,
        isBurningEarthMode(),
      );

      if (index === null || index === undefined) break;

      const { ended } = executeMove(index);
      if (ended) break;
    } finally {
      state.computerThinking = false;
      renderBoard();
      updateControls();
    }
  }
}

function handleCellClick(index) {
  if (
    !state.gameActive ||
    state.replaying ||
    state.board[index] ||
    state.computerThinking ||
    isCurrentTurnComputer()
  ) {
    return;
  }

  const { ended } = executeMove(index);
  if (!ended) {
    void scheduleComputerTurn();
  }
}

function playAgain() {
  beginNextRound(true);
}

function quitGame() {
  if (state.coinFlipActive) {
    closeCoinFlip();
    resetBoard(true);
    setStatus("Coin flip cancelled — no score recorded");
    renderBoard();
    updateControls();
    return;
  }

  if (state.replaying) {
    state.replaying = false;
    resetBoard(true);
    setStatus("Replay cancelled");
    renderBoard();
    updateControls();
    return;
  }

  resetBoard(true);
  setStatus("Game quit — no score recorded");
  updateControls();
}

async function replayGame() {
  if (!state.lastGameMoves.length || state.gameActive) return;

  const isBurning = state.lastGameMode === "burningEarth";

  state.replaying = true;
  state.gameActive = false;
  state.board = Array(9).fill(null);
  state.winningLine = null;
  state.burningIndex = isBurning ? state.lastInitialBurning : null;

  setStatus("Replaying last game…");
  renderBoard();
  updateControls();

  for (let i = 0; i < state.lastGameMoves.length; i++) {
    const move = state.lastGameMoves[i];
    await delay(550);

    state.board[move.index] = move.player;
    renderBoard();

    const cell = els.board.children[move.index];
    cell.classList.add("replay-highlight");
    await delay(350);
    cell.classList.remove("replay-highlight");

    if (isBurning && move.burningAfter !== undefined) {
      await delay(300);
      state.burningIndex = move.burningAfter;
      renderBoard();
      const burnCell = els.board.children[move.burningAfter];
      if (burnCell) {
        burnCell.classList.add("replay-highlight");
        await delay(350);
        burnCell.classList.remove("replay-highlight");
      }
    }
  }

  const result = checkWinner(
    state.board,
    isBurning ? state.burningIndex : null,
  );
  if (result?.winner) {
    state.winningLine = result.line;
    const { p1, p2 } = getSelectedPlayers();
    const winnerName = result.winner === "X" ? p1 : p2;
    setStatus(`Replay: ${coloredPlayerName(winnerName)} wins!`, true, true);
  } else if (state.lastCoinFlip) {
    state.coinFlipActive = true;
    els.coinFlipOverlay.hidden = false;
    resetCoinFlipUi();
    state.coinPicks = {
      p1: state.lastCoinFlip.p1Pick,
      p2: state.lastCoinFlip.p2Pick,
    };
    updateCoinFlipUi();
    els.coinFlipOverlay.querySelectorAll(".coin-side-btn").forEach((btn) => {
      btn.disabled = true;
    });
    els.coinFlipBtn.disabled = true;
    setStatus("Replay: coin flip tiebreaker…", true);
    await runCoinFlip(state.lastCoinFlip);
    await delay(800);
    closeCoinFlip();
  } else {
    setStatus("Replay: draw!", true);
  }

  state.replaying = false;
  renderBoard();
  updateControls();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/'/g, "&#39;");
}

function initBoard() {
  els.board.innerHTML = "";
  for (let i = 0; i < 9; i++) {
    const btn = document.createElement("button");
    btn.className = "cell disabled";
    btn.dataset.index = i;
    els.board.appendChild(btn);
  }
}

els.addUserForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = els.userNameInput.value;
  const result = await addUser(name);

  if (result.ok) {
    els.userNameInput.value = "";
    renderUserList();
    renderPlayerSelects();
    setStatus(`Added ${name.trim()}`);
  } else if (result.reason === "empty") {
    setStatus("Please enter a user name");
  } else if (result.reason === "exists") {
    setStatus("That user already exists");
  } else {
    showServerError();
  }
});

els.userList.addEventListener("click", async (e) => {
  const btn = e.target.closest(".remove-btn");
  if (!btn || btn.disabled) return;

  const name = btn.dataset.name;
  const confirmed = window.confirm(
    `Remove "${name}"?\n\nAll stats for this player will be permanently deleted from the database.`,
  );
  if (!confirmed) return;

  const { p1, p2 } = getSelectedPlayers();

  try {
    await removeUser(name);
    renderUserList();
    renderPlayerSelects();

    if (p1 === name) els.player1Select.value = "";
    if (p2 === name) els.player2Select.value = "";

    resetMatchSeries();
    updateScoreBoard();
    updateControls();
    setStatus(`Removed ${name} from the database`);
  } catch {
    setStatus("Could not remove user from the database");
  }
});

function onPlayerSelectChange() {
  const { p1, p2 } = getSelectedPlayers();
  if (!playersMatchSession(p1, p2)) {
    resetMatchSeries();
  }
  updateDifficultyVisibility();
  updateScoreBoard();
  updateControls();
}

els.player1Select.addEventListener("change", onPlayerSelectChange);
els.player2Select.addEventListener("change", onPlayerSelectChange);

els.board.addEventListener("click", (e) => {
  const cell = e.target.closest(".cell");
  if (!cell) return;
  handleCellClick(Number(cell.dataset.index));
});

els.coinFlipOverlay.addEventListener("click", (e) => {
  const btn = e.target.closest(".coin-side-btn");
  if (!btn) return;
  const block = btn.closest(".coin-player-pick");
  if (!block) return;
  handleCoinPick(block.dataset.player === "1" ? "p1" : "p2", btn.dataset.side);
});

els.coinFlipBtn.addEventListener("click", () => {
  if (state.coinFlipAwaitingClose) {
    closeCoinFlip();
    return;
  }
  if (state.coinFlipping) return;
  void runCoinFlip();
});

els.startBtn.addEventListener("click", startGame);
els.playAgainBtn.addEventListener("click", playAgain);
els.replayBtn.addEventListener("click", replayGame);
els.quitBtn.addEventListener("click", quitGame);
els.darkModeBtn.addEventListener("click", toggleTheme);

els.tieBreakerToggle.addEventListener("change", () => {
  saveTieBreakerSetting();
});

els.burningEarthToggle.addEventListener("change", () => {
  saveBurningEarthSetting();
  resetMatchSeries();
  renderUserList();
  updateScoreBoard();
  updateControls();
});

function startHeartbeat() {
  setInterval(() => {
    fetch(`${API}/heartbeat`, { method: "POST" }).catch(() => {});
  }, 2000);
}

async function init() {
  const missing = Object.entries(els)
    .filter(([, el]) => !el)
    .map(([key]) => key);

  if (missing.length) {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<p style="padding:1rem;margin:0;background:#fee;color:#900;text-align:center;font-family:sans-serif;">
        Page failed to initialize (missing: ${missing.join(", ")}).
      </p>`,
    );
    return;
  }

  loadTheme();
  loadTieBreakerSetting();
  loadBurningEarthSetting();
  initBoard();
  await loadUsers();
  renderUserList();
  renderPlayerSelects();
  updateControls();
  setStatus("Add at least 2 users, select them, then click Start Game");
  startHeartbeat();
}

init();
