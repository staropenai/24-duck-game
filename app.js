let state = null;
let audioCtx = null;
let soundEnabled = false;
let timerHandle = null;
let musicHandle = null;

const $ = (id) => document.getElementById(id);
const TARGET = 24;
const RANKS = [
  ["A", 1], ["2", 2], ["3", 3], ["4", 4], ["5", 5], ["6", 6], ["7", 7],
  ["8", 8], ["9", 9], ["10", 10], ["J", 11], ["Q", 12], ["K", 13],
];
const SUITS = ["♠", "♥", "♦", "♣"];
const TABLE_THEMES = ["felt-green", "felt-blue", "felt-burgundy", "felt-ink"];
const FAMILY_CARD_ARTS = Array.isArray(window.FAMILY_CARD_ARTS) ? window.FAMILY_CARD_ARTS : [];
const ENCOURAGEMENTS = [
  "漂亮！这就是把复杂问题拆成小块。",
  "好牌感：先找结构，再做计算。",
  "答对了。这个组合路径值得记住。",
  "优秀，简单规则里真的会长出复杂变化。",
  "你抓到了关键中间数。继续。",
];
const WRONG_MESSAGES = [
  "先别急，看看是不是用了四张牌各一次。",
  "这一步接近了，试试先造 3、4、6、8、12 这些中间数。",
  "换个括号位置再试，24 点经常输在运算顺序。",
  "错了不扣鸭，错误就是搜索空间的一部分。",
];
const BEST_TIME_KEY = "twenty_four_duck_best_time_seconds_v1";
const EXTRA_SOLUTION_REWARDS = [0, 3, 5];
const MAX_CORRECT_PER_ROUND = 3;

function buildDeck() {
  const deck = [];
  let cardIndex = 0;
  for (const suit of SUITS) {
    for (const [rank, value] of RANKS) {
      const art = FAMILY_CARD_ARTS[cardIndex % Math.max(1, FAMILY_CARD_ARTS.length)] || null;
      deck.push({rank, value, suit, label: `${rank}${suit}`, art, artSourceId: art ? art.sourceId : `plain_${cardIndex}`});
      cardIndex += 1;
    }
  }
  return deck;
}

function shuffle(values) {
  const arr = [...values];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function dealSolvableHand() {
  const deck = buildDeck();
  for (let attempt = 0; attempt < 10000; attempt++) {
    const hand = shuffle(deck).slice(0, 4);
    if (!hasUniqueCardArt(hand)) continue;
    if (solve24(hand.map((card) => card.value), 1).length > 0) return hand;
  }
  throw new Error("无法发出可解牌，请重试。");
}

function hasUniqueCardArt(hand) {
  const ids = hand.map((card) => card.artSourceId || card.label);
  return new Set(ids).size === ids.length;
}

function solve24(values, limit = 20) {
  const items = values.map((value) => ({value, expr: String(value)}));
  const solutions = [];

  function rec(list) {
    if (solutions.length >= limit) return;
    if (list.length === 1) {
      if (Math.abs(list[0].value - TARGET) < 1e-9) solutions.push(list[0].expr);
      return;
    }
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const rest = list.filter((_, idx) => idx !== i && idx !== j);
        const candidates = [
          {value: a.value + b.value, expr: `(${a.expr}+${b.expr})`},
          {value: a.value - b.value, expr: `(${a.expr}-${b.expr})`},
          {value: b.value - a.value, expr: `(${b.expr}-${a.expr})`},
          {value: a.value * b.value, expr: `(${a.expr}*${b.expr})`},
        ];
        if (Math.abs(b.value) > 1e-12) candidates.push({value: a.value / b.value, expr: `(${a.expr}/${b.expr})`});
        if (Math.abs(a.value) > 1e-12) candidates.push({value: b.value / a.value, expr: `(${b.expr}/${a.expr})`});
        for (const candidate of candidates) rec([...rest, candidate]);
      }
    }
  }

  rec(items);
  return [...new Set(solutions)].slice(0, limit);
}

