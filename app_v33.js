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
const BRUTEFORCE_CATALOG = window.TWENTY_FOUR_BRUTEFORCE_CATALOG || null;
const BRUTEFORCE_ENTRIES = BRUTEFORCE_CATALOG && Array.isArray(BRUTEFORCE_CATALOG.entries) ? window.TWENTY_FOUR_BRUTEFORCE_CATALOG.entries : [];
const BRUTEFORCE_MAP = new Map(BRUTEFORCE_ENTRIES.map((entry) => [entry.k, entry]));
const ENCOURAGEMENTS = [
  "漂亮！这就是把复杂问题拆成小块。",
  "好牌感：先找结构，再做计算。",
  "答对了。这个组合路径值得记住。",
  "优秀，简单规则里真的会长出复杂变化。",
  "你抓到了关键中间数。把这条路迁移到下一题。",
];
const WRONG_MESSAGES = [
  "先别急，看看是不是用了四张牌各一次。",
  "这一步接近了，试试先造 3、4、6、8、12 这些中间数。",
  "换个括号位置再试，24 点经常输在运算顺序。",
  "错了不扣分。错误不是失败，是帮你排除一条路。",
];
const BEST_TIME_KEY = "twenty_four_duck_best_time_seconds_v1";
const LEARNING_LEDGER_KEY = "twenty_four_duck_learning_ledger_v1";
const QUICK_START_KEY = "twenty_four_duck_quick_start_dismissed_v1";
const EXTRA_SOLUTION_REWARDS = [0, 3, 5];
const MAX_CORRECT_PER_ROUND = 3;
const NEW_STRATEGY_FAMILY_BONUS = 6;
const REPEATED_STRATEGY_REWARD = 2;
const HINT_PENALTY = 1;
const ROUTE_BONUS = 2;
const ROUTE_CHOICES = [
  {id: "12x2", label: "12×2", family: "12x2"},
  {id: "8x3", label: "8×3", family: "8x3"},
  {id: "6x4", label: "6×4", family: "6x4"},
  {id: "24x1", label: "24×1", family: "24x1"},
  {id: "fraction", label: "分数桥", family: "fraction"},
  {id: "subtract", label: "差值桥", family: "subtract"},
  {id: "no_solution", label: "判断无解", family: "no_solution"},
];
const STRATEGY_RARITIES = {
  common: {label: "普通策略", note: "先把这条稳定路线练熟。"},
  uncommon: {label: "进阶策略", note: "你开始看结构，不只是硬算。"},
  rare: {label: "稀有策略", note: "出现了可迁移的新路径，值得复盘。"},
  epic: {label: "史诗策略", note: "速度、独立性和结构判断同时在线。"},
  legendary: {label: "传说洞察", note: "你发现的不是答案，而是一种方法。"},
};

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

function dealSolvableHand(mode = "balanced") {
  const deck = buildDeck();
  const selectedEntry = selectCatalogEntry(mode);
  if (selectedEntry) {
    const ranks = selectedEntry.k.split(",").map(Number);
    for (let attempt = 0; attempt < 300; attempt++) {
      const hand = dealHandForRanks(deck, ranks);
      if (hand && hasUniqueCardArt(hand)) return {hand, entry: selectedEntry};
    }
  }
  for (let attempt = 0; attempt < 10000; attempt++) {
    const hand = shuffle(deck).slice(0, 4);
    if (!hasUniqueCardArt(hand)) continue;
    if (solve24(hand.map((card) => card.value), 1).length > 0) {
      return {hand, entry: getCatalogEntryForValues(hand.map((card) => card.value))};
    }
  }
  throw new Error("无法发出可解牌，请重试。");
}

function dealTrainingHand(mode = "balanced") {
  const deck = buildDeck();
  const selectedEntry = selectRoundEntry(mode);
  if (selectedEntry) {
    const ranks = selectedEntry.k.split(",").map(Number);
    for (let attempt = 0; attempt < 300; attempt++) {
      const hand = dealHandForRanks(deck, ranks);
      if (hand && hasUniqueCardArt(hand)) return {hand, entry: selectedEntry};
    }
  }
  return dealSolvableHand(mode);
}

function selectRoundEntry(mode = "balanced") {
  if ((mode === "hard" || mode === "expert") && Math.random() < 0.3) {
    const dead = BRUTEFORCE_ENTRIES.filter((entry) => entry.s === 0 || entry.d === "dead");
    if (dead.length) return dead[Math.floor(Math.random() * dead.length)];
  }
  return selectCatalogEntry(mode);
}

function selectCatalogEntry(mode = "balanced") {
  const solvable = BRUTEFORCE_ENTRIES.filter((entry) => entry.s > 0);
  if (!solvable.length) return null;
  let pool = solvable;
  if (mode && mode !== "balanced") {
    pool = solvable.filter((entry) => entry.d === mode);
  } else {
    const rotation = ["easy", "medium", "hard", "expert"];
    const idx = state ? Math.max(0, state.roundNumber - 1) % rotation.length : Math.floor(Math.random() * rotation.length);
    pool = solvable.filter((entry) => entry.d === rotation[idx]);
  }
  if (!pool.length) pool = solvable;
  return pool[Math.floor(Math.random() * pool.length)];
}

function dealHandForRanks(deck, ranks) {
  const available = new Map();
  for (const card of shuffle(deck)) {
    if (!available.has(card.value)) available.set(card.value, []);
    available.get(card.value).push(card);
  }
  const hand = [];
  for (const rank of shuffle(ranks)) {
    const options = available.get(rank) || [];
    const picked = options.shift();
    if (!picked) return null;
    hand.push(picked);
  }
  return hand;
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
  renderReviewCard();
  renderMissionStrip();
  renderLearningFeedback();
  renderExpressionDiagnosis();
  renderPracticePrescription();
  renderIterationCoach();
  renderQuickStart();
  renderRouteOptions();
  renderGameLoopCoach();
  renderStats();
  $("logPath").textContent = `运行方式：静态离线页面；所有提交在浏览器内完成，不连接后台服务。`;
}

function renderCard(card, idx) {
  const red = card.suit === "♥" || card.suit === "♦";
  const rank = escapeHtml(card.rank);
  const suit = escapeHtml(card.suit);
  const isUsed = state && state.usedCardIndexes && state.usedCardIndexes.has(idx);
  const art = card.art && card.art.file
    ? `<img class="card-photo" src="${escapeHtml(card.art.file)}?v=20260625_v14" alt="家庭记忆牌面 ${escapeHtml(card.art.sourceName || card.label)}" onerror="this.closest('.card-photo-frame').classList.add('photo-missing')">`
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
    hintLevel: 0,
    hintsUsed: 0,
    correctExpressions: [],
    correctFamilies: [],
    firstSolvedSeconds: null,
    cards: [],
    solution: "",
    solutions: [],
    showSolutions: false,
    tableTheme: "felt-green",
    trainingMode: currentTrainingMode(),
    catalogEntry: null,
    builderTokens: [],
	    usedCardIndexes: new Set(),
	    solved: false,
	    revealed: false,
      predictedRoute: null,
	    learningFeedback: null,
	    expressionDiagnosis: null,
	    practicePrescription: null,
	    iterationCoach: null,
      questCard: null,
      strategyDrop: null,
	    message: "新局开始。先观察，再动手；先找中间数，再拼 24。",
    statusType: "",
  };
  nextRound();
}

function nextRound() {
  if (!state) return startGame();
  state.roundNumber += 1;
  state.trainingMode = currentTrainingMode();
  const dealt = dealTrainingHand(state.trainingMode);
  state.cards = dealt.hand;
  state.solutions = solve24(state.cards.map((card) => card.value), 20);
  state.catalogEntry = dealt.entry || getCatalogEntryForValues(state.cards.map((card) => card.value));
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
  state.hintLevel = 0;
  state.hintsUsed = 0;
  state.correctExpressions = [];
  state.correctFamilies = [];
  state.firstSolvedSeconds = null;
  state.noSolutionClaims = 0;
  state.predictedRoute = null;
  state.questCard = buildQuestCard(state.catalogEntry, state.cards.map((card) => card.value));
  state.strategyDrop = {
    rarity: "common",
    title: "等待策略掉落",
    body: "先侦察牌面，再建造路线，最后用算式验证。答对后会沉淀一个策略。",
  };
		  state.learningFeedback = {
		    tone: "neutral",
		    title: "先观察 30 秒",
		    body: "先别急着点击。看四张牌能不能造出 12、8、6、4、3、2、1。",
		    action: "目标：先说出一个可能的中间数，再开始点牌。",
		  };
  state.expressionDiagnosis = null;
		  state.practicePrescription = {
		    title: "本题先做观察训练",
		    body: "不要急着点。先在心里说出一个目标结构：12×2、8×3、6×4 或 24×1。",
		    metric: "依据：新题开始，先建立观察习惯。",
	    recommendedMode: state.trainingMode || "balanced",
	    focus: "先观察，再动手。",
		  };
  state.iterationCoach = {
    keep: "保留：先看四张牌，不急着乱点。",
    improve: "改进：本题只先找一个中间数，比如 12、8、6、4、3、2 或 1。",
  };
  state.message = `第 ${state.roundNumber} 题：${describeDifficulty(state.catalogEntry && state.catalogEntry.d)}。${difficultyAdvice(state.catalogEntry && state.catalogEntry.d)}`;
  state.statusType = "";
  startRoundTimer();
  render();
  playDeal();
  startMusicLoop();
}

