// TradingView init
let tvWidget;
function initTradingView(symbolTv) {
  if (tvWidget && tvWidget.remove) tvWidget.remove();
  tvWidget = new TradingView.widget({
    width: "100%",
    height: "100%",
    symbol: symbolTv,
    interval: "1",
    timezone: "Etc/UTC",
    theme: "dark",
    style: "1",
    locale: "en",
    toolbar_bg: "#020617",
    enable_publishing: false,
    hide_legend: false,
    save_image: false,
    container_id: "tv_chart_container"
  });
}

const INITIAL_WALLET_BALANCE = 1000;
const PRICE_HISTORY_LIMIT  = 120;
const FETCH_INTERVAL_MS    = 3000;

let currentSymbol   = "BTCUSDT";
let currentTvSymbol = "BINANCE:BTCUSDT.P";
let currentBaseCoin = "BTC";

let walletBalance = INITIAL_WALLET_BALANCE;
let usedMargin    = 0;
let currentPrice  = null;

const priceHistory    = [];
const priceStrHistory = [];

let longPositions  = [];
let shortPositions = [];
let nextPosId      = 1;

let liveAutoEnabled = false;

const priceEl        = document.getElementById("price");
const priceUpdatedEl = document.getElementById("price-updated");

const walletBalanceEl = document.getElementById("wallet-balance");
const usedMarginEl    = document.getElementById("used-margin");
const availMarginEl   = document.getElementById("avail-margin");
const totalPnlEl      = document.getElementById("total-pnl");
const totalRoeEl      = document.getElementById("total-roe");

const longPosEl  = document.getElementById("long-pos");
const shortPosEl = document.getElementById("short-pos");
const longPnlEl  = document.getElementById("long-pnl");
const shortPnlEl = document.getElementById("short-pnl");

const qtyInput       = document.getElementById("qty-input");
const levSelect      = document.getElementById("lev-select");
const marginHintEl   = document.getElementById("margin-hint");
const openLongBtn    = document.getElementById("open-long-btn");
const openShortBtn   = document.getElementById("open-short-btn");
const closeLongBtn   = document.getElementById("close-long-btn");
const closeShortBtn  = document.getElementById("close-short-btn");
const orderMessageEl = document.getElementById("order-message");
const ordersListEl   = document.getElementById("orders-list");

const scalpHintEl      = document.getElementById("scalp-hint");
const scalpVolHintEl   = document.getElementById("scalp-vol-hint");
const scalpRangeHintEl = document.getElementById("scalp-range-hint");
const shortHintEl      = document.getElementById("short-hint");
const longHintEl       = document.getElementById("long-hint");
const vHintEl          = document.getElementById("v-hint");

const symbolSelect    = document.getElementById("symbol-select");
const pairTitle       = document.getElementById("pair-title");
const symbolSearch    = document.getElementById("symbol-search");
const symbolSearchBtn = document.getElementById("symbol-search-btn");

const autoStrategySelect = document.getElementById("auto-strategy");
const autoBetBtn         = document.getElementById("auto-bet-btn");
const startLiveBtn       = document.getElementById("start-live-btn");
const stopLiveBtn        = document.getElementById("stop-live-btn");
const liveStrategyBox    = document.getElementById("live-strategy-box");

const fmtUsdtShort = x =>
  Number(x).toLocaleString("en-US", { maximumFractionDigits: 2 });

function renderWallet(totalUnrealized = 0) {
  walletBalanceEl.textContent = fmtUsdtShort(walletBalance) + " USDT";
  usedMarginEl.textContent    = fmtUsdtShort(usedMargin) + " USDT";
  const avail = walletBalance - usedMargin;
  availMarginEl.textContent   = fmtUsdtShort(avail) + " USDT";

  totalPnlEl.textContent =
    (totalUnrealized >= 0 ? "+" : "") + fmtUsdtShort(totalUnrealized) + " USDT";
  totalPnlEl.className =
    "balance-value " + (totalUnrealized > 0 ? "pnl-positive" : totalUnrealized < 0 ? "pnl-negative" : "");

  const roe = usedMargin > 0 ? (totalUnrealized / usedMargin) * 100 : 0;
  totalRoeEl.textContent = roe.toFixed(2) + " %";
}