function render() {
  if (!state) return;
  $("cards").innerHTML = state.cards.map((card, idx) => renderCard(card, idx)).join("");
  $("cards").className = `cards card-table ${state.tableTheme || "felt-green"}`;
  $("status").textContent = state.message;
  $("status").classList.remove("success", "error");
  if (state.statusType) $("status").classList.add(state.statusType);
  document.body.classList.toggle("solved", state.correctExpressions.length > 0);
  wireCardButtons();
  renderExpression();
  renderSolutions();
  renderStats();
  $("logPath").textContent = `运行方式：静态离线页面；所有提交在浏览器内完成，不连接后台服务。`;
}

function renderCard(card, idx) {
  const red = card.suit === "♥" || card.suit === "♦";
  const rank = escapeHtml(card.rank);
  const suit = escapeHtml(card.suit);
  const isUsed = state && state.usedCardIndexes && state.usedCardIndexes.has(idx);
  const art = card.art && card.art.file
    ? `<img class="card-photo" src="${escapeHtml(card.art.file)}?v=20260624_v13" alt="家庭记忆牌面 ${escapeHtml(card.art.sourceName || card.label)}" onerror="this.closest('.card-photo-frame').classList.add('photo-missing')">`
    : `<div class="card-suit-big">${suit}</div>`;
  return `
    <button class="playing-card ${red ? "red" : "black"} ${isUsed ? "used" : ""}" type="button" data-card-index="${idx}" aria-label="选择 ${rank}${suit}" ${isUsed ? "disabled" : ""}>
      <div class="card-photo-frame">${art}</div>
      <div class="card-corner top">
        <div class="card-rank">${rank}</div>
        <div class="card-suit-small">${suit}</div>
      </div>
      <div class="card-corner bottom">
        <div class="card-rank">${rank}</div>
        <div class="card-suit-small">${suit}</div>
      </div>
    </button>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function startGame() {
  state = {
    roundNumber: 0,
    score: 0,
    streak: 0,
    bestTime: readBestTime(),
    lastReward: "--",
    roundStartedAt: Date.now(),
    roundSeconds: 0,
    attempts: 0,
    correctExpressions: [],
    firstSolvedSeconds: null,
    cards: [],
    solution: "",
    solutions: [],
    showSolutions: false,
    tableTheme: "felt-green",
    builderTokens: [],
    usedCardIndexes: new Set(),
    solved: false,
    revealed: false,
    message: "新局开始。连续答对会加速积分增长。",
    statusType: "",
  };
  nextRound();
}

function nextRound() {
  if (!state) return startGame();
  state.roundNumber += 1;
  state.cards = dealSolvableHand();
  state.solutions = solve24(state.cards.map((card) => card.value), 20);
  state.solution = state.solutions[0];
  state.showSolutions = false;
  state.tableTheme = TABLE_THEMES[(state.roundNumber - 1) % TABLE_THEMES.length];
  state.builderTokens = [];
  state.usedCardIndexes = new Set();
  state.solved = false;
  state.revealed = false;
  state.roundStartedAt = Date.now();
  state.roundSeconds = 0;
  state.attempts = 0;
  state.correctExpressions = [];
  state.firstSolvedSeconds = null;
  state.message = `第 ${state.roundNumber} 题：先看牌，再找 24 的结构。`;
  state.statusType = "";
  startRoundTimer();
  render();
  playDeal();
  startMusicLoop();
}

function submitAnswer() {
  if (!state) startGame();
  if (state.correctExpressions.length >= MAX_CORRECT_PER_ROUND) return setMessage("本题已经找到 3 种正确解法了，点“下一题 / 重新发牌”继续。", "success");
  if (state.revealed) return setMessage("已经揭晓答案，本题请点“下一题 / 重新发牌”。", "error");
  const expression = getInternalExpression();
  if (!expression) return setMessage("先点牌和符号，拼出一个算式。", "error");
  state.attempts += 1;
  const result = validateExpression(expression, state.cards.map((card) => card.value));
  if (!result.valid) {
    playWrong();
    setMessage(`错误：${result.message} ${pick(WRONG_MESSAGES)}`, "error");
    return;
  }
  const signature = canonicalExpression(expression);
  if (state.correctExpressions.includes(signature)) {
    playWrong();
    setMessage("这条解法已经提交过了。换一种括号、顺序或中间数，再试一次。", "error");
    clearExpression({silent: true});
    return;
  }
  const correctNumber = state.correctExpressions.length + 1;
  state.correctExpressions.push(signature);
  state.solved = true;
  state.showSolutions = true;
  if (correctNumber === 1) {
    state.firstSolvedSeconds = state.roundSeconds;
    const reward = computeReward(state.roundSeconds, state.streak + 1, state.attempts);
    state.streak += 1;
    state.score += reward.total;
    state.lastReward = `第 1 解 +${reward.total}（连胜 ${reward.streakPoints}，速度 ${reward.speedBonus}，一击 ${reward.firstTryBonus}）`;
    updateBestTime(state.roundSeconds);
    playCorrect(state.streak);
  } else {
    const extra = EXTRA_SOLUTION_REWARDS[correctNumber - 1] || 0;
    state.score += extra;
    state.lastReward = `第 ${correctNumber} 解 +${extra}`;
    playCorrect(state.streak + correctNumber);
  }
  const remaining = MAX_CORRECT_PER_ROUND - state.correctExpressions.length;
  clearExpression({silent: true});
  if (remaining > 0) {
    setMessage(`答对了！${state.lastReward}。再找 ${remaining} 种不同解法，还能继续加分。`, "success");
  } else {
    stopRoundTimer();
    setMessage(`本题完成：已找到 3 种解法。${state.lastReward}。点“下一题 / 重新发牌”。`, "success");
  }
}

function setMessage(message, statusType = "") {
  state.message = message;
  state.statusType = statusType;
  render();
}

function appendCard(index) {
  if (!state) startGame();
  if (state.revealed || state.correctExpressions.length >= MAX_CORRECT_PER_ROUND) return;
  if (state.usedCardIndexes.has(index)) return;
  const card = state.cards[index];
  state.usedCardIndexes.add(index);
  state.builderTokens.push({type: "card", index, value: card.value, label: card.rank});
  setMessage("已加入一张牌。继续点运算符或下一张牌。", "");
}

function appendOperator(op) {
  if (!state) startGame();
  if (state.revealed || state.correctExpressions.length >= MAX_CORRECT_PER_ROUND) return;
  const labelMap = {"*": "×", "/": "÷", "-": "−"};
  state.builderTokens.push({type: "op", value: op, label: labelMap[op] || op});
  setMessage("已加入运算符。", "");
  render();
}

function undoToken() {
  if (!state) startGame();
  const token = state.builderTokens.pop();
  if (token && token.type === "card") state.usedCardIndexes.delete(token.index);
  setMessage("已撤销一步。", "");
  render();
}

function clearExpression(options = {}) {
  if (!state) startGame();
  state.builderTokens = [];
  state.usedCardIndexes = new Set();
  if (!options.silent) setMessage("已清空算式。重新组合。", "");
  else render();
}

function getInternalExpression() {
  return state.builderTokens.map((token) => token.type === "card" ? String(token.value) : token.value).join("");
}

function getDisplayExpression() {
  return state.builderTokens.map((token) => token.label).join(" ");
}

function renderExpression() {
  const display = $("expressionDisplay");
  if (!display || !state) return;
  const text = getDisplayExpression();
  display.textContent = text || "点上面的牌和下面的符号";
  display.classList.toggle("empty", !text);
}

function renderStats() {
  if (!state) return;
  const score = $("score");
  const streak = $("streak");
  const roundTimer = $("roundTimer");
  const bestTime = $("bestTime");
  const lastReward = $("lastReward");
  if (score) score.textContent = String(state.score);
  if (streak) streak.textContent = String(state.streak);
  if (roundTimer) roundTimer.textContent = `${state.roundSeconds} 秒`;
  if (bestTime) bestTime.textContent = state.bestTime ? `${state.bestTime} 秒` : "--";
  if (lastReward) lastReward.textContent = state.lastReward || "--";
}

function wireCardButtons() {
  document.querySelectorAll("[data-card-index]").forEach((button) => {
    button.addEventListener("click", () => appendCard(Number(button.dataset.cardIndex)));
  });
}

function reveal() {
  if (!state) startGame();
  state.revealed = true;
  state.showSolutions = true;
  state.streak = 0;
  state.lastReward = "揭晓不加分，连胜归零";
  stopRoundTimer();
  playReveal();
  setMessage(`揭晓答案：${state.solution}。这题不加分，但可以学习下面的思路。`, "");
}

function renderSolutions() {
  const list = $("solutionList");
  const coach = $("coachPanel");
  if (!list || !state) return;
  if (!state.showSolutions) {
    list.innerHTML = `<li class="muted">先自己想。答对或揭晓后，这里会显示“不同思路”，雷同排列会自动合并。</li>`;
    if (coach) {
      coach.innerHTML = `
        <div class="coach-card">
          <strong>先找结构</strong>
          <span>常见目标：24×1、12×2、8×3、6×4。先用两张牌造这些中间数。</span>
        </div>
      `;
    }
    return;
  }
  if (coach) {
    coach.innerHTML = buildCoachInsights(state.cards.map((card) => card.value), state.solutions).map((item) => `
      <div class="coach-card">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.body)}</span>
      </div>
    `).join("");
  }
  const strategies = buildSolutionStrategies(state.solutions);
  list.innerHTML = strategies.slice(0, 12).map((strategy, idx) => {
    return `
      <li>
        <code>${escapeHtml(formatSolution(strategy.solution))}</code>
        <span><strong>${idx + 1}. ${escapeHtml(strategy.title)}</strong> · ${escapeHtml(strategy.body)}</span>
        ${strategy.mergedCount > 1 ? `<em>已合并 ${strategy.mergedCount} 个只是顺序不同的雷同答案。</em>` : ""}
      </li>
    `;
  }).join("");
}

function toggleSolutions() {
  if (!state) startGame();
  state.showSolutions = !state.showSolutions;
  render();
}

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function initAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  soundEnabled = true;
  const button = $("soundToggle");
  if (button) button.textContent = "音效已开";
  playDeal();
  startMusicLoop();
  return true;
}

function tone(freq, start, duration, type = "sine", gainValue = 0.07) {
  if (!soundEnabled || !audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime + start);
  gain.gain.setValueAtTime(0.0001, audioCtx.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(gainValue, audioCtx.currentTime + start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + start + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(audioCtx.currentTime + start);
  osc.stop(audioCtx.currentTime + start + duration + 0.02);
}

function playDeal() {
  tone(262, 0.00, 0.08, "triangle", 0.04);
  tone(330, 0.09, 0.08, "triangle", 0.04);
  tone(392, 0.18, 0.08, "triangle", 0.04);
  tone(523, 0.27, 0.12, "triangle", 0.045);
}

function playCorrect(streak = 1) {
  tone(523, 0.00, 0.10, "sine", 0.055);
  tone(659, 0.10, 0.12, "sine", 0.055);
  tone(784, 0.22, 0.16, "sine", 0.06);
  if (streak >= 3) {
    tone(988, 0.40, 0.12, "triangle", 0.04);
    tone(1175, 0.54, 0.14, "triangle", 0.04);
  }
}

function playWrong() {
  tone(196, 0.00, 0.11, "sawtooth", 0.05);
  tone(147, 0.12, 0.15, "sawtooth", 0.04);
}

function playReveal() {
  tone(392, 0.00, 0.08, "triangle", 0.035);
  tone(330, 0.10, 0.12, "triangle", 0.035);
}

function playEnd() {
  tone(330, 0.00, 0.08, "sine", 0.04);
  tone(440, 0.10, 0.08, "sine", 0.04);
  tone(554, 0.20, 0.16, "sine", 0.045);
}

function playTick(critical = false) {
  tone(critical ? 880 : 620, 0.0, critical ? 0.045 : 0.035, "square", critical ? 0.028 : 0.016);
}

function playFocusMotif() {
  if (!state || state.revealed || state.correctExpressions.length >= MAX_CORRECT_PER_ROUND) return;
  const urgent = state.roundSeconds >= 45;
  tone(urgent ? 440 : 294, 0.00, 0.05, "triangle", urgent ? 0.035 : 0.022);
  tone(urgent ? 523 : 330, 0.13, 0.05, "triangle", urgent ? 0.035 : 0.022);
}

function startMusicLoop() {
  if (!soundEnabled || !audioCtx || musicHandle || !state || state.revealed) return;
  playFocusMotif();
  musicHandle = setInterval(playFocusMotif, 5200);
}

function stopMusicLoop() {
  if (musicHandle) {
    clearInterval(musicHandle);
    musicHandle = null;
  }
}

function computeReward(seconds, streak, attempts) {
  const streakTable = [0, 1, 3, 5, 8, 13];
  const streakPoints = streakTable[Math.min(streak, streakTable.length - 1)];
  const speedBonus = seconds <= 15 ? 5 : seconds <= 30 ? 3 : seconds <= 60 ? 1 : 0;
  const firstTryBonus = attempts === 1 ? 2 : 0;
  return {
    total: streakPoints + speedBonus + firstTryBonus,
    streakPoints,
    speedBonus,
    firstTryBonus,
  };
}

function canonicalExpression(expression) {
  try {
    return tokenize(normalizeExpression(expression)).map((token) => {
      if (token.type === "number") return String(token.value);
      return token.type;
    }).join("");
  } catch {
    return String(expression).replace(/\s+/g, "");
  }
}

function startRoundTimer() {
  stopRoundTimer();
  timerHandle = setInterval(() => {
    if (!state || state.revealed || state.correctExpressions.length >= MAX_CORRECT_PER_ROUND) return;
    state.roundSeconds = Math.max(0, Math.floor((Date.now() - state.roundStartedAt) / 1000));
    renderStats();
  }, 1000);
}

function stopRoundTimer() {
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
  stopMusicLoop();
}

function readBestTime() {
  try {
    const raw = localStorage.getItem(BEST_TIME_KEY);
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function updateBestTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return;
  if (!state.bestTime || seconds < state.bestTime) {
    state.bestTime = seconds;
    try {
      localStorage.setItem(BEST_TIME_KEY, String(seconds));
    } catch {
      // Local storage may be unavailable in strict browser modes; gameplay should continue.
    }
  }
}

function formatSolution(solution) {
  return solution.replaceAll("*", "×").replaceAll("/", "÷");
}

function buildCoachInsights(values, solutions) {
  const sorted = [...values].sort((a, b) => a - b);
  const cards = sorted.join(", ");
  const strategies = buildSolutionStrategies(solutions);
  const mergedCount = Math.max(0, solutions.length - strategies.length);
  const pairHints = findPairHints(values).slice(0, 3);
  const items = [
    {
      title: "本题牌值",
      body: `牌值是 ${cards}。先别急着算，先想能不能做出 1、2、3、4、6、8、12。`,
    },
  ];
  if (pairHints.length) {
    items.push({
      title: "可以先盯住的中间数",
      body: pairHints.join("；"),
    });
  }
  items.push({
    title: "真正不同的思路",
    body: `机器找到 ${solutions.length} 条候选式，合并雷同排列后是 ${strategies.length} 种思路。${mergedCount ? `有 ${mergedCount} 条只是交换顺序，不单独算启发。` : "这些路径结构差异较明显。"}`,
  });
  items.push({
    title: "进阶模式说明",
    body: "当前家庭基础局只判定加减乘除和括号。开方、幂等可以做以后进阶模式，但不能混进本局计分规则。",
  });
  return items;
}

function buildSolutionStrategies(solutions) {
  const groups = new Map();
  for (const solution of solutions) {
    const ast = parseSolutionAst(solution);
    if (!ast) continue;
    const key = canonicalAst(ast);
    const summary = summarizeStrategy(ast);
    if (!groups.has(key)) {
      groups.set(key, {
        solution,
        key,
        title: summary.title,
        body: summary.body,
        mergedCount: 1,
      });
    } else {
      groups.get(key).mergedCount += 1;
    }
  }
  return [...groups.values()].sort((a, b) => {
    if (b.mergedCount !== a.mergedCount) return b.mergedCount - a.mergedCount;
    return a.solution.length - b.solution.length;
  });
}

function parseSolutionAst(solution) {
  try {
    const tokens = tokenize(normalizeExpression(solution));
    const parser = new AstParser(tokens);
    const ast = parser.parseExpression();
    if (!parser.atEnd()) return null;
    return ast;
  } catch {
    return null;
  }
}

class AstParser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }
  atEnd() {
    return this.pos >= this.tokens.length;
  }
  peek() {
    return this.tokens[this.pos];
  }
  match(type) {
    if (this.peek() && this.peek().type === type) {
      this.pos += 1;
      return true;
    }
    return false;
  }
  parseExpression() {
    let node = this.parseTerm();
    while (true) {
      if (this.match("+")) node = {op: "+", left: node, right: this.parseTerm()};
      else if (this.match("-")) node = {op: "-", left: node, right: this.parseTerm()};
      else break;
    }
    return node;
  }
  parseTerm() {
    let node = this.parseFactor();
    while (true) {
      if (this.match("*")) node = {op: "*", left: node, right: this.parseFactor()};
      else if (this.match("/")) node = {op: "/", left: node, right: this.parseFactor()};
      else break;
    }
    return node;
  }
  parseFactor() {
    if (this.match("(")) {
      const node = this.parseExpression();
      if (!this.match(")")) throw new Error("缺少右括号 )。");
      return node;
    }
    const token = this.peek();
    if (token && token.type === "number") {
      this.pos += 1;
      return {value: token.value};
    }
    throw new Error("这里需要一个数字或左括号。");
  }
}

function canonicalAst(node) {
  if ("value" in node) return `n${node.value}`;
  const left = canonicalAst(node.left);
  const right = canonicalAst(node.right);
  if (node.op === "+" || node.op === "*") {
    return `${node.op}(${[left, right].sort().join(",")})`;
  }
  return `${node.op}(${left},${right})`;
}

function evalAst(node) {
  if ("value" in node) return node.value;
  const left = evalAst(node.left);
  const right = evalAst(node.right);
  if (node.op === "+") return left + right;
  if (node.op === "-") return left - right;
  if (node.op === "*") return left * right;
  if (node.op === "/") return left / right;
  return NaN;
}

function astToString(node) {
  if ("value" in node) return String(node.value);
  return `(${astToString(node.left)}${node.op}${astToString(node.right)})`;
}

function summarizeStrategy(ast) {
  const rootValue = evalAst(ast);
  const steps = collectIntermediateSteps(ast).filter((step) => Math.abs(step.value - rootValue) > 1e-9);
  const firstSteps = steps.slice(0, 2).map((step) => `${formatSolution(step.expr)}=${formatNumber(step.value)}`);
  if (ast.op === "*") {
    const left = evalAst(ast.left);
    const right = evalAst(ast.right);
    return {
      title: `乘法结构：${formatNumber(left)} × ${formatNumber(right)}`,
      body: `${firstSteps.length ? `先做 ${firstSteps.join("，再做 ")}，` : ""}最后相乘得到 24。重点是看见可配对的因子，不是交换前后顺序。`,
    };
  }
  if (ast.op === "/") {
    const left = evalAst(ast.left);
    const right = evalAst(ast.right);
    return {
      title: `除法结构：${formatNumber(left)} ÷ ${formatNumber(right)}`,
      body: `${firstSteps.length ? `先做 ${firstSteps.join("，再做 ")}，` : ""}最后用比例关系得到 24。`,
    };
  }
  if (ast.op === "+") {
    return {
      title: "加法收尾",
      body: `${firstSteps.length ? `先做 ${firstSteps.join("，再做 ")}，` : ""}最后靠两部分相加到 24。`,
    };
  }
  if (ast.op === "-") {
    return {
      title: "减法收尾",
      body: `${firstSteps.length ? `先做 ${firstSteps.join("，再做 ")}，` : ""}最后靠差值到 24。`,
    };
  }
  return {title: "可行路径", body: "这是一条可行路径。"};
}

function collectIntermediateSteps(node) {
  if ("value" in node) return [];
  return [
    ...collectIntermediateSteps(node.left),
    ...collectIntermediateSteps(node.right),
    {expr: astToString(node), value: evalAst(node)},
  ];
}

function formatNumber(value) {
  if (Math.abs(value - Math.round(value)) < 1e-9) return String(Math.round(value));
  return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function findPairHints(values) {
  const useful = new Set([1, 2, 3, 4, 6, 8, 12, 24]);
  const hints = [];
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      const a = values[i];
      const b = values[j];
      const candidates = [
        [`${a}+${b}`, a + b],
        [`${Math.max(a, b)}-${Math.min(a, b)}`, Math.abs(a - b)],
        [`${a}×${b}`, a * b],
      ];
      if (b !== 0 && Number.isInteger((a / b) * 1000)) candidates.push([`${a}÷${b}`, a / b]);
      if (a !== 0 && Number.isInteger((b / a) * 1000)) candidates.push([`${b}÷${a}`, b / a]);
      for (const [expr, value] of candidates) {
        if (useful.has(value)) hints.push(`${expr} = ${value}`);
      }
    }
  }
  return [...new Set(hints)];
}

function validateExpression(expression, cardValues) {
  if (!expression) return {valid: false, message: "请输入表达式。"};
  let tokens;
  try {
    tokens = tokenize(normalizeExpression(expression));
  } catch (err) {
    return {valid: false, message: err.message};
  }

  const usedNumbers = tokens.filter((token) => token.type === "number").map((token) => token.value);
  if (!sameMultiset(usedNumbers, cardValues)) {
    return {valid: false, message: `必须正好使用四张牌的数值各一次。你用了 ${usedNumbers.join(", ")}；本轮牌值是 ${cardValues.join(", ")}。`};
  }

  try {
    const parser = new Parser(tokens);
    const value = parser.parseExpression();
    if (!parser.atEnd()) return {valid: false, message: "表达式后面还有无法识别的内容。"};
    if (Math.abs(value - TARGET) > 1e-9) {
      const pretty = Number.isInteger(value) ? String(value) : value.toPrecision(8);
      return {valid: false, message: `算出来是 ${pretty}，不是 24。连续除法按从左到右算，例如 1/8/(4-1) = (1/8)/3。`};
    }
    return {valid: true, message: "正确。"};
  } catch (err) {
    return {valid: false, message: err.message};
  }
}

function normalizeExpression(input) {
  let output = String(input)
    .replace(/[０-９]/g, (ch) => String(ch.charCodeAt(0) - "０".charCodeAt(0)))
    .replace(/[（〔［｛【]/g, "(")
    .replace(/[）〕］｝】]/g, ")")
    .replace(/[×xX＊]/g, "*")
    .replace(/[÷／]/g, "/")
    .replace(/[＋]/g, "+")
    .replace(/[－—–]/g, "-");

  let balance = 0;
  let fixed = "";
  for (const ch of output) {
    if (ch === "(") balance += 1;
    if (ch === ")") {
      if (balance === 0) continue;
      balance -= 1;
    }
    fixed += ch;
  }
  if (balance > 0) fixed += ")".repeat(balance);
  return fixed;
}

function tokenize(input) {
  const tokens = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if ("+-*/()".includes(ch)) {
      tokens.push({type: ch, text: ch});
      i += 1;
      continue;
    }
    if (/\d/.test(ch)) {
      let j = i + 1;
      while (j < input.length && /\d/.test(input[j])) j += 1;
      const value = Number(input.slice(i, j));
      if (!Number.isInteger(value) || value < 1 || value > 13) throw new Error("只能输入 1 到 13 的整数牌值。");
      tokens.push({type: "number", value});
      i = j;
      continue;
    }
    throw new Error(`不支持的字符：${ch}。乘号请用 *，除号请用 /。`);
  }
  return tokens;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }
  atEnd() {
    return this.pos >= this.tokens.length;
  }
  peek() {
    return this.tokens[this.pos];
  }
  match(type) {
    if (this.peek() && this.peek().type === type) {
      this.pos += 1;
      return true;
    }
    return false;
  }
  parseExpression() {
    let value = this.parseTerm();
    while (true) {
      if (this.match("+")) value += this.parseTerm();
      else if (this.match("-")) value -= this.parseTerm();
      else break;
    }
    return value;
  }
  parseTerm() {
    let value = this.parseFactor();
    while (true) {
      if (this.match("*")) value *= this.parseFactor();
      else if (this.match("/")) {
        const right = this.parseFactor();
        if (Math.abs(right) < 1e-12) throw new Error("不能除以 0。");
        value /= right;
      } else break;
    }
    return value;
  }
  parseFactor() {
    if (this.match("(")) {
      const value = this.parseExpression();
      if (!this.match(")")) throw new Error("缺少右括号 )。");
      return value;
    }
    const token = this.peek();
    if (token && token.type === "number") {
      this.pos += 1;
      return token.value;
    }
    throw new Error("这里需要一个数字或左括号。");
  }
}

function sameMultiset(a, b) {
  const aa = [...a].sort((x, y) => x - y).join(",");
  const bb = [...b].sort((x, y) => x - y).join(",");
  return aa === bb;
}

function wire(id, handler) {
  $(id).addEventListener("click", () => {
    try {
      handler();
    } catch (err) {
      if (!state) {
        $("status").textContent = `错误：${err.message}`;
      } else {
        setMessage(`错误：${err.message}`, "error");
      }
    }
  });
}

wire("start", nextRound);
wire("submitAnswer", submitAnswer);
wire("undo", undoToken);
wire("clear", clearExpression);
wire("reveal", reveal);
if ($("soundToggle")) wire("soundToggle", initAudio);
if ($("toggleSolutions")) wire("toggleSolutions", toggleSolutions);
document.querySelectorAll("[data-op]").forEach((button) => {
  button.addEventListener("click", () => appendOperator(button.dataset.op));
});

window.__24DUCK_TEST__ = {
  startGame,
  appendCard,
  appendOperator,
  undoToken,
  clearExpression,
  submitAnswer,
  getInternalExpression,
  getDisplayExpression,
  getState: () => state,
  validateExpression,
  solve24,
  buildDeck,
  hasUniqueCardArt,
  computeReward,
  buildCoachInsights,
  buildSolutionStrategies,
  canonicalExpression,
  getMaxCorrectPerRound: () => MAX_CORRECT_PER_ROUND,
  startMusicLoop,
  stopMusicLoop,
};

startGame();