function claimNoSolution() {
  if (!state) startGame();
  if (state.revealed || state.correctExpressions.length >= MAX_CORRECT_PER_ROUND) {
    return setMessage("本题已经进入复盘阶段。点“下一题”继续。", "");
  }
  state.noSolutionClaims = (state.noSolutionClaims || 0) + 1;
  state.attempts += 1;
  const solutionCount = getCurrentSolutionCount();
  state.showSolutions = true;
  state.revealed = true;
  stopRoundTimer();

  if (solutionCount === 0) {
    const routeMatched = state.predictedRoute === "no_solution";
    const routeBonus = routeMatched ? ROUTE_BONUS : 0;
    const reward = Math.max(3, 8 - Math.min(4, state.hintsUsed)) + routeBonus;
    state.score += reward;
    state.lastReward = routeMatched ? `无解判断 +${reward}（路线 +${routeBonus}）` : `无解判断 +${reward}`;
    updateLearningLedger({
      type: "no_solution",
      family: "no_solution",
      seconds: state.roundSeconds,
      attempts: state.attempts,
      hintsUsed: state.hintsUsed,
      difficulty: state.catalogEntry ? state.catalogEntry.d : "dead",
      reward,
      predictedRoute: state.predictedRoute || "none",
    });
    setLearningFeedback({
      tone: "success",
      title: "无解判断正确",
      body: routeMatched ? "你先判断无解，再被机器枚举验证。这是先提出假设、再验证假设。" : "这不是放弃，而是数学里的重要能力：知道什么时候应该证明不存在。",
      action: routeMatched ? "路线判断命中。下一步说出：你排除了哪些目标因子？" : "下一步复盘：你是怎么判断没有 24 的？把反证路径说出来。",
    });
    setExpressionDiagnosis({
      tone: "success",
      expression: "我认为无解",
      value: "机器枚举确认：没有 24",
      cards: "四张牌仍然各用一次，只是在四则运算规则下无解。",
      next: "好判断。下一题继续先观察，再决定是构造解还是证明无解。",
    });
    setPracticePrescription({
      title: "下一步：练可解 / 无解分辨",
      body: "不是每题都要硬凑答案。高手训练包括发现结构，也包括识别结构不存在。",
      metric: `依据：本题 ${solutionCount} 条解法，判断正确；先选路线：${describePredictedRoute()}。`,
      recommendedMode: "hard",
      focus: "挑战题，练判断。",
    });
    setIterationCoach({
      keep: routeMatched ? "保留：你先提出“可能无解”的路线，再让机器验证。" : "保留：你没有盲目试算，而是提出了一个可验证判断。",
      improve: "改进：下次说出一个反证理由，比如所有路径都无法造出 12×2、8×3、6×4。",
    });
    setStrategyDrop(buildStrategyDrop("no_solution", {
      family: "no_solution",
      routeMatched,
      isNewFamily: true,
      seconds: state.roundSeconds,
      attempts: state.attempts,
      hintsUsed: state.hintsUsed,
    }));
    playCorrect(state.streak + 1);
    return setMessage(`判断正确：本题无解。${state.lastReward}。`, "success");
  }

  state.streak = 0;
  state.lastReward = "误判无解不加分，连胜归零";
  setLearningFeedback({
    tone: "wrong",
    title: "这题其实有解",
    body: `你判断无解，但机器枚举发现 ${solutionCount} 条候选式。这个反馈比直接看答案更有价值。`,
    action: state.predictedRoute === "no_solution" ? "你的路线判断没命中。先看第一条结构，再问：漏掉了哪个中间数？" : "先看第一条结构，再问：我刚才漏看了哪个中间数？",
  });
  setExpressionDiagnosis({
    tone: "wrong",
    expression: "我认为无解",
    value: `其实有解：${solutionCount} 条候选式`,
    cards: "牌面没有问题，问题在于某个中间数被漏掉了。",
    next: `先看一个方向：${state.solution ? formatSolution(state.solution) : "看数学教练解法"}。`,
  });
  setPracticePrescription({
    title: "下一步：找漏掉的中间数",
    body: "误判无解很正常。训练价值在于复盘：是漏了差值、括号、分数桥，还是乘法目标？",
    metric: `依据：本题实际有 ${solutionCount} 条候选式。`,
    recommendedMode: state.trainingMode || "balanced",
    focus: "先复盘，再进入下一题。",
  });
  setIterationCoach({
    keep: "保留：你敢做判断，这是数学训练里重要的一步。",
    improve: `改进：判断无解前，至少检查 24×1、12×2、8×3、6×4 四个入口。你本题先选路线：${describePredictedRoute()}。`,
  });
  setStrategyDrop({
    rarity: "common",
    title: "经验碎片：漏看中间数",
    body: "误判无解不是失败。它暴露了一个漏掉的结构，下一题先补这块。",
  });
  playReveal();
  openPanel("coachSection");
  setMessage(`这题其实有解：共 ${solutionCount} 条候选式。先看教练解法，再点“下一题”。`, "error");
}