function addFillRow(side, qty, priceStr, strategyTag, extraLabel) {
  if (
    ordersListEl.children.length === 1 &&
    ordersListEl.children[0].querySelector(".muted")
  ) {
    ordersListEl.innerHTML = "";
  }
  const row = document.createElement("div");
  row.className = "order-row";

  const left = document.createElement("span");
  const stratText = strategyTag ? ` · [${strategyTag}]` : "";
  const extra = extraLabel ? ` · ${extraLabel}` : "";
  left.innerHTML =
    `<span class="${side === "long" ? "order-side-long" : "order-side-short"}">` +
    `${side === "long" ? "BUY" : "SELL"}</span> · ${qty.toFixed(6)} ${currentBaseCoin}${stratText}${extra}`;

  const right = document.createElement("span");
  right.textContent = currentSymbol + " @ " + priceStr + " USDT";

  row.appendChild(left);
  row.appendChild(right);
  ordersListEl.prepend(row);
}

const resetHints = () => {
  scalpHintEl.textContent      = "Scalping: waiting for data…";
  scalpVolHintEl.textContent   = "Scalping (volatility): waiting for data…";
  scalpRangeHintEl.textContent = "Scalping (range): waiting for range data…";
  shortHintEl.textContent      = "Short-term: waiting for data…";
  longHintEl.textContent       = "Long-term: waiting for data…";
  vHintEl.textContent =
    "V strategy: recent price me sharp V bottom ya inverted V top detect hote hi bounce/dump reversal ka idea deta hai.";
};

const getChangePct = windowSize => {
  if (priceHistory.length < 2) return null;
  const len        = priceHistory.length;
  const startIndex = Math.max(0, len - windowSize);
  const first      = priceHistory[startIndex];
  const last       = priceHistory[len - 1];
  if (!first || !last) return null;
  return ((last - first) / first) * 100;
};

const getScalpStats = (windowSize = 20) => {
  const len = priceHistory.length;
  if (len < windowSize + 1) return null;
  const start = len - windowSize - 1;
  const slice = priceHistory.slice(start);

  const first = slice[0];
  const last  = slice[slice.length - 1];
  const changePct = ((last - first) / first) * 100;

  let sumAbs = 0;
  for (let i = 1; i < slice.length; i++) {
    const diffPct = Math.abs((slice[i] - slice[i-1]) / slice[i-1] * 100);
    sumAbs += diffPct;
  }
  const avgStep = sumAbs / (slice.length - 1);
  return { changePct, avgStep };
};

// Tuned + smoothed V / inverted V detector
function detectVPattern(opts = {}) {
  const windowSize  = opts.windowSize  || 20;
  const minMovePct  = opts.minMovePct  || 0.0075;
  const symTolPct   = opts.symTolPct   || 0.003;
  const minBarsSide = opts.minBarsSide || 3;

  const len = priceHistory.length;
  if (len < windowSize) return null;

  const slice = priceHistory.slice(len - windowSize);
  const n = slice.length;

  let minIdx = 0, maxIdx = 0;
  for (let i = 1; i < n; i++) {
    if (slice[i] < slice[minIdx]) minIdx = i;
    if (slice[i] > slice[maxIdx]) maxIdx = i;
  }

  const first  = slice[0];
  const last   = slice[n - 1];
  const midMin = slice[minIdx];
  const midMax = slice[maxIdx];

  const centerZone = i => i > n * 0.30 && i < n * 0.70;
  const hasEnoughBars = idx =>
    idx >= minBarsSide && (n - 1 - idx) >= minBarsSide;

  if (hasEnoughBars(minIdx) && centerZone(minIdx)) {
    const leftDrop  = (midMin - first) / first;
    const rightRise = (last - midMin) / midMin;
    const vDropOk   = leftDrop <= -minMovePct;
    const vRiseOk   = rightRise >=  minMovePct;
    const vSymmetry = Math.abs(Math.abs(leftDrop) - Math.abs(rightRise)) <= symTolPct;
    if (vDropOk && vRiseOk && vSymmetry) {
      return { type: "V", direction: "long", strength: Math.abs(leftDrop) + Math.abs(rightRise) };
    }
  }

  if (hasEnoughBars(maxIdx) && centerZone(maxIdx)) {
    const leftRise  = (midMax - first) / first;
    const rightDrop = (last - midMax) / midMax;
    const invRiseOk   = leftRise >=  minMovePct;
    const invDropOk   = rightDrop <= -minMovePct;
    const invSymmetry = Math.abs(Math.abs(leftRise) - Math.abs(rightDrop)) <= symTolPct;
    if (invRiseOk && invDropOk && invSymmetry) {
      return { type: "invertedV", direction: "short", strength: Math.abs(leftRise) + Math.abs(rightDrop) };
    }
  }
  return null;
}

const updateScalpHintBasic = () => {
  const scalpChange = getChangePct(15);
  if (scalpChange == null) {
    scalpHintEl.textContent = "Scalping: waiting for data…";
  } else if (scalpChange <= -0.15 && scalpChange > -0.8) {
    scalpHintEl.textContent =
      "Scalping: Chhota dip, BUY scalp 5–10 min ke liye consider kar sakte ho.";
  } else if (scalpChange <= -0.8) {
    scalpHintEl.textContent =
      "Scalping: Strong dump, sirf experienced ho to BUY scalp with tight SL.";
  } else if (scalpChange >= 0.15 && scalpChange < 0.8) {
    scalpHintEl.textContent =
      "Scalping: Chhota pump, SHORT scalp 5–10 min ke liye socho.";
  } else if (scalpChange >= 0.8) {
    scalpHintEl.textContent =
      "Scalping: Strong pump, aggressive SHORT scalp possible but high risk.";
  } else {
    scalpHintEl.textContent =
      "Scalping: Bilkul flat, entry force mat karo.";
  }
};

const updateScalpVolHint = () => {
  const stats = getScalpStats(20);
  if (!stats) {
    scalpVolHintEl.textContent = "Scalping (volatility): waiting for data…";
    return;
  }
  const { changePct, avgStep } = stats;

  const highVol = avgStep > 0.25;
  const midVol  = avgStep > 0.1 && avgStep <= 0.25;

  if (!midVol && !highVol) {
    scalpVolHintEl.textContent =
      "Scalping (volatility): Volatility low; clear setup ka wait karo, random entries avoid karo.";
    return;
  }

  if (changePct > 0.4 && highVol) {
    scalpVolHintEl.textContent =
      "Scalping (volatility): Strong up move + high volatility; sirf pullback pe small BUY scalp 3–10 min, tight SL.";
  } else if (changePct > 0.2 && midVol) {
    scalpVolHintEl.textContent =
      "Scalping (volatility): Mild uptrend + decent volatility; pullback/support pe BUY scalp.";
  } else if (changePct < -0.4 && highVol) {
    scalpVolHintEl.textContent =
      "Scalping (volatility): Strong dump + high volatility; bounce pe SHORT scalp, SL recent high ke upar.";
  } else if (changePct < -0.2 && midVol) {
    scalpVolHintEl.textContent =
      "Scalping (volatility): Mild downtrend; chhote bounce pe SHORT scalp, profit jaldi book karo.";
  } else {
    scalpVolHintEl.textContent =
      "Scalping (volatility): Direction mixed; sirf extremes (support/resistance) pe scalp socho ya wait karo.";
  }
};

const updateScalpRangeHint = () => {
  const len = priceHistory.length;
  const windowSize = 40;
  if (len < windowSize) {
    scalpRangeHintEl.textContent = "Scalping (range): waiting for range data…";
    return;
  }
  const slice = priceHistory.slice(len - windowSize);
  let minP = slice[0], maxP = slice[0];
  for (let i = 1; i < slice.length; i++) {
    if (slice[i] < minP) minP = slice[i];
    if (slice[i] > maxP) maxP = slice[i];
  }
  const range = maxP - minP;
  if (range <= 0 || !currentPrice) {
    scalpRangeHintEl.textContent =
      "Scalping (range): Range clear nahi; strong trend ya flat zone.";
    return;
  }

  const distFromLow  = (currentPrice - minP) / range;
  const distFromHigh = (maxP - currentPrice) / range;

  const shortChange = getChangePct(40);
  const longChange  = getChangePct(80);

  const isUpTrend   = shortChange !== null && longChange !== null &&
                      shortChange > 0 && longChange >= 0;
  const isDownTrend = shortChange !== null && longChange !== null &&
                      shortChange < 0 && longChange <= 0;

  if (distFromLow <= 0.2) {
    if (isUpTrend) {
      scalpRangeHintEl.textContent =
        "Scalping (range): Price recent range ke bottom ke paas + trend up; yahan se chhota BUY scalp idea banta hai.";
    } else {
      scalpRangeHintEl.textContent =
        "Scalping (range): Range bottom ke paas; aggressive long scalp possible, lekin trend strong nahi, SL tight rakho.";
    }
  } else if (distFromHigh <= 0.2) {
    if (isDownTrend) {
      scalpRangeHintEl.textContent =
        "Scalping (range): Price recent range ke top ke paas + trend down; yahan se SHORT scalp idea banta hai.";
    } else {
      scalpRangeHintEl.textContent =
        "Scalping (range): Range top ke paas; aggressive short scalp possible, lekin trend strong nahi, SL tight rakho.";
    }
  } else {
    scalpRangeHintEl.textContent =
      "Scalping (range): Price range ke beech me; better hai bottom/top ke paas ka wait karo.";
  }
};