function submitAnswer() {
  if (!state) startGame();
  if (state.correctExpressions.length >= MAX_CORRECT_PER_ROUND) return setMessage("本题已经找到 3 种正确解法了，点“下一题 / 重新发牌”继续。", "success");
  if (state.revealed) return setMessage("已经揭晓答案，本题请点“下一题 / 重新发牌”。", "error");
  const expression = getInternalExpression();
  if (!expression) {
    setExpressionDiagnosis(buildExpressionDiagnosis("", {valid: false, message: "还没有算式。", usedNumbers: [], expectedNumbers: state.cards.map((card) => card.value), cardCheck: false}));
    return setMessage("先点牌和符号，拼出一个算式。", "error");
  }
  state.attempts += 1;
  const result = validateExpression(expression, state.cards.map((card) => card.value));
  setExpressionDiagnosis(buildExpressionDiagnosis(expression, result));
	  if (!result.valid) {
	    playWrong();
	    setLearningFeedback(buildMistakeFeedback(result.message, expression));
	    setPracticePrescription(buildPracticePrescription("mistake"));
    setIterationCoach(buildIterationCoach("mistake", {message: result.message, expression}));
    setStrategyDrop({
      rarity: "common",
      title: "经验碎片：错误分类",
      body: "错误已经被分类。先修一个问题：用牌、括号、目标因子或运算顺序。",
    });
	    setMessage(`错误：${result.message} ${pick(WRONG_MESSAGES)}`, "error");
	    return;
	  }
  const signature = canonicalExpression(expression);
  if (state.correctExpressions.includes(signature)) {
    playWrong();
	    setLearningFeedback({
	      tone: "wrong",
      title: "这条路已经走过",
      body: "只是交换顺序或括号相同的路径，对人类启发不大。",
	      action: "换一个目标：试试 12×2、8×3、6×4 或 24×1 里的另一类结构。",
		    });
	    setPracticePrescription(buildPracticePrescription("repeated"));
    setIterationCoach(buildIterationCoach("repeated", {expression}));
    setStrategyDrop({
      rarity: "common",
      title: "经验碎片：雷同路径",
      body: "换顺序不等于新策略。下一次要换目标因子或中间数。",
    });
	    setMessage("这条解法已经提交过了。换一种括号、顺序或中间数，再试一次。", "error");
    clearExpression({silent: true});
    return;
  }
  const submittedStrategy = summarizeSubmittedExpression(expression);
  const isNewFamily = submittedStrategy && !state.correctFamilies.includes(submittedStrategy.family);
  const routeMatched = routeMatchesStrategy(state.predictedRoute, submittedStrategy);
  const routeBonus = routeMatched ? ROUTE_BONUS : 0;
  const correctNumber = state.correctExpressions.length + 1;
  state.correctExpressions.push(signature);
  if (isNewFamily) state.correctFamilies.push(submittedStrategy.family);
  state.solved = true;
  state.showSolutions = true;
  if (correctNumber === 1) {
    state.firstSolvedSeconds = state.roundSeconds;
    const reward = computeReward(state.roundSeconds, state.streak + 1, state.attempts, state.hintsUsed);
    const depthBonus = isNewFamily ? NEW_STRATEGY_FAMILY_BONUS : 0;
    state.streak += 1;
    state.score += reward.total + depthBonus + routeBonus;
    state.lastReward = `第 1 解 +${reward.total + depthBonus + routeBonus}（基础 ${reward.total}，策略 ${depthBonus}，路线 ${routeBonus}）`;
    updateBestTime(state.roundSeconds);
	    updateLearningLedger({
	      type: "solve",
      family: submittedStrategy ? submittedStrategy.family : "unknown",
      seconds: state.roundSeconds,
      attempts: state.attempts,
      hintsUsed: state.hintsUsed,
      difficulty: state.catalogEntry ? state.catalogEntry.d : "unknown",
	      reward: reward.total + depthBonus + routeBonus,
      predictedRoute: state.predictedRoute || "none",
    });
    dismissQuickStart({silent: true});
		    setLearningFeedback({
	      tone: "success",
      title: "第一解成立",
      body: "答对只是开始。现在进入更高价值的训练：找不同结构，而不是换顺序。",
	      action: routeMatched ? "路线判断命中。继续找第二种结构，看看能不能迁移。" : (state.predictedRoute ? "答对了，但路线和实际结构不同。复盘这个差异，比答案本身更有价值。" : "下题先选路线，再点击验证。"),
		    });
    setExpressionDiagnosis(buildExpressionDiagnosis(expression, {...result, strategy: submittedStrategy}));
		    setPracticePrescription(buildPracticePrescription("first_correct"));
    setIterationCoach(buildIterationCoach("first_correct", {strategy: submittedStrategy, routeMatched, predictedRoute: state.predictedRoute}));
    setStrategyDrop(buildStrategyDrop("first_correct", {
      family: submittedStrategy ? submittedStrategy.family : "unknown",
      routeMatched,
      isNewFamily,
      seconds: state.roundSeconds,
      attempts: state.attempts,
      hintsUsed: state.hintsUsed,
    }));
	    playCorrect(state.streak);
	  } else {
    const extra = isNewFamily ? NEW_STRATEGY_FAMILY_BONUS : (EXTRA_SOLUTION_REWARDS[correctNumber - 1] || REPEATED_STRATEGY_REWARD);
    state.score += extra;
    state.lastReward = isNewFamily ? `新策略族 +${extra}` : `同策略练习 +${extra}`;
    updateLearningLedger({
      type: "extra_solution",
      family: submittedStrategy ? submittedStrategy.family : "unknown",
      seconds: state.roundSeconds,
      attempts: state.attempts,
      hintsUsed: state.hintsUsed,
      difficulty: state.catalogEntry ? state.catalogEntry.d : "unknown",
      reward: extra,
      predictedRoute: state.predictedRoute || "none",
    });
		    setLearningFeedback({
	      tone: "success",
      title: isNewFamily ? "新策略族出现" : "同策略练习完成",
      body: isNewFamily ? "你不是只会一种路，而是在建立可迁移的策略库。" : "这条路径有练习价值，但下一步要寻找真正不同的结构。",
	      action: "挑战自己：用另一种目标因子重做一次。",
		    });
    setExpressionDiagnosis(buildExpressionDiagnosis(expression, {...result, strategy: submittedStrategy}));
		    setPracticePrescription(buildPracticePrescription(isNewFamily ? "new_family" : "extra_solution"));
    setIterationCoach(buildIterationCoach(isNewFamily ? "new_family" : "extra_solution", {strategy: submittedStrategy, routeMatched, predictedRoute: state.predictedRoute}));
    setStrategyDrop(buildStrategyDrop(isNewFamily ? "new_family" : "extra_solution", {
      family: submittedStrategy ? submittedStrategy.family : "unknown",
      routeMatched,
      isNewFamily,
      seconds: state.roundSeconds,
      attempts: state.attempts,
      hintsUsed: state.hintsUsed,
    }));
	    playCorrect(state.streak + correctNumber);
  }
  const remaining = MAX_CORRECT_PER_ROUND - state.correctExpressions.length;
  clearExpression({silent: true});
  if (remaining > 0) {
    const familyText = submittedStrategy ? `本次属于：${submittedStrategy.title}。` : "";
    setMessage(`答对了！${state.lastReward}。${familyText} 再找 ${remaining} 种不同结构，还能继续加分。`, "success");
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

function routeChoiceById(routeId) {
  return ROUTE_CHOICES.find((route) => route.id === routeId) || null;
}

function describePredictedRoute() {
  const route = routeChoiceById(state && state.predictedRoute);
  return route ? route.label : "还没有先选路线";
}

function routeMatchesStrategy(routeId, strategy) {
  const route = routeChoiceById(routeId);
  if (!route || !strategy) return false;
  return route.family === strategy.family;
}

function renderRouteOptions() {
  const root = $("routeOptions");
  if (!root || typeof root.querySelectorAll !== "function") return;
  root.querySelectorAll("[data-route]").forEach((button) => {
    const selected = Boolean(state && state.predictedRoute === button.dataset.route);
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", selected ? "true" : "false");
  });
}

function selectRoute(routeId) {
  if (!state) startGame();
  const route = routeChoiceById(routeId);
  if (!route) return;
  if (state.revealed || state.correctExpressions.length >= MAX_CORRECT_PER_ROUND) {
    return setMessage("本题已经进入复盘阶段。下一题再选路线。", "");
  }
  state.predictedRoute = routeId;
  setLearningFeedback({
    tone: "neutral",
    title: `已选择路线：${route.label}`,
    body: "这一步不是答案，是假设。先有假设，再用点击和计算验证它。",
    action: route.id === "no_solution" ? "如果你认为无解，先排除 12×2、8×3、6×4，再点“我认为无解”。" : "现在用四张牌各一次，验证这条路线能不能到 24。",
  });
  setIterationCoach({
    keep: "保留：你先做策略判断，而不是立刻乱试。",
    improve: "改进：提交后复盘路线是否命中。命中加分，没命中也能学到结构差异。",
  });
  setMessage(`已选择路线：${route.label}。现在用牌验证它。`, "");
}

function setStrategyDrop(drop) {
  if (!state || !drop) return;
  state.strategyDrop = drop;
}

function gameWorldLabel(entry) {
  const diff = entry && entry.d;
  const labels = {
    easy: "世界 1 · 热身村",
    medium: "世界 2 · 结构城",
    hard: "世界 3 · 迷雾谷",
    expert: "Boss · 高手塔",
    dead: "隐藏关 · 反证门",
  };
  return labels[diff] || "世界 0 · 侦察场";
}

function buildQuestCard(entry, values) {
  const valuesText = values.join(" · ");
  if (!entry) {
    return {
      title: "侦察任务",
      body: `牌面 ${valuesText}。先找 12×2、8×3、6×4 或 24×1。`,
    };
  }
  if (entry.d === "dead") {
    return {
      title: "隐藏任务：证明或反证",
      body: "这题可能无解。先排除常见入口，再决定是否点击“我认为无解”。",
    };
  }
  if (entry.d === "easy") {
    return {
      title: "热身任务：首解通关",
      body: "先拿第一解，再试着找第二种真正不同的结构。",
    };
  }
  if (entry.d === "medium") {
    return {
      title: "标准任务：造两个中间数",
      body: "像建基地一样，先造 12、8、6、4、3、2、1，再组合成 24。",
    };
  }
  if (entry.d === "hard") {
    return {
      title: "挑战任务：先选路线",
      body: "先侦察，再选 12×2、8×3、6×4、分数桥或差值桥，最后提交验证。",
    };
  }
  return {
    title: "高手任务：找隐藏路径",
    body: "不要只套模板。优先观察分数桥、差值桥和反向回拉。",
  };
}

function currentGameStage() {
  if (!state) return "侦察";
  if (state.revealed || state.correctExpressions.length >= MAX_CORRECT_PER_ROUND) return "复盘";
  if (state.correctExpressions.length > 0) return "迁移";
  if (state.builderTokens.length > 0) return "执行";
  if (state.predictedRoute) return "建造";
  return "侦察";
}

function buildStrategyDrop(trigger, detail = {}) {
  const diff = state && state.catalogEntry ? state.catalogEntry.d : "unknown";
  let rarity = "common";
  if (trigger === "no_solution") rarity = detail.routeMatched ? "rare" : "uncommon";
  if (trigger === "extra_solution") rarity = "uncommon";
  if (trigger === "new_family") rarity = "rare";
  if (trigger === "first_correct") {
    rarity = detail.isNewFamily ? "rare" : "uncommon";
    if (detail.routeMatched) rarity = "epic";
    if (detail.seconds <= 20 && detail.attempts === 1 && detail.hintsUsed === 0 && (diff === "hard" || diff === "expert")) {
      rarity = "legendary";
    }
  }
  const rarityInfo = STRATEGY_RARITIES[rarity] || STRATEGY_RARITIES.common;
  const family = detail.family ? familyTitle(detail.family) : "结构策略";
  const title = `${rarityInfo.label}：${family}`;
  const bodyParts = [rarityInfo.note];
  if (detail.routeMatched) bodyParts.push("路线预判命中，说明你先想后算。");
  if (detail.isNewFamily) bodyParts.push("这是新策略族，不是换顺序的雷同答案。");
  if (trigger === "no_solution") bodyParts.push("能证明无解，也是数学能力。");
  return {rarity, title, body: bodyParts.join(" ")};
}

function renderGameLoopCoach() {
  if (!state) return;
  const world = $("gameWorld");
  const title = $("questCardTitle");
  const stage = $("gameLoopStage");
  const body = $("questCardBody");
  const dropTitle = $("strategyDropTitle");
  const dropBody = $("strategyDropBody");
  const drop = state.strategyDrop || {};
  if (world) world.textContent = gameWorldLabel(state.catalogEntry);
  if (title) title.textContent = state.questCard ? state.questCard.title : "本题任务";
  if (stage) stage.textContent = currentGameStage();
  if (body) body.textContent = state.questCard ? state.questCard.body : "先看牌面，再选择一条路线验证。";
  if (dropTitle) {
    dropTitle.textContent = drop.title || "策略掉落";
    dropTitle.dataset.rarity = drop.rarity || "common";
  }
  if (dropBody) dropBody.textContent = drop.body || "答对或复盘后，这里会沉淀一个可迁移的策略。";
}

function setLearningFeedback(feedback) {
  if (!state) return;
  state.learningFeedback = feedback;
}

function setExpressionDiagnosis(diagnosis) {
  if (!state) return;
  state.expressionDiagnosis = diagnosis;
}

function setPracticePrescription(prescription) {
  if (!state) return;
  state.practicePrescription = prescription;
}

function setIterationCoach(iteration) {
  if (!state) return;
  state.iterationCoach = iteration;
}

function buildPracticePrescription(trigger) {
  if (!state) {
    return {
      title: "先开始一题",
      body: "完成一次尝试后，系统会给出下一题练习建议。",
      metric: "依据：暂无本题数据。",
      recommendedMode: "balanced",
      focus: "先开始一题。",
    };
  }
  const difficulty = state.catalogEntry ? state.catalogEntry.d : "unknown";
  const solved = state.correctExpressions.length;
  const families = state.correctFamilies.length;
  if (trigger === "mistake") {
    if (state.attempts >= 3) {
      return {
        title: "下一步：降速，不降智",
        body: "连续尝试后，不要继续乱点。先只找一个中间数，再提交完整算式。",
        metric: `依据：本题已尝试 ${state.attempts} 次，当前难度 ${describeDifficulty(difficulty)}。`,
        recommendedMode: "easy",
        focus: "回到热身题，练中间数识别。",
      };
    }
    return {
      title: "下一步：先造中间数",
      body: "先不要追完整答案。只问：四张牌能不能造出 12、8、6、4、3、2、1？",
      metric: `依据：第 ${state.attempts} 次尝试未通过。`,
      recommendedMode: "balanced",
      focus: "继续智能混合，降低乱试比例。",
    };
  }
  if (trigger === "repeated") {
    return {
      title: "下一步：找真正不同的路",
      body: "换顺序不是新策略。下一次优先换目标因子，例如从 12×2 改成 8×3 或 6×4。",
      metric: `依据：已记录 ${families} 个策略族。`,
      recommendedMode: "medium",
      focus: "标准题里练不同策略族。",
    };
  }
  if (trigger === "hint") {
    return {
      title: "下一步：带着提示独立完成",
      body: "提示只负责缩小搜索空间。提交前先用自己的话说出：我准备造哪个中间数？",
      metric: `依据：本题已使用 ${state.hintsUsed} 次提示。`,
      recommendedMode: "medium",
      focus: "标准题，先独立 30 秒再求提示。",
    };
  }
  if (trigger === "new_family") {
    return {
      title: "下一步：保留这个策略族",
      body: "这比单纯答对更值钱。下一题先主动寻找同类结构，训练迁移。",
      metric: `依据：本题已出现 ${families} 个不同策略族。`,
      recommendedMode: "hard",
      focus: "挑战题里迁移刚学到的结构。",
    };
  }
  if (trigger === "extra_solution") {
    return {
      title: "下一步：提高差异度",
      body: "能找到多解很好，但要区分“同一条路换顺序”和“真正新结构”。",
      metric: `依据：本题已提交 ${solved} 条正确解法。`,
      recommendedMode: "hard",
      focus: "挑战题，刻意找不同结构。",
    };
  }
  if (trigger === "first_correct") {
    if (state.roundSeconds <= 20 && state.attempts === 1 && state.hintsUsed === 0) {
      return {
        title: "下一步：可以升一档",
        body: "你这题速度、准确率和独立性都不错。下一题可以试试挑战题。",
        metric: `依据：${state.roundSeconds} 秒、首次提交、未用提示。`,
        recommendedMode: "hard",
        focus: "升到挑战题，保持独立观察。",
      };
    }
    if (state.hintsUsed > 0) {
      return {
        title: "下一步：减少提示依赖",
        body: "这题已经做出来了。下一题先给自己 30 秒，再决定要不要提示。",
        metric: `依据：本题使用 ${state.hintsUsed} 次提示后答对。`,
        recommendedMode: "medium",
        focus: "标准题，延迟使用提示。",
      };
    }
    return {
      title: "下一步：找第二种结构",
      body: "第一解只是通关，第二解才开始训练灵活性。优先换目标因子。",
      metric: `依据：第 1 解完成，用时 ${state.roundSeconds} 秒。`,
      recommendedMode: "balanced",
      focus: "智能混合，练第二策略。",
    };
  }
  return {
    title: "下一题处方",
    body: "观察牌面，先找中间数，再点击验证。",
    metric: "依据：默认练习路径。",
    recommendedMode: "balanced",
    focus: "默认智能混合。",
  };
}

function renderPracticePrescription() {
  const panel = $("practicePrescription");
  if (!panel) return;
  const prescription = state && state.practicePrescription ? state.practicePrescription : null;
  panel.hidden = !prescription;
  if (!prescription) return;
  const title = $("practicePrescriptionTitle");
  const body = $("practicePrescriptionBody");
  const metric = $("practicePrescriptionMetric");
  const focus = $("practicePrescriptionFocus");
  if (title) title.textContent = prescription.title || "下一题处方";
  if (body) body.textContent = prescription.body || "";
  if (metric) metric.textContent = prescription.metric || "";
  if (focus) focus.textContent = `建议：${modeLabel(prescription.recommendedMode || "balanced")}；${prescription.focus || "先观察，再动手。"}`;
}

function applyPracticePrescription() {
  if (!state) return startGame();
  const prescription = state.practicePrescription || buildPracticePrescription("default");
  const mode = prescription.recommendedMode || "balanced";
  const node = $("trainingMode");
  if (node) node.value = mode;
  state.trainingMode = mode;
  nextRound();
  setMessage(`已按处方进入「${modeLabel(mode)}」。${prescription.focus || "先观察，再动手。"}`, "");
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "--";
  if (Number.isInteger(value)) return String(value);
  return Number(value.toFixed(4)).toString();
}

function buildExpressionDiagnosis(expression, result) {
  const expected = result.expectedNumbers || (state ? state.cards.map((card) => card.value) : []);
  const used = result.usedNumbers || [];
  const expressionText = expression ? getDisplayExpression() || expression.replace(/\*/g, "×").replace(/\//g, "÷") : "还没有算式";
  const cardText = result.cardCheck
    ? "四张牌各用一次。"
    : `已用：${used.length ? used.join("、") : "无"}；应使用：${expected.join("、")}。`;
  if (result.valid) {
    return {
      tone: "success",
      expression: expressionText,
      value: "结果 = 24",
      cards: cardText,
      next: result.strategy ? `成立，属于 ${result.strategy.title}。下一步找不同结构。` : "成立。下一步找第二种结构。",
    };
  }
  if (Number.isFinite(result.value)) {
    const distance = Math.abs(result.value - TARGET);
    return {
      tone: "wrong",
      expression: expressionText,
      value: `结果 = ${formatNumber(result.value)}，离 24 差 ${formatNumber(distance)}`,
      cards: cardText,
      next: distance <= 4 ? "已经接近 24。优先微调括号、加减或除法顺序。" : "先别继续乱试，换一个中间数或目标因子。",
    };
  }
  return {
    tone: "wrong",
    expression: expressionText,
    value: "暂时不能完成计算。",
    cards: cardText,
    next: result.message || "先清空，用按钮重新搭一遍。",
  };
}

function renderExpressionDiagnosis() {
  const panel = $("diagnosisCoach");
  if (!panel) return;
  const diagnosis = state && state.expressionDiagnosis ? state.expressionDiagnosis : null;
  panel.hidden = !diagnosis;
  if (!diagnosis) return;
  panel.classList.remove("success", "wrong");
  panel.classList.add(diagnosis.tone || "wrong");
  const expression = $("diagnosisExpression");
  const value = $("diagnosisValue");
  const cards = $("diagnosisCards");
  const next = $("diagnosisNext");
  if (expression) expression.textContent = diagnosis.expression || "--";
  if (value) value.textContent = diagnosis.value || "--";
  if (cards) cards.textContent = diagnosis.cards || "--";
  if (next) next.textContent = diagnosis.next || "--";
}

function buildIterationCoach(trigger, detail = {}) {
  const values = state ? state.cards.map((card) => card.value) : [];
  const pairHints = findPairHints(values).slice(0, 2);
  if (trigger === "mistake") {
    return {
      keep: "保留：你已经开始验证一条路径，这比空想更接近答案。",
      improve: detail.message && detail.message.includes("四张牌")
        ? "改进：下一次先检查四张牌是否各用一次，再看结果。"
        : `改进：不要连续乱试。先换一个中间数：${pairHints.join("；") || "12、8、6、4、3、2 或 1"}。`,
    };
  }
  if (trigger === "repeated") {
    return {
      keep: "保留：这条路已经被你确认可行。",
      improve: "改进：不要只交换顺序。下一步换策略族，比如从 12×2 换到 8×3 或 6×4。",
    };
  }
  if (trigger === "hint") {
    return {
      keep: "保留：会求提示不是坏事，说明你在主动校准方向。",
      improve: "改进：下一题先独立观察 30 秒，再决定要不要提示。",
    };
  }
  if (trigger === "reveal") {
    return {
      keep: "保留：看答案也是学习，但要看结构，不是背结果。",
      improve: "改进：下一题先说出目标因子，再点击验证。",
    };
  }
  if (trigger === "new_family") {
    return {
      keep: `保留：你找到新策略族 ${detail.strategy ? detail.strategy.title : "不同结构"}，这是真正的迁移。`,
      improve: "改进：复盘时说出为什么这条路和上一条不同。",
    };
  }
  if (trigger === "extra_solution") {
    return {
      keep: "保留：你愿意找第二条路，这会训练灵活性。",
      improve: "改进：下一条尽量换中间数，而不是只改括号顺序。",
    };
  }
  if (trigger === "first_correct") {
    const fast = state && state.roundSeconds <= 20 && state.attempts === 1 && state.hintsUsed === 0;
    const routeText = detail.predictedRoute ? describePredictedRoute() : "还没有先选路线";
    return {
      keep: fast
        ? "保留：这题速度快、首次提交、没用提示，说明观察有效。"
        : `保留：你已经得到第一条正确路径${detail.strategy ? `，属于 ${detail.strategy.title}` : ""}。`,
      improve: detail.routeMatched
        ? `改进：本题路线「${routeText}」命中。答对后不要马上下一题，先找第二种结构。`
        : `改进：本题先选路线是「${routeText}」。复盘它和实际路径哪里不同。`,
    };
  }
  return {
    keep: "保留：把每次尝试都当作信息。",
    improve: "改进：下一题只改一个动作，别同时改太多。",
  };
}

function renderIterationCoach() {
  const panel = $("iterationCoach");
  if (!panel) return;
  const iteration = state && state.iterationCoach ? state.iterationCoach : null;
  panel.hidden = !iteration;
  if (!iteration) return;
  const keep = $("iterationKeep");
  const improve = $("iterationImprove");
  if (keep) keep.textContent = iteration.keep || "";
  if (improve) improve.textContent = iteration.improve || "";
}

function buildMistakeFeedback(message, expression) {
  const values = state ? state.cards.map((card) => card.value) : [];
  const pairHints = findPairHints(values).slice(0, 3);
  if (!expression || message.includes("请输入")) {
    return {
      tone: "wrong",
      title: "算式还没完成",
      body: "先点一张牌，再点符号，再点下一张牌。不要一上来追求完整答案。",
      action: "最小动作：牌 -> 符号 -> 牌。",
    };
  }
  if (message.includes("四张牌")) {
    return {
      tone: "wrong",
      title: "牌没有各用一次",
      body: "24 点的训练重点不是算出 24，而是在限制条件下算出 24。",
      action: `检查四张牌是否都用了一次：${values.join("、")}。`,
    };
  }
  if (message.includes("不是 24")) {
    const match = message.match(/算出来是 ([^，]+)，不是 24/);
    const current = match ? match[1] : "当前结果";
    return {
      tone: "wrong",
      title: "结果还没靠近 24",
      body: `${current} 不是失败证据，而是一个中间状态。数学训练要学会从结果反推结构。`,
      action: pairHints.length ? `下一步试这些中间数：${pairHints.join("；")}。` : "下一步先造 12、8、6、4、3、2 或 1。",
    };
  }
  if (message.includes("不支持的字符") || message.includes("无法识别")) {
    return {
      tone: "wrong",
      title: "符号不被识别",
      body: "为了减少输入错误，优先点击页面上的 + − × ÷ 和括号。",
      action: "点“清空”，用按钮重新搭一遍。",
    };
  }
  return {
    tone: "wrong",
    title: "这次错误有信息",
    body: "错误不是结束，而是帮你排除一条路径。",
    action: "先撤销一步，再换括号或换目标因子。",
  };
}

function renderLearningFeedback() {
  const panel = $("feedbackCoach");
  if (!panel) return;
  const feedback = state && state.learningFeedback ? state.learningFeedback : null;
  panel.hidden = !feedback;
  if (!feedback) return;
  panel.classList.remove("success", "wrong", "neutral");
  panel.classList.add(feedback.tone || "neutral");
  const title = $("feedbackCoachTitle");
  const body = $("feedbackCoachBody");
  const action = $("feedbackCoachAction");
  if (title) title.textContent = feedback.title || "本题反馈";
  if (body) body.textContent = feedback.body || "";
  if (action) action.textContent = feedback.action || "";
}

function isQuickStartDismissed() {
  try {
    return localStorage.getItem(QUICK_START_KEY) === "true";
  } catch {
    return false;
  }
}

function renderQuickStart() {
  const panel = $("quickStart");
  if (!panel) return;
  const solvedOnce = Boolean(state && state.correctExpressions && state.correctExpressions.length > 0);
  panel.hidden = isQuickStartDismissed() || solvedOnce;
}

function dismissQuickStart(options = {}) {
  try {
    localStorage.setItem(QUICK_START_KEY, "true");
  } catch {
    // Local storage can be blocked. The visual state can still update for this session.
  }
  renderQuickStart();
  if (!options.silent && state) setMessage("已关闭三步上手。需要完整玩法时，打开深入学习中心。", "");
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
  const strategyDepth = $("strategyDepth");
  if (score) score.textContent = String(state.score);
  if (streak) streak.textContent = String(state.streak);
  if (roundTimer) roundTimer.textContent = `${state.roundSeconds} 秒`;
  if (bestTime) bestTime.textContent = state.bestTime ? `${state.bestTime} 秒` : "--";
  if (strategyDepth) strategyDepth.textContent = String(state.correctFamilies.length);
  if (lastReward) lastReward.textContent = state.lastReward || "--";
  renderCatalogStats();
  renderLearningLedger();
}

function renderCatalogStats() {
  const total = $("catalogTotal");
  const solvable = $("catalogSolvable");
  const diff = $("currentDifficulty");
  const solutionCount = $("currentSolutionCount");
  const coach = $("catalogCoach");
  const entry = state && state.catalogEntry ? state.catalogEntry : null;
  if (total) total.textContent = BRUTEFORCE_CATALOG ? String(BRUTEFORCE_CATALOG.total_rank_multisets) : "--";
  if (solvable) solvable.textContent = BRUTEFORCE_CATALOG ? String(BRUTEFORCE_CATALOG.solvable_rank_multisets) : "--";
  if (diff) diff.textContent = entry ? describeDifficulty(entry.d) : "--";
  if (solutionCount) solutionCount.textContent = entry ? (shouldHideSolutionCount(entry) ? "先不公开" : String(entry.s)) : "--";
  if (coach) coach.textContent = buildCatalogCoach(entry);
}

function buildCatalogCoach(entry) {
  if (!BRUTEFORCE_CATALOG) return "当前页面未加载暴力破解目录，仍可正常游玩。";
  if (!entry) return "机器已枚举全局题库。下一题会把当前牌面放回全局地图中解释。";
  const families = entry.f && entry.f.length ? entry.f.map(familyTitle).join("、") : "暂无";
  if (shouldHideSolutionCount(entry)) {
    return `当前牌值属于“${describeDifficulty(entry.d)}”。本题先不公开是否有解，训练的是先观察、再判断、最后验证。`;
  }
  if (entry.s === 0) {
    return `机器枚举后确认本题无解。复盘重点不是凑答案，而是说清楚为什么凑不出 24。`;
  }
  return `当前牌值在全局题库中属于“${describeDifficulty(entry.d)}”：机器找到 ${entry.s} 条候选式，策略族包括 ${families}。${difficultyAdvice(entry.d)}`;
}

function currentTrainingMode() {
  const node = $("trainingMode");
  return node && node.value ? node.value : "balanced";
}

function rankKey(values) {
  return [...values].map(Number).sort((a, b) => a - b).join(",");
}

function getCatalogEntryForValues(values) {
  return BRUTEFORCE_MAP.get(rankKey(values)) || null;
}

function getCurrentSolutionCount() {
  if (!state) return 0;
  if (state.catalogEntry && Number.isFinite(Number(state.catalogEntry.s))) return Number(state.catalogEntry.s);
  return Array.isArray(state.solutions) ? state.solutions.length : 0;
}

function shouldHideSolutionCount(entry = state && state.catalogEntry) {
  if (!entry || !state) return false;
  if (state.showSolutions || state.correctExpressions.length || state.revealed) return false;
  return entry.d === "hard" || entry.d === "expert" || entry.d === "dead";
}

function describeDifficulty(value) {
  const names = {
    easy: "热身题",
    medium: "标准题",
    hard: "挑战题",
    expert: "高手题",
    dead: "不可解",
  };
  return names[value] || "未知";
}

function modeLabel(value) {
  const labels = {
    balanced: "智能混合",
    easy: "热身",
    medium: "标准",
    hard: "挑战",
    expert: "高手",
  };
  return labels[value] || "智能混合";
}

function difficultyAdvice(value) {
  const advice = {
    easy: "这是热身题：先找最明显的 12×2、8×3、6×4 或 24×1，练的是启动速度。",
    medium: "这是标准题：先拆成两个中间数，再决定加减乘除顺序。",
    hard: "这是挑战题：不要套热身模板，先观察差值、分数桥、除法桥和可迁移结构。",
    expert: "这是高手题：先做全局定位，再尝试制造非整数中间数或反向回拉。",
    dead: "这是判断题：可能没有解。先检查常见入口，再决定是否按“我认为无解”。",
  };
  return advice[value] || "智能混合会轮换不同难度。先观察结构，再动手组合。";
}

function buildMissionStripText(valuesText, entry) {
  if (!entry) return `本题牌面：${valuesText}。先观察四张牌，再找 12×2、8×3、6×4 或 24×1。`;
  if (shouldHideSolutionCount(entry)) {
    return `本题牌面：${valuesText}。${describeDifficulty(entry.d)}：先不告诉有没有解。你可以构造 24，也可以判断“无解”。`;
  }
  if (entry.s === 0) {
    return `本题牌面：${valuesText}。机器枚举确认无解。复盘重点：为什么 12×2、8×3、6×4 都走不通。`;
  }
  const catalog = `机器找到 ${entry.s} 条候选式，${describeDifficulty(entry.d)}。`;
  if (entry.d === "easy") return `本题牌面：${valuesText}。${catalog}热身题先公开数量：目标是快速找到第一条，再找不同思路。`;
  if (entry.d === "medium") return `本题牌面：${valuesText}。${catalog}标准题：先拆两个中间数，再决定运算顺序。`;
  if (entry.d === "hard") return `本题牌面：${valuesText}。${catalog}挑战题：先找差值、分数桥或除法桥。`;
  if (entry.d === "expert") return `本题牌面：${valuesText}。${catalog}高手题：先做全局定位，再找反向回拉路径。`;
  return `本题牌面：${valuesText}。${catalog}先判断能否构造目标因子。`;
}

function requestHint() {
  if (!state) startGame();
  if (state.revealed || state.correctExpressions.length >= MAX_CORRECT_PER_ROUND) {
    return setMessage("本题已经进入复盘阶段。直接看下面的数学教练。", "");
  }
  state.hintLevel = Math.min(3, state.hintLevel + 1);
  state.hintsUsed += 1;
  const hint = buildProgressiveHint(state.cards.map((card) => card.value), state.hintLevel);
  updateLearningLedger({type: "hint"});
		  setLearningFeedback({
		    tone: "neutral",
		    title: `提示 ${state.hintLevel} 已使用`,
		    body: "提示不是答案，它是把注意力从乱试拉回结构。",
		    action: hint.replace(/^提示 \d+：/, ""),
		  });
  setPracticePrescription(buildPracticePrescription("hint"));
  setIterationCoach(buildIterationCoach("hint"));
  setMessage(hint, "");
}

function buildProgressiveHint(values, level) {
  const strategies = buildSolutionStrategies(solve24(values, 20));
  const first = strategies[0];
  const pairHints = findPairHints(values);
  const difficulty = state && state.catalogEntry ? state.catalogEntry.d : null;
  if (level <= 1) {
    if (difficulty === "hard" || difficulty === "expert") {
      return `提示 1：这是${describeDifficulty(difficulty)}。先别急着套 12×2，先看差值、除法桥或能不能造出 3、4、6、8、12 的变形。`;
    }
    return `提示 1：先别算完整答案。先找中间数：${pairHints.slice(0, 3).join("；") || "试着造 12、8、6、4、3、2、1"}。`;
  }
  if (level === 2) {
    if (difficulty === "hard" || difficulty === "expert") {
      return `提示 2：优先观察“反向回拉”：先想 24 可以由 24×1、12×2、8×3、6×4 得到，再问四张牌能不能绕路造出来。`;
    }
    return `提示 2：这题可以优先试 ${first ? first.title : "12×2、8×3 或 6×4"}。提示会少量影响奖励。`;
  }
  return `提示 3：看一个方向，但不直接给完整答案：${first ? first.coach : "先造一个目标因子，再用剩余牌配对。"}。`;
}

function renderMissionStrip() {
  const strip = $("missionStrip");
  if (!strip || !state) return;
  const values = state.cards.map((card) => card.value).join(" · ");
  if (!state.correctExpressions.length && !state.revealed) {
    strip.textContent = buildMissionStripText(values, state.catalogEntry);
    return;
  }
  if (state.correctFamilies.length) {
    strip.textContent = `已找到 ${state.correctFamilies.length} 个策略族：${state.correctFamilies.map(familyTitle).join("、")}。`;
    return;
  }
  strip.textContent = "看完教练解法后，下一题先判断目标因子，再动手。";
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
  openPanel("coachSection");
  setIterationCoach(buildIterationCoach("reveal"));
  setStrategyDrop({
    rarity: "common",
    title: "复盘材料：教练解法",
    body: "揭晓不加分。它的价值是看结构、改策略，然后迁移到下一题。",
  });
  if (!state.solutions.length) {
    setMessage("揭晓结果：这题无解。重点复盘为什么常见入口都走不通。", "");
    return;
  }
  setMessage(`揭晓答案：${state.solution}。这题不加分，但可以学习下面的思路。`, "");
}

function renderSolutions() {
  const list = $("solutionList");
  const coach = $("coachPanel");
  if (!list || !state) return;
  if (!state.showSolutions) {
    list.innerHTML = `<li class="muted">先自己想。答对或揭晓后，这里会显示“不同思路”，只交换顺序的雷同答案会被合并。</li>`;
    if (coach) {
      coach.innerHTML = `
        <div class="coach-card">
          <strong>先独立尝试</strong>
          <span>先给自己 30 秒。不要急着看答案，先观察牌面能不能接近 12、8、6、4。</span>
        </div>
        <div class="coach-card">
          <strong>再找结构</strong>
          <span>常见目标：24×1、12×2、8×3、6×4。先用两张牌造一个中间数。</span>
        </div>
        <div class="coach-card">
          <strong>最后说出为什么</strong>
          <span>答对不算结束。说出“这题属于哪一类策略”，才是真正学会。</span>
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
  if (!state.solutions.length) {
    list.innerHTML = `
      <li>
        <code>无解</code>
        <span><strong>机器枚举确认</strong> · 在四则运算、四张牌各用一次的规则下，这组牌不能得到 24。</span>
        <span class="strategy-coach">复盘重点：不是放弃，而是说明为什么 24×1、12×2、8×3、6×4 都无法构造。</span>
      </li>
    `;
    return;
  }
  const strategies = buildSolutionStrategies(state.solutions);
  list.innerHTML = strategies.slice(0, 12).map((strategy, idx) => {
    return `
      <li>
        <code>${escapeHtml(formatSolution(strategy.solution))}</code>
        <span><strong>${idx + 1}. ${escapeHtml(strategy.title)}</strong> · ${escapeHtml(strategy.body)}</span>
        ${strategy.coach ? `<span class="strategy-coach">${escapeHtml(strategy.coach)}</span>` : ""}
        ${strategy.mergedCount > 1 ? `<em>已合并 ${strategy.mergedCount} 个只是顺序不同的雷同答案。</em>` : ""}
      </li>
    `;
  }).join("");
}

function renderReviewCard() {
  const target = $("reviewCardContent");
  if (!target || !state) return;
  const values = state.cards.map((card) => card.value);
  const strategies = buildSolutionStrategies(state.solutions);
  const firstStrategy = strategies[0];
  const pairHints = findPairHints(values).slice(0, 4);
  const solvedText = state.correctExpressions.length
    ? `已提交 ${state.correctExpressions.length} 条正确解法。`
    : state.revealed
      ? "已揭晓答案，本题不计分。"
      : "还没有提交正确解法。";
  const familyText = state.correctFamilies.length ? state.correctFamilies.map(familyTitle).join("、") : "还没有记录策略族";
  const globalPosition = state.catalogEntry ? `${describeDifficulty(state.catalogEntry.d)}，全局目录记录 ${state.catalogEntry.s} 条候选式` : "未加载暴力破解目录";
  const ledger = readLearningLedger();
  const ledgerFamilies = Object.entries(ledger.families || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const ledgerSummary = ledger.solvedCount
    ? `累计答对 ${ledger.solvedCount} 题；额外解法 ${ledger.extraSolutionCount} 条；最快 ${ledger.bestSeconds === null ? "--" : `${ledger.bestSeconds} 秒`}；常用策略 ${ledgerFamilies.map(([family, count]) => `${familyTitle(family)}×${count}`).join("、") || "暂无"}`
    : "还没有长期记录。答对第一题后，学习档案会开始积累。";
  const reviewText = [
    `牌面：${values.join(", ")}`,
    `全局定位：${globalPosition}`,
    `状态：${solvedText}`,
    `先选路线：${describePredictedRoute()}`,
    `已掌握策略：${familyText}`,
    `长期档案：${ledgerSummary}`,
    `提示次数：${state.hintsUsed}`,
    `推荐先看：${firstStrategy ? firstStrategy.title : "先找 12×2、8×3、6×4"}`,
    `中间数线索：${pairHints.length ? pairHints.join("；") : "先试着造 1、2、3、4、6、8、12"}`,
    "思维动作：观察 -> 拆解 -> 验证 -> 解释 -> 迁移",
    "下一题迁移：先判断目标因子，再动手点击。",
  ].join("\n");
  target.dataset.reviewText = reviewText;
  target.innerHTML = `
    <div class="review-chip-row">
      ${values.map((value) => `<span>${escapeHtml(value)}</span>`).join("")}
    </div>
    <article>
      <strong>本题状态</strong>
      <p>${escapeHtml(solvedText)}</p>
    </article>
    <article>
      <strong>全局定位</strong>
      <p>${escapeHtml(globalPosition)}。机器负责枚举，人负责解释和迁移。</p>
    </article>
    <article>
      <strong>先选路线</strong>
      <p>${escapeHtml(describePredictedRoute())}。先预测再验证，训练的是数学里的假设检验。</p>
    </article>
    <article>
      <strong>已掌握策略</strong>
      <p>${escapeHtml(familyText)}</p>
    </article>
    <article>
      <strong>长期档案</strong>
      <p>${escapeHtml(ledgerSummary)}</p>
    </article>
    <article>
      <strong>提示使用</strong>
      <p>${state.hintsUsed ? `用了 ${state.hintsUsed} 次提示。下次试试先独立观察更久一点。` : "没有使用提示。保留了完整探索感。"}</p>
    </article>
    <article>
      <strong>推荐策略</strong>
      <p>${firstStrategy ? escapeHtml(firstStrategy.title) : "先找 12×2、8×3、6×4 这些目标结构。"}</p>
    </article>
    <article>
      <strong>中间数线索</strong>
      <p>${escapeHtml(pairHints.length ? pairHints.join("；") : "先试着造 1、2、3、4、6、8、12。")}</p>
    </article>
    <article>
      <strong>迁移提示</strong>
      <p>下一题不要先乱点。先看能不能造出目标因子，再用点击验证。</p>
    </article>
    <article>
      <strong>思维动作</strong>
      <p>观察 -> 拆解 -> 验证 -> 解释 -> 迁移。会解释，比只会答对更重要。</p>
    </article>
  `;
}

async function copyReviewCard() {
  const target = $("reviewCardContent");
  const text = target && target.dataset ? target.dataset.reviewText : "";
  if (!text) return setMessage("复盘卡还没生成。", "error");
  try {
    await navigator.clipboard.writeText(text);
    setMessage("已复制复盘卡。可以发给家人，或者留作学习记录。", "success");
  } catch {
    setMessage("浏览器不允许自动复制。你可以手动选中复盘卡内容。", "error");
  }
}

function toggleSolutions() {
  if (!state) startGame();
  state.showSolutions = !state.showSolutions;
  openPanel("coachSection");
  render();
}

function openPanel(id) {
  const panel = $(id);
  document.querySelectorAll(".link-panel").forEach((item) => {
    if (item.id !== id && "open" in item) item.open = false;
  });
  const learningCenter = $("learningCenter");
  if (learningCenter && "open" in learningCenter) learningCenter.open = false;
  if (panel && "open" in panel) {
    panel.open = true;
    if (typeof panel.scrollIntoView === "function") panel.scrollIntoView({block: "start"});
  }
}

function wireDeepLinks() {
  document.querySelectorAll("[data-open-panel]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      openPanel(link.dataset.openPanel);
    });
  });
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

function computeReward(seconds, streak, attempts, hintsUsed = 0) {
  const streakTable = [0, 1, 3, 5, 8, 13];
  const streakPoints = streakTable[Math.min(streak, streakTable.length - 1)];
  const speedBonus = seconds <= 15 ? 5 : seconds <= 30 ? 3 : seconds <= 60 ? 1 : 0;
  const firstTryBonus = attempts === 1 ? 2 : 0;
  const hintPenalty = Math.min(4, hintsUsed * HINT_PENALTY);
  return {
    total: Math.max(1, streakPoints + speedBonus + firstTryBonus - hintPenalty),
    streakPoints,
    speedBonus,
    firstTryBonus,
    hintPenalty,
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

function defaultLearningLedger() {
  return {
    solvedCount: 0,
    extraSolutionCount: 0,
    hintCount: 0,
    totalAttempts: 0,
    totalReward: 0,
    bestSeconds: null,
    lastSolvedAt: null,
    families: {},
    difficulties: {},
  };
}

function readLearningLedger() {
  try {
    const raw = localStorage.getItem(LEARNING_LEDGER_KEY);
    if (!raw) return defaultLearningLedger();
    return {...defaultLearningLedger(), ...JSON.parse(raw)};
  } catch {
    return defaultLearningLedger();
  }
}

function writeLearningLedger(ledger) {
  try {
    localStorage.setItem(LEARNING_LEDGER_KEY, JSON.stringify(ledger));
  } catch {
    // Local storage can be blocked. The game should remain playable.
  }
}

function updateLearningLedger(event) {
  const ledger = readLearningLedger();
  if (event.type === "hint") {
    ledger.hintCount += 1;
    writeLearningLedger(ledger);
    renderLearningLedger();
    return ledger;
  }
  if (event.type === "solve" || event.type === "extra_solution" || event.type === "no_solution") {
    if (event.type === "solve") ledger.solvedCount += 1;
    if (event.type === "extra_solution") ledger.extraSolutionCount += 1;
    ledger.totalAttempts += Number(event.attempts || 0);
    ledger.totalReward += Number(event.reward || 0);
    ledger.lastSolvedAt = new Date().toISOString();
    if (Number.isFinite(event.seconds) && (ledger.bestSeconds === null || event.seconds < ledger.bestSeconds)) {
      ledger.bestSeconds = event.seconds;
    }
    const family = event.family || "unknown";
    const difficulty = event.difficulty || "unknown";
    ledger.families[family] = (ledger.families[family] || 0) + 1;
    ledger.difficulties[difficulty] = (ledger.difficulties[difficulty] || 0) + 1;
    writeLearningLedger(ledger);
    renderLearningLedger();
    return ledger;
  }
  return ledger;
}

function resetLearningLedger() {
  try {
    localStorage.removeItem(LEARNING_LEDGER_KEY);
  } catch {
    writeLearningLedger(defaultLearningLedger());
  }
  renderLearningLedger();
  if (state) setMessage("已清空本机学习档案。重新开始积累。", "");
}

function renderLearningLedger() {
  const target = $("learningLedgerContent");
  if (!target) return;
  const ledger = readLearningLedger();
  const familyEntries = Object.entries(ledger.families || {}).sort((a, b) => b[1] - a[1]);
  const topFamilies = familyEntries.length
    ? familyEntries.slice(0, 4).map(([family, count]) => `${familyTitle(family)} × ${count}`).join("；")
    : "还没有策略记录。先答对一题。";
  const attemptsPerSolve = ledger.solvedCount
    ? (ledger.totalAttempts / ledger.solvedCount).toFixed(1)
    : "--";
  target.innerHTML = `
    <article>
      <strong>${ledger.solvedCount}</strong>
      <span>答对题数</span>
    </article>
    <article>
      <strong>${ledger.extraSolutionCount}</strong>
      <span>额外解法</span>
    </article>
    <article>
      <strong>${ledger.bestSeconds === null ? "--" : `${ledger.bestSeconds}秒`}</strong>
      <span>最快记录</span>
    </article>
    <article>
      <strong>${ledger.hintCount}</strong>
      <span>提示次数</span>
    </article>
    <article class="wide">
      <strong>策略复利</strong>
      <span>${escapeHtml(topFamilies)}</span>
    </article>
    <article class="wide">
      <strong>练习质量</strong>
      <span>平均每题尝试 ${attemptsPerSolve} 次。目标不是永远秒答，而是让错误越来越有信息。</span>
    </article>
  `;
}

function formatSolution(solution) {
  return solution.replaceAll("*", "×").replaceAll("/", "÷");
}

function buildCoachInsights(values, solutions) {
  const sorted = [...values].sort((a, b) => a - b);
  const cards = sorted.join(", ");
  const strategies = buildSolutionStrategies(solutions);
  const catalogEntry = getCatalogEntryForValues(values);
  const mergedCount = Math.max(0, solutions.length - strategies.length);
  const pairHints = findPairHints(values).slice(0, 3);
  const items = [
    {
      title: "本题牌值",
      body: `牌值是 ${cards}。先别急着算，先想能不能做出 1、2、3、4、6、8、12。`,
    },
    {
      title: "启蒙目标",
      body: "本题不是背答案，而是练：观察、拆解、验证、解释、迁移。会玩以后，数学会从题目变成工具。",
    },
  ];
  if (pairHints.length) {
    items.push({
      title: "可以先盯住的中间数",
      body: pairHints.join("；"),
    });
  }
  if (!solutions.length) {
    items.push({
      title: "无解也是答案",
      body: "机器枚举确认这组牌无法用四则运算得到 24。真正的训练是：你能不能解释为什么常见入口都走不通。",
    });
    items.push({
      title: "反证复盘",
      body: "按顺序检查 24×1、12×2、8×3、6×4。每个入口都无法由剩余牌构造时，才有资格说“无解”。",
    });
    return items;
  }
  items.push({
    title: "真正不同的思路",
    body: `本页展示前 ${solutions.length} 条候选式；全局目录记录此牌面共有 ${catalogEntry ? catalogEntry.s : solutions.length} 条候选式。按策略族合并后是 ${strategies.length} 种当前可见思路。${mergedCount ? `有 ${mergedCount} 条只是交换顺序或等价重排，不单独算启发。` : "这些路径结构差异较明显。"}`,
  });
  if (catalogEntry) {
    items.push({
      title: "全局题库定位",
      body: `机器已枚举 1820 种四牌牌值组合。这题是${describeDifficulty(catalogEntry.d)}，所以练习不是随机刷题，而是按难度和结构递进。`,
    });
  }
  items.push({
    title: "迁移提示",
    body: "把这题的中间数方法带到下一题。今天练的是 24 点，长期练的是结构感、耐心、表达能力和反馈循环。",
  });
  return items;
}

function buildSolutionStrategies(solutions) {
  const groups = new Map();
  for (const solution of solutions) {
    const ast = parseSolutionAst(solution);
    if (!ast) continue;
    const summary = summarizeStrategy(ast);
    const key = `${summary.family}:${canonicalAst(ast)}`;
    if (!groups.has(key)) {
      groups.set(key, {
        solution,
        key,
        title: summary.title,
        body: summary.body,
        coach: summary.coach,
        family: summary.family,
        mergedCount: 1,
      });
    } else {
      groups.get(key).mergedCount += 1;
    }
  }
  return [...groups.values()].sort((a, b) => {
    const familyOrder = ["12x2", "8x3", "6x4", "24x1", "fraction", "add", "subtract", "other"];
    const familyDelta = familyOrder.indexOf(a.family) - familyOrder.indexOf(b.family);
    if (familyDelta !== 0) return familyDelta;
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
    const family = classifyMultiplicationFamily(left, right);
    return {
      family,
      title: `${familyTitle(family)}：${formatNumber(left)} × ${formatNumber(right)}`,
      body: `${firstSteps.length ? `先做 ${firstSteps.join("，再做 ")}，` : ""}最后相乘得到 24。重点是看见因子配对，不是机械换顺序。`,
      coach: familyCoach(family),
    };
  }
  if (ast.op === "/") {
    const left = evalAst(ast.left);
    const right = evalAst(ast.right);
    return {
      family: "fraction",
      title: `除法结构：${formatNumber(left)} ÷ ${formatNumber(right)}`,
      body: `${firstSteps.length ? `先做 ${firstSteps.join("，再做 ")}，` : ""}最后用比例关系得到 24。这类题训练的是分数和逆向思考。`,
      coach: "分数桥接题不要怕除法。先造一个比例，再让它放大到 24。",
    };
  }
  if (ast.op === "+") {
    return {
      family: "add",
      title: "加法收尾",
      body: `${firstSteps.length ? `先做 ${firstSteps.join("，再做 ")}，` : ""}最后靠两部分相加到 24。先拆目标，再补差值。`,
      coach: "加法收尾适合训练“拆目标”：先想 24 可以拆成哪两块。",
    };
  }
  if (ast.op === "-") {
    return {
      family: "subtract",
      title: "减法收尾",
      body: `${firstSteps.length ? `先做 ${firstSteps.join("，再做 ")}，` : ""}最后靠差值到 24。先做大数，再控制差距。`,
      coach: "减法收尾是先做大数再削回来，适合训练逆向思考。",
    };
  }
  return {family: "other", title: "可行路径", body: "这是一条可行路径。", coach: "记录它，但优先学习结构更清楚的路径。"};
}

function summarizeSubmittedExpression(expression) {
  const ast = parseSolutionAst(expression);
  if (!ast) return null;
  return summarizeStrategy(ast);
}

function classifyMultiplicationFamily(left, right) {
  const a = Math.abs(left);
  const b = Math.abs(right);
  const pair = [a, b].sort((x, y) => x - y).map(formatNumber).join("x");
  if (pair === "2x12") return "12x2";
  if (pair === "3x8") return "8x3";
  if (pair === "4x6") return "6x4";
  if (pair === "1x24") return "24x1";
  return "other";
}

function familyTitle(family) {
  const titles = {
    "12x2": "策略族 12×2",
    "8x3": "策略族 8×3",
    "6x4": "策略族 6×4",
    "24x1": "策略族 24×1",
    fraction: "分数桥接",
    add: "加法拆分",
    subtract: "减法控制差值",
    other: "乘法结构",
  };
  return titles[family] || titles.other;
}

function familyCoach(family) {
  const notes = {
    "12x2": "先造 12，再用剩余牌造 2。这是最常见、最短的 24 点路径之一。",
    "8x3": "先造 8 和 3。遇到 1、2、4、6、8 时，经常能走这条路。",
    "6x4": "先造 6 和 4。它适合训练补数、差值和括号意识。",
    "24x1": "先造 24，再用剩余牌造 1。造 1 是很重要的迁移能力。",
    other: "如果不是标准因子族，就把它当作特殊路径；先理解，再记到复盘卡。",
  };
  return notes[family] || notes.other;
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
  if (!expression) return {valid: false, message: "请输入表达式。", usedNumbers: [], expectedNumbers: cardValues, cardCheck: false};
  let tokens;
  try {
    tokens = tokenize(normalizeExpression(expression));
  } catch (err) {
    return {valid: false, message: err.message, usedNumbers: [], expectedNumbers: cardValues, cardCheck: false};
  }

  const usedNumbers = tokens.filter((token) => token.type === "number").map((token) => token.value);
  if (!sameMultiset(usedNumbers, cardValues)) {
    return {
      valid: false,
      message: `必须正好使用四张牌的数值各一次。你用了 ${usedNumbers.join(", ")}；本轮牌值是 ${cardValues.join(", ")}。`,
      usedNumbers,
      expectedNumbers: cardValues,
      cardCheck: false,
    };
  }

  try {
    const parser = new Parser(tokens);
    const value = parser.parseExpression();
    if (!parser.atEnd()) return {valid: false, message: "表达式后面还有无法识别的内容。", value, usedNumbers, expectedNumbers: cardValues, cardCheck: true};
    if (Math.abs(value - TARGET) > 1e-9) {
      const pretty = Number.isInteger(value) ? String(value) : value.toPrecision(8);
      return {
        valid: false,
        message: `算出来是 ${pretty}，不是 24。连续除法按从左到右算，例如 1/8/(4-1) = (1/8)/3。`,
        value,
        usedNumbers,
        expectedNumbers: cardValues,
        cardCheck: true,
      };
    }
    return {valid: true, message: "正确。", value, usedNumbers, expectedNumbers: cardValues, cardCheck: true};
  } catch (err) {
    return {valid: false, message: err.message, usedNumbers, expectedNumbers: cardValues, cardCheck: true};
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
wire("claimNoSolution", claimNoSolution);
wire("undo", undoToken);
wire("clear", clearExpression);
wire("reveal", reveal);
if ($("hintButton")) wire("hintButton", requestHint);
if ($("soundToggle")) wire("soundToggle", initAudio);
if ($("toggleSolutions")) wire("toggleSolutions", toggleSolutions);
if ($("copyReviewCard")) wire("copyReviewCard", copyReviewCard);
if ($("resetLearningLedger")) wire("resetLearningLedger", resetLearningLedger);
if ($("applyPrescription")) wire("applyPrescription", applyPracticePrescription);
if ($("quickStartDismiss")) wire("quickStartDismiss", dismissQuickStart);
if ($("trainingMode")) {
  $("trainingMode").addEventListener("change", () => {
    if (!state) return startGame();
    state.trainingMode = currentTrainingMode();
    nextRound();
    setMessage(`已切换到「${modeLabel(state.trainingMode)}」，并重新发出对应难度的新题。`, "");
  });
}
document.querySelectorAll("[data-op]").forEach((button) => {
  button.addEventListener("click", () => appendOperator(button.dataset.op));
});
document.querySelectorAll("[data-route]").forEach((button) => {
  button.addEventListener("click", () => selectRoute(button.dataset.route));
});
wireDeepLinks();

window.__24DUCK_TEST__ = {
  startGame,
  appendCard,
  appendOperator,
  undoToken,
  clearExpression,
  submitAnswer,
  claimNoSolution,
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
  renderReviewCard,
  renderMissionStrip,
	  renderCatalogStats,
	  renderLearningFeedback,
  renderExpressionDiagnosis,
  buildExpressionDiagnosis,
  setExpressionDiagnosis,
  renderIterationCoach,
  buildIterationCoach,
  setIterationCoach,
  buildMistakeFeedback,
  applyPracticePrescription,
  renderPracticePrescription,
  buildPracticePrescription,
  setPracticePrescription,
	  renderLearningLedger,
	  renderQuickStart,
  ROUTE_CHOICES,
  ROUTE_BONUS,
  routeChoiceById,
  selectRoute,
  renderRouteOptions,
  routeMatchesStrategy,
  describePredictedRoute,
	  readLearningLedger,
	  updateLearningLedger,
  selectCatalogEntry,
  selectRoundEntry,
  dealTrainingHand,
  getCurrentSolutionCount,
  shouldHideSolutionCount,
  buildMissionStripText,
  difficultyAdvice,
  modeLabel,
	  resetLearningLedger,
	  dismissQuickStart,
	  isQuickStartDismissed,
	  getQuickStartKey: () => QUICK_START_KEY,
	  openPanel,
  wireDeepLinks,
  requestHint,
  buildProgressiveHint,
  getCatalogEntryForValues,
  selectCatalogEntry,
  describeDifficulty,
  getCatalogSummary: () => BRUTEFORCE_CATALOG,
  summarizeSubmittedExpression,
  canonicalExpression,
  getMaxCorrectPerRound: () => MAX_CORRECT_PER_ROUND,
  startMusicLoop,
  stopMusicLoop,
};

startGame();