const updateShortLongHints = () => {
  const shortChange = getChangePct(40);
  const longChange  = getChangePct(80);

  if (shortChange == null) {
    shortHintEl.textContent = "Short-term: waiting for data…";
  } else if (shortChange > 1.0) {
    shortHintEl.textContent =
      "Short-term: Strong up move; pullback ka wait karo 1–4 ghante ke liye.";
  } else if (shortChange < -1.0) {
    shortHintEl.textContent =
      "Short-term: Dump hua; oversold bounce ke liye gradual BUY plan kar sakte ho.";
  } else {
    shortHintEl.textContent =
      "Short-term: Sideways; range trading ya patience better hai.";
  }

  if (longChange == null) {
    longHintEl.textContent = "Long-term: waiting for data…";
  } else if (longChange > 3) {
    longHintEl.textContent =
      "Long-term: Structure bullish; fresh SHORT avoid karo, dips pe accumulation better.";
  } else if (longChange < -3) {
    longHintEl.textContent =
      "Long-term: Strong correction; DCA / gradual BUY plan sahi ho sakta hai.";
  } else {
    longHintEl.textContent =
      "Long-term: Normal range; existing position manage karo, new big bet avoid.";
  }
};

const updateHints = () => {
  updateScalpHintBasic();
  updateScalpVolHint();
  updateScalpRangeHint();
  updateShortLongHints();

  const vRes = detectVPattern();
  if (!vRes) {
    vHintEl.textContent =
      "V strategy: फिलहाल clear V ya inverted V nahi dikh raha, pattern ka wait karo.";
  } else if (vRes.type === "V") {
    vHintEl.textContent =
      "V strategy: Fresh V-bottom type pattern, bounce ke liye long side zyada strong lag raha hai.";
  } else {
    vHintEl.textContent =
      "V strategy: Inverted V-top type pattern, dump ke liye short side zyada strong lag raha hai.";
  }
};

async function fetchPrice() {
  try {
    const base = currentSymbol.replace(".P","").replace("_PERP","");
    const endpoint = "https://fapi.binance.com/fapi/v1/ticker/price?symbol=" + base;
    const res  = await fetch(endpoint);
    const data = await res.json();
    currentPrice = parseFloat(data.price);

    const priceStr = data.price;
    priceEl.textContent = priceStr + " USDT";

    const now = new Date();
    priceUpdatedEl.textContent = "Last update: " + now.toLocaleTimeString();

    priceHistory.push(currentPrice);
    priceStrHistory.push(priceStr);
    if (priceHistory.length > PRICE_HISTORY_LIMIT) {
      priceHistory.shift();
      priceStrHistory.shift();
    }

    updatePnL();
    updateHints();
    updateMarginPreview();
    liveAutoStep();
  } catch (err) {
    console.error(err);
    priceUpdatedEl.textContent =
      "Failed to fetch price (maybe invalid symbol or network).";
  }
}

function updatePnL() {
  if (!currentPrice) {
    renderWallet(0);
    return;
  }

  let totalUnrealizedLong  = 0;
  let totalUnrealizedShort = 0;

  if (longPositions.length) {
    let parts = [];
    longPositions.forEach(pos => {
      const diff = currentPrice - pos.entry;
      const pnl  = diff * pos.qty * pos.lev;
      totalUnrealizedLong += pnl;

      const pnlText = (pnl >= 0 ? "+" : "") + fmtUsdtShort(pnl);
      const pnlClass = pnl > 0 ? "pnl-positive" : pnl < 0 ? "pnl-negative" : "";
      parts.push(
        `#${pos.id}: ${pos.qty.toFixed(6)} ${currentBaseCoin} @ ${fmtUsdtShort(pos.entry)} · ` +
        `<span class="${pnlClass}">${pnlText} USDT</span>`
      );
    });
    longPosEl.innerHTML = parts.join("<br>");
    longPnlEl.textContent =
      "Total PnL (longs): " + (totalUnrealizedLong >= 0 ? "+" : "") + fmtUsdtShort(totalUnrealizedLong) + " USDT";
    longPnlEl.className =
      "muted " + (totalUnrealizedLong > 0 ? "pnl-positive" : totalUnrealizedLong < 0 ? "pnl-negative" : "");
  } else {
    longPosEl.textContent = "No long position.";
    longPnlEl.textContent = "PnL: --";
    longPnlEl.className   = "muted";
  }

  if (shortPositions.length) {
    let parts = [];
    shortPositions.forEach(pos => {
      const diff = pos.entry - currentPrice;
      const pnl  = diff * pos.qty * pos.lev;
      totalUnrealizedShort += pnl;

      const pnlText = (pnl >= 0 ? "+" : "") + fmtUsdtShort(pnl);
      const pnlClass = pnl > 0 ? "pnl-positive" : pnl < 0 ? "pnl-negative" : "";
      parts.push(
        `#${pos.id}: ${pos.qty.toFixed(6)} ${currentBaseCoin} @ ${fmtUsdtShort(pos.entry)} · ` +
        `<span class="${pnlClass}">${pnlText} USDT</span>`
      );
    });
    shortPosEl.innerHTML = parts.join("<br>");
    shortPnlEl.textContent =
      "Total PnL (shorts): " + (totalUnrealizedShort >= 0 ? "+" : "") + fmtUsdtShort(totalUnrealizedShort) + " USDT";
    shortPnlEl.className =
      "muted " + (totalUnrealizedShort > 0 ? "pnl-positive" : totalUnrealizedShort < 0 ? "pnl-negative" : "");
  } else {
    shortPosEl.textContent = "No short position.";
    shortPnlEl.textContent = "PnL: --";
    shortPnlEl.className   = "muted";
  }

  renderWallet(totalUnrealizedLong + totalUnrealizedShort);
}

function updateMarginPreview() {
  const amountUsdt = parseFloat(qtyInput.value || "0");
  const lev = parseFloat(levSelect.value || "1");
  if (!currentPrice || !amountUsdt || amountUsdt <= 0 || !lev) {
    marginHintEl.textContent = "Enter USDT amount, we auto-calc size.";
    return;
  }
  const qty = amountUsdt / currentPrice;
  const needed = (qty * currentPrice) / lev;
  marginHintEl.textContent =
    `Size ≈ ${qty.toFixed(6)} ${currentBaseCoin} · Margin ≈ ${fmtUsdtShort(needed)} USDT`;
}

qtyInput.addEventListener("input", updateMarginPreview);
levSelect.addEventListener("change", updateMarginPreview);

function openPosition(side, strategyTag) {
  orderMessageEl.textContent = "";
  if (!currentPrice) {
    orderMessageEl.textContent = "Price not loaded yet.";
    return;
  }
  const amountUsdt = parseFloat(qtyInput.value);
  const lev = parseFloat(levSelect.value || "1");
  if (!amountUsdt || amountUsdt <= 0) {
    orderMessageEl.textContent = "Enter a valid USDT amount.";
    return;
  }

  const qty = amountUsdt / currentPrice;
  const marginNeeded = (qty * currentPrice) / lev;
  const avail        = walletBalance - usedMargin;
  if (marginNeeded > avail) {
    orderMessageEl.textContent = "Not enough margin available.";
    return;
  }

  const pos = {
    id: nextPosId++,
    qty,
    entry: currentPrice,
    lev,
    strategy: strategyTag || "manual"
  };

  if (side === "long") longPositions.push(pos);
  else shortPositions.push(pos);

  usedMargin += marginNeeded;
  const lastPriceStr =
    priceStrHistory[priceStrHistory.length - 1] || currentPrice.toString();
  addFillRow(side, qty, lastPriceStr, (strategyTag || "manual") + ` #${pos.id}`, "opened");
  orderMessageEl.textContent =
    `${side.toUpperCase()} #${pos.id} ${qty.toFixed(6)} ${currentBaseCoin} opened (${strategyTag || "manual"}).`;

  qtyInput.value = "";
  updateMarginPreview();
  updatePnL();
}

function closePosition(side) {
  orderMessageEl.textContent = "";
  if (!currentPrice) {
    orderMessageEl.textContent = "Price not loaded yet.";
    return;
  }

  if (side === "long" && longPositions.length) {
    let msgParts = [];
    longPositions.forEach(pos => {
      const diff   = currentPrice - pos.entry;
      const pnl    = diff * pos.qty * pos.lev;
      const margin = (pos.qty * pos.entry) / pos.lev;
      walletBalance += pnl;
      usedMargin    -= margin;
      const lastPriceStr =
        priceStrHistory[priceStrHistory.length - 1] || currentPrice.toString();
      const extra = `closed #${pos.id}`;
      addFillRow("long", pos.qty, lastPriceStr, pos.strategy || "close", extra);
      msgParts.push(
        `#${pos.id}: ${(pnl >= 0 ? "+" : "")}${fmtUsdtShort(pnl)} USDT`
      );
    });
    longPositions = [];
    orderMessageEl.textContent =
      "Closed LONG positions → " + msgParts.join(" | ");
  }

  if (side === "short" && shortPositions.length) {
    let msgParts = [];
    shortPositions.forEach(pos => {
      const diff   = pos.entry - currentPrice;
      const pnl    = diff * pos.qty * pos.lev;
      const margin = (pos.qty * pos.entry) / pos.lev;
      walletBalance += pnl;
      usedMargin    -= margin;
      const lastPriceStr =
        priceStrHistory[priceStrHistory.length - 1] || currentPrice.toString();
      const extra = `closed #${pos.id}`;
      addFillRow("short", pos.qty, lastPriceStr, pos.strategy || "close", extra);
      msgParts.push(
        `#${pos.id}: ${(pnl >= 0 ? "+" : "")}${fmtUsdtShort(pnl)} USDT`
      );
    });
    shortPositions = [];
    orderMessageEl.textContent =
      "Closed SHORT positions → " + msgParts.join(" | ");
  }

  updatePnL();
}

openLongBtn.addEventListener("click", () => openPosition("long", "manual"));
openShortBtn.addEventListener("click", () => openPosition("short", "manual"));
closeLongBtn.addEventListener("click", () => closePosition("long"));
closeShortBtn.addEventListener("click", () => closePosition("short"));

function pickSideFromText(txt) {
  txt = (txt || "").toLowerCase();
  if (txt.includes("buy") || txt.includes("long")) return "long";
  if (txt.includes("short")) return "short";
  return null;
}

function decideAutoFromHints() {
  const hintScalp     = scalpHintEl.textContent || "";
  const hintScalpVol  = scalpVolHintEl.textContent || "";
  const hintRange     = scalpRangeHintEl.textContent || "";
  const hintShortTerm = shortHintEl.textContent || "";
  const hintLongTerm  = longHintEl.textContent || "";

  const candidates = [
    { text: hintRange,     tag: "Scalping range" },
    { text: hintScalpVol,  tag: "Scalping vol" },
    { text: hintScalp,     tag: "Scalping" },
    { text: hintShortTerm, tag: "Short term" },
    { text: hintLongTerm,  tag: "Long term" }
  ];

  for (const c of candidates) {
    const side = pickSideFromText(c.text);
    if (side) return { side, tag: c.tag };
  }
  return null;
}

function decideFromSingleStrategy(strategyKey) {
  let txt = "";
  if (strategyKey === "scalp") txt = scalpHintEl.textContent;
  if (strategyKey === "scalpVol") txt = scalpVolHintEl.textContent;
  if (strategyKey === "scalpRange") txt = scalpRangeHintEl.textContent;
  if (strategyKey === "shortTerm") txt = shortHintEl.textContent;
  if (strategyKey === "longTerm") txt = longHintEl.textContent;

  if (strategyKey === "vStrategy") {
    const vRes = detectVPattern();
    if (!vRes || !vRes.strength || vRes.strength < 0.02) {
      return null;
    }
    return {
      side: vRes.direction === "long" ? "long" : "short",
      tag: vRes.type === "V" ? "V strategy" : "Inverted V strategy"
    };
  }

  const side = pickSideFromText(txt);
  if (!side) return null;

  const map = {
    scalp: "Scalping",
    scalpVol: "Scalping vol",
    scalpRange: "Scalping range",
    shortTerm: "Short term",
    longTerm: "Long term",
    vStrategy: "V strategy"
  };
  return { side, tag: map[strategyKey] || "auto" };
}

autoBetBtn.addEventListener("click", () => {
  if (!currentPrice) {
    orderMessageEl.textContent = "Price not loaded yet.";
    return;
  }

  const amountUsdt = parseFloat(qtyInput.value);
  if (!amountUsdt || amountUsdt <= 0) {
    orderMessageEl.textContent = "Enter a valid USDT amount first.";
    return;
  }

  let side, tag;
  const selected = autoStrategySelect.value;

  if (selected === "auto") {
    const result = decideAutoFromHints();
    if (!result) {
      orderMessageEl.textContent = "Hints se clear direction nahi; auto bet skip.";
      return;
    }
    side = result.side;
    tag  = result.tag;
  } else {
    const res = decideFromSingleStrategy(selected);
    if (!res) {
      orderMessageEl.textContent = "Is strategy (including V strategy) me clear signal nahi; auto bet skip.";
      return;
    }
    side = res.side;
    tag  = res.tag;
  }

  openPosition(side, tag);
});

function checkAutoClosePositions() {
  if (!currentPrice) return;

  if (longPositions.length) {
    const remaining = [];
    let msgParts = [];
    longPositions.forEach(pos => {
      const diffPct = (currentPrice - pos.entry) / pos.entry * 100;
      if (diffPct >= 0.5 || diffPct <= -0.5) {
        const pnl    = diffPct / 100 * pos.entry * pos.qty * pos.lev;
        const margin = (pos.qty * pos.entry) / pos.lev;
        walletBalance += pnl;
        usedMargin    -= margin;
        const lastPriceStr =
          priceStrHistory[priceStrHistory.length - 1] || currentPrice.toString();
        const flag = diffPct >= 0.5 ? "TP" : "SL";
        const extra = `${flag} #${pos.id}`;
        addFillRow("long", pos.qty, lastPriceStr, pos.strategy || "auto", extra);
        msgParts.push(`#${pos.id} ${flag} ${pnl >= 0 ? "+" : ""}${fmtUsdtShort(pnl)}`);
      } else {
        remaining.push(pos);
      }
    });
    longPositions = remaining;
    if (msgParts.length) {
      orderMessageEl.textContent = "Auto close longs: " + msgParts.join(" | ");
    }
  }

  if (shortPositions.length) {
    const remaining = [];
    let msgParts = [];
    shortPositions.forEach(pos => {
      const diffPct = (pos.entry - currentPrice) / pos.entry * 100;
      if (diffPct >= 0.5 || diffPct <= -0.5) {
        const pnl    = diffPct / 100 * pos.entry * pos.qty * pos.lev;
        const margin = (pos.qty * pos.entry) / pos.lev;
        walletBalance += pnl;
        usedMargin    -= margin;
        const lastPriceStr =
          priceStrHistory[priceStrHistory.length - 1] || currentPrice.toString();
        const flag = diffPct >= 0.5 ? "TP" : "SL";
        const extra = `${flag} #${pos.id}`;
        addFillRow("short", pos.qty, lastPriceStr, pos.strategy || "auto", extra);
        msgParts.push(`#${pos.id} ${flag} ${pnl >= 0 ? "+" : ""}${fmtUsdtShort(pnl)}`);
      } else {
        remaining.push(pos);
      }
    });
    shortPositions = remaining;
    if (msgParts.length) {
      orderMessageEl.textContent +=
        (orderMessageEl.textContent ? " || " : "Auto close shorts: ") + msgParts.join(" | ");
    }
  }

  updatePnL();
}

function getCheckedLiveKeys() {
  const inputs = liveStrategyBox.querySelectorAll("input[type='checkbox']");
  const selected = [];
  inputs.forEach(i => {
    if (i.checked) selected.push(i.value);
  });
  return selected;
}

function liveAutoStep() {
  if (!liveAutoEnabled || !currentPrice) return;

  if (priceHistory.length > 1) {
    const lastIdx = priceHistory.length - 1;
    const last2   = priceHistory[lastIdx - 1];
    const last1   = priceHistory[lastIdx];
    const smallMove = Math.abs((last1 - last2) / last2) < 0.0005;
    if (smallMove && (longPositions.length || shortPositions.length)) {
      checkAutoClosePositions();
      return;
    }
  }

  checkAutoClosePositions();

  const selectedKeys = getCheckedLiveKeys();
  if (!selectedKeys.length) {
    orderMessageEl.textContent = "Live auto: koi strategy tick nahi hai, step skip.";
    return;
  }

  let amountUsdt = parseFloat(qtyInput.value);
  if (!amountUsdt || amountUsdt <= 0) {
    amountUsdt = 50;
    qtyInput.value = amountUsdt;
    updateMarginPreview();
  }
  const qty = amountUsdt / currentPrice;
  const lev = parseFloat(levSelect.value || "10");
  const marginNeeded = (qty * currentPrice) / lev;
  const avail = walletBalance - usedMargin;
  if (marginNeeded > avail) {
    orderMessageEl.textContent = "Live auto: not enough margin, skipping step.";
    return;
  }

  let votesLong = 0;
  let votesShort = 0;
  let tagsUsed = [];

  for (const key of selectedKeys) {
    let res;
    if (key === "auto") {
      res = decideAutoFromHints();
    } else {
      res = decideFromSingleStrategy(key);
    }
    if (!res) continue;
    if (res.side === "long") votesLong++;
    if (res.side === "short") votesShort++;
    if (tagsUsed.indexOf(res.tag) === -1) tagsUsed.push(res.tag);
  }

  if (votesLong === 0 && votesShort === 0) {
    orderMessageEl.textContent = "Live auto: selected strategies me clear long/short nahi.";
    return;
  }

  let finalSide;
  if (votesLong > votesShort) finalSide = "long";
  else if (votesShort > votesLong) finalSide = "short";
  else {
    orderMessageEl.textContent = "Live auto: strategies equal long vs short, skip step.";
    return;
  }

  const tag = "Live " + tagsUsed.join("+");
  openPosition(finalSide, tag);
}

startLiveBtn.addEventListener("click", () => {
  if (liveAutoEnabled) return;
  liveAutoEnabled = true;
  orderMessageEl.textContent = "Live auto trade started.";
});

stopLiveBtn.addEventListener("click", () => {
  liveAutoEnabled = false;
  orderMessageEl.textContent = "Live auto trade stopped.";
});

const parseUserSymbolInput = raw => {
  if (!raw) return null;
  let s = raw.trim();

  if (s.startsWith("http")) {
    try {
      const url = new URL(s);
      const tvParam = url.searchParams.get("tvwidgetsymbol");
      if (tvParam) {
        const parts = tvParam.split(":");
        return parts[parts.length - 1].toUpperCase();
      }
      const symbolParam = url.searchParams.get("symbol");
      if (symbolParam) {
        const parts = symbolParam.split(":");
        return parts[parts.length - 1].toUpperCase();
      }
    } catch {}
  }

  s = s.toUpperCase().replace(/\s+/g,"").replace("/","");
  if (!s.endsWith("USDT") && !s.endsWith("USDT.P")) s = s + "USDT.P";
  return s;
};

const updateSymbol = symbol => {
  currentSymbol   = symbol;
  currentTvSymbol = "BINANCE:" + symbol.replace(".P","") + ".P";
  currentBaseCoin = symbol.replace("USDT.P","").replace("USDT","");

  pairTitle.textContent = currentBaseCoin + "/USDT Perp Price";

  let matched = false;
  for (const opt of symbolSelect.options) {
    if (opt.value === symbol.replace(".P","")) {
      symbolSelect.value = opt.value;
      matched = true;
      break;
    }
  }
  if (!matched) symbolSelect.value = "BTCUSDT";

  currentPrice = null;
  priceHistory.length    = 0;
  priceStrHistory.length = 0;
  resetHints();
  renderWallet(0);
  initTradingView(currentTvSymbol);
  fetchPrice();
};

symbolSelect.addEventListener("change", () => {
  updateSymbol(symbolSelect.value + ".P");
});

symbolSearchBtn.addEventListener("click", () => {
  const parsed = parseUserSymbolInput(symbolSearch.value);
  if (!parsed) {
    orderMessageEl.textContent =
      "Symbol ya valid TradingView link paste karo (e.g. BTCUSDT.P).";
    return;
  }
  orderMessageEl.textContent = "";
  updateSymbol(parsed);
});

symbolSearch.addEventListener("keydown", e => {
  if (e.key === "Enter") symbolSearchBtn.click();
});

renderWallet(0);
resetHints();
initTradingView(currentTvSymbol);
fetchPrice();
setInterval(fetchPrice, FETCH_INTERVAL_MS);
