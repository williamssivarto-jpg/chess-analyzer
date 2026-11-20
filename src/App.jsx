import { useState, useRef, useEffect, useMemo } from 'react';
import { Chess } from 'chess.js';
import './App.css';
import { engineMove } from './engine';

// ================= CONFIG =================
const DIFFICULTIES = [
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
];
const TIME_CONTROLS = [
  { secs: 0, label: 'No clock' },
  { secs: 180, label: '3 min' },
  { secs: 300, label: '5 min' },
  { secs: 600, label: '10 min' },
];

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// Solid glyphs for both colours; CSS colours them. \uFE0E stops emoji rendering.
const GLYPHS = {
  k: '\u265A\uFE0E', q: '\u265B\uFE0E', r: '\u265C\uFE0E',
  b: '\u265D\uFE0E', n: '\u265E\uFE0E', p: '\u265F\uFE0E',
};
const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const colorName = (c) => (c === 'w' ? 'White' : 'Black');
const other = (c) => (c === 'w' ? 'b' : 'w');

// ================= ENGINE =================
// Stockfish runs in the browser (see engine.js), so the app works for anyone online.
function fetchEngineMove(fen, difficulty) {
  return engineMove(fen, difficulty);
}

// Accepts UCI ("e2e4", "e7e8q") or SAN ("Nf3") from the server.
function applyEngineMove(chess, move) {
  const m = String(move).trim();
  if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(m)) {
    const obj = { from: m.slice(0, 2).toLowerCase(), to: m.slice(2, 4).toLowerCase() };
    if (m[4]) obj.promotion = m[4].toLowerCase();
    return chess.move(obj);
  }
  return chess.move(m);
}

function describeEngineMove(fen, move) {
  const mv = applyEngineMove(new Chess(fen), move);
  return { from: mv.from, to: mv.to, promotion: mv.promotion, san: mv.san };
}

// ================= RULES HELPERS =================
function toMoveObj(m) {
  const o = { from: m.from, to: m.to };
  if (m.promotion) o.promotion = m.promotion;
  return o;
}

function buildPosition(startFen, moves, n) {
  const g = new Chess(startFen);
  for (let i = 0; i < n; i++) g.move(toMoveObj(moves[i]));
  return g;
}

function gameOverInfo(g) {
  if (g.isCheckmate()) {
    const winner = other(g.turn());
    return { winner, reason: 'Checkmate', score: winner === 'w' ? '1-0' : '0-1' };
  }
  if (g.isStalemate()) return { winner: null, reason: 'Stalemate', score: '½-½' };
  if (g.isInsufficientMaterial()) return { winner: null, reason: 'Insufficient material', score: '½-½' };
  if (g.isThreefoldRepetition()) return { winner: null, reason: 'Threefold repetition', score: '½-½' };
  if (g.isDraw()) return { winner: null, reason: '50-move rule', score: '½-½' };
  return null;
}

function resultFor(info, playerColor, final = false) {
  return {
    title: info.winner ? (info.winner === playerColor ? 'You won!' : 'You lost') : 'Draw',
    detail: info.winner ? `${info.reason} — ${colorName(info.winner)} wins` : info.reason,
    score: info.score,
    final,
  };
}

function findKing(g, color) {
  const board = g.board();
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p && p.type === 'k' && p.color === color) return FILES[f] + (8 - r);
    }
  return null;
}

// White material minus black material, from the board.
function materialBalance(g) {
  let score = 0;
  for (const row of g.board())
    for (const p of row) if (p) score += p.color === 'w' ? VALUES[p.type] : -VALUES[p.type];
  return score;
}

function capturedBy(history) {
  const out = { w: [], b: [] };
  for (const m of history) if (m.captured) out[m.color].push(m.captured);
  out.w.sort((a, b) => VALUES[b] - VALUES[a]);
  out.b.sort((a, b) => VALUES[b] - VALUES[a]);
  return out;
}

function formatClock(secs) {
  const s = Math.max(0, secs);
  const m = Math.floor(s / 60);
  if (s < 20) return `${m}:${(s % 60).toFixed(1).padStart(4, '0')}`;
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

// ================= COMPONENTS =================
function Board({ chess, orientation, selected, targets, lastMove, hint, handlers, children }) {
  const board = chess.board();
  const ranks = orientation === 'w' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = orientation === 'w' ? FILES : [...FILES].reverse();
  const checkSq = chess.isCheck() ? findKing(chess, chess.turn()) : null;

  return (
    <div className="board-wrap">
      <div className="board">
        {ranks.map((rank, ri) =>
          files.map((file, fi) => {
            const sq = file + rank;
            const fIdx = FILES.indexOf(file);
            const piece = board[8 - rank][fIdx];
            const cls = ['square', (fIdx + rank) % 2 === 0 ? 'light' : 'dark'];
            if (lastMove && (sq === lastMove.from || sq === lastMove.to)) cls.push('last');
            if (sq === selected) cls.push('selected');
            if (hint && (sq === hint.from || sq === hint.to)) cls.push('hint');
            if (sq === checkSq) cls.push('check');
            if (targets.includes(sq)) cls.push(piece ? 'capture' : 'dot');
            const draggable = !!piece && handlers.canDrag(piece.color);

            return (
              <div
                key={sq}
                className={cls.join(' ')}
                onClick={() => handlers.click(sq)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = e.dataTransfer.getData('text/plain');
                  if (from) handlers.drop(from, sq);
                }}
              >
                {fi === 0 && <span className="coord coord-rank">{rank}</span>}
                {ri === 7 && <span className="coord coord-file">{file}</span>}
                {piece && (
                  <span
                    className={`piece ${piece.color === 'w' ? 'white' : 'black'}`}
                    draggable={draggable}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', sq);
                      e.dataTransfer.effectAllowed = 'move';
                      handlers.dragStart(sq);
                    }}
                  >
                    {GLYPHS[piece.type]}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
      {children}
    </div>
  );
}

function PlayerBar({ name, color, captured, advantage, clock, showClock, active, thinking }) {
  return (
    <div className={`player-bar ${active ? 'active' : ''}`}>
      <div className="player-info">
        <span className={`avatar ${color === 'w' ? 'white' : 'black'}`}>{GLYPHS.k}</span>
        <div>
          <div className="player-name">
            {name}
            {thinking && <span className="thinking">thinking…</span>}
          </div>
          <div className="captured">
            {captured.map((t, i) => (
              <span key={i} className={`mini ${color === 'w' ? 'black' : 'white'}`}>{GLYPHS[t]}</span>
            ))}
            {advantage > 0 && <span className="adv">+{advantage}</span>}
          </div>
        </div>
      </div>
      {showClock && (
        <div className={`clock ${active ? 'running' : ''} ${clock < 20 ? 'low' : ''}`}>{formatClock(clock)}</div>
      )}
    </div>
  );
}

function MoveList({ moves, startFen, current, onSelect }) {
  const listRef = useRef(null);
  const startNo = parseInt(startFen.split(' ')[5], 10) || 1;
  const rows = [];
  let no = startNo;
  moves.forEach((m, i) => {
    if (m.color === 'w' || rows.length === 0) rows.push({ no, w: null, b: null });
    const row = rows[rows.length - 1];
    if (m.color === 'w') row.w = { m, i };
    else {
      row.b = { m, i };
      no++;
    }
  });

  useEffect(() => {
    const c = listRef.current;
    if (!c) return;
    const a = c.querySelector('.active');
    if (!a) {
      c.scrollTop = current < 0 ? 0 : c.scrollHeight;
      return;
    }
    if (a.offsetTop < c.scrollTop) c.scrollTop = a.offsetTop;
    else if (a.offsetTop + a.offsetHeight > c.scrollTop + c.clientHeight)
      c.scrollTop = a.offsetTop + a.offsetHeight - c.clientHeight;
  }, [current, moves.length]);

  const cell = (entry) =>
    entry ? (
      <span
        className={`move ${entry.i === current ? 'active' : ''} ${onSelect ? 'clickable' : ''}`}
        onClick={onSelect ? () => onSelect(entry.i) : undefined}
      >
        {entry.m.san}
      </span>
    ) : (
      <span className="move empty">…</span>
    );

  return (
    <div className="move-list" ref={listRef}>
      {rows.length === 0 && <div className="move-list-empty">No moves yet</div>}
      {rows.map((r) => (
        <div className="move-row" key={r.no}>
          <span className="move-no">{r.no}.</span>
          {cell(r.w)}
          {r.b ? cell(r.b) : <span className="move" />}
        </div>
      ))}
    </div>
  );
}

// ================= APP =================
export default function App() {
  // screens: 'setup' | 'play' | 'analyze'
  const [screen, setScreen] = useState('setup');

  // setup options
  const [setupColor, setSetupColor] = useState('w');
  const [difficulty, setDifficulty] = useState('medium');
  const [timeControl, setTimeControl] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [board, setBoard] = useState(() => {
    try { return localStorage.getItem('chess-board') || 'walnut'; } catch { return 'walnut'; }
  });
  useEffect(() => {
    document.documentElement.dataset.board = board;
    try { localStorage.setItem('chess-board', board); } catch { /* storage can be unavailable */ }
  }, [board]);

  // play state
  const gameRef = useRef(new Chess());
  const [fen, setFen] = useState(START_FEN);
  const [history, setHistory] = useState([]);
  const [gameStartFen, setGameStartFen] = useState(START_FEN);
  const [playerColor, setPlayerColor] = useState('w');
  const [orientation, setOrientation] = useState('w');
  const [clock, setClock] = useState({ w: 0, b: 0 });
  const [thinking, setThinking] = useState(false);
  const [result, setResult] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [hint, setHint] = useState(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const [engineRetry, setEngineRetry] = useState(0);
  const requestId = useRef(0);

  // shared UI state
  const [selected, setSelected] = useState(null);
  const [targets, setTargets] = useState([]);
  const [promotion, setPromotion] = useState(null); // { from, to, color }
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // analysis state
  const [pgnText, setPgnText] = useState('');
  const [pgnError, setPgnError] = useState('');
  const [analysis, setAnalysis] = useState(null); // { startFen, moves, original, headers }
  const [aIndex, setAIndex] = useState(0);
  const [aOrientation, setAOrientation] = useState('w');
  const [bestMove, setBestMove] = useState(null);
  const [bestLoading, setBestLoading] = useState(false);

  const audioRef = useRef(null);

  // ---------- small utilities ----------
  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 2500);
  };

  const playSound = (mv) => {
    if (!soundOn || !mv) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!audioRef.current) audioRef.current = new Ctx();
      const ctx = audioRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = /[+#]/.test(mv.san) ? 660 : mv.captured ? 240 : 420;
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.13);
    } catch {
      /* sound is optional */
    }
  };

  const clearSelection = () => {
    setSelected(null);
    setTargets([]);
  };

  const cancelEngine = () => {
    requestId.current++;
    setThinking(false);
  };

  const sync = () => {
    const g = gameRef.current;
    setFen(g.fen());
    setHistory(g.history({ verbose: true }));
  };

  // ---------- generic board interaction ----------
  const selectSquare = (chess, sq) => {
    const moves = chess.moves({ square: sq, verbose: true });
    setSelected(sq);
    setTargets([...new Set(moves.map((m) => m.to))]);
  };

  const attemptMove = (chess, from, to, commit) => {
    const moves = chess.moves({ square: from, verbose: true }).filter((m) => m.to === to);
    if (!moves.length) return false;
    clearSelection();
    if (moves.some((m) => m.promotion)) setPromotion({ from, to, color: moves[0].color });
    else commit({ from, to });
    return true;
  };

  const makeHandlers = (chess, allowed, commit) => ({
    canDrag: (color) => allowed(color),
    click: (sq) => {
      if (!allowed(chess.turn())) return;
      if (selected && sq === selected) return clearSelection();
      if (selected && targets.includes(sq)) return void attemptMove(chess, selected, sq, commit);
      const p = chess.get(sq);
      if (p && allowed(p.color)) selectSquare(chess, sq);
      else clearSelection();
    },
    dragStart: (sq) => {
      const p = chess.get(sq);
      if (p && allowed(p.color)) selectSquare(chess, sq);
    },
    drop: (from, to) => {
      if (from === to || !allowed(chess.turn())) return;
      if (!attemptMove(chess, from, to, commit)) clearSelection();
    },
  });

  // ================= PLAY MODE =================
  const afterMove = (mv) => {
    const g = gameRef.current;
    sync();
    clearSelection();
    setHint(null);
    playSound(mv);
    const info = gameOverInfo(g);
    if (info) {
      setResult(resultFor(info, playerColor));
      setShowResult(true);
    }
  };

  const commitPlayMove = (moveObj) => {
    const mv = gameRef.current.move(moveObj);
    afterMove(mv);
  };

  const resetPlayUi = () => {
    cancelEngine();
    setResult(null);
    setShowResult(false);
    setHint(null);
    setError('');
    setConfirmResign(false);
    setPromotion(null);
    clearSelection();
  };

  const startGame = (colorChoice, fromChess = null, startFen = START_FEN) => {
    const color = colorChoice === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : colorChoice;
    resetPlayUi();
    gameRef.current = fromChess || new Chess();
    setGameStartFen(startFen);
    setPlayerColor(color);
    setOrientation(color);
    setClock({ w: timeControl, b: timeControl });
    sync();
    setScreen('play');
  };

  // Engine replies whenever it's the computer's turn.
  useEffect(() => {
    if (screen !== 'play' || result) return;
    const g = gameRef.current;
    if (g.turn() === playerColor || g.isGameOver()) return;
    const id = ++requestId.current;
    setThinking(true);
    setError('');
    const started = Date.now();
    fetchEngineMove(g.fen(), difficulty)
      .then(async (move) => {
        const wait = 350 - (Date.now() - started); // brief pause so replies don't feel instant
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        if (id !== requestId.current) return;
        afterMove(applyEngineMove(g, move));
      })
      .catch((err) => {
        if (id === requestId.current) setError(err.message);
      })
      .finally(() => {
        if (id === requestId.current) setThinking(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, screen, playerColor, result, engineRetry]);

  // Clock ticks for the side to move (starts after the first move, like chess.com).
  useEffect(() => {
    if (screen !== 'play' || !timeControl || result || history.length === 0) return;
    let last = performance.now();
    const t = setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      const turn = gameRef.current.turn();
      setClock((c) => ({ ...c, [turn]: Math.max(0, c[turn] - dt) }));
    }, 100);
    return () => clearInterval(t);
  }, [screen, timeControl, result, history.length]);

  // Flag on time.
  useEffect(() => {
    if (screen !== 'play' || !timeControl || result) return;
    const flagged = ['w', 'b'].find((s) => clock[s] <= 0);
    if (!flagged) return;
    cancelEngine();
    const winner = other(flagged);
    setResult(resultFor({ winner, reason: 'Time out', score: winner === 'w' ? '1-0' : '0-1' }, playerColor, true));
    setShowResult(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock]);

  const canPlayerMove =
    screen === 'play' && !result && !thinking && !promotion && gameRef.current.turn() === playerColor;
  const canTakeBack = screen === 'play' && !result?.final && history.some((m) => m.color === playerColor);

  const takeBack = () => {
    if (!canTakeBack) return;
    const g = gameRef.current;
    resetPlayUi();
    g.undo();
    while (g.history().length && g.turn() !== playerColor) g.undo();
    sync();
  };

  const getHint = async () => {
    if (!canPlayerMove) return;
    const f = gameRef.current.fen();
    setHintLoading(true);
    setError('');
    try {
      const move = await fetchEngineMove(f, 'hard');
      if (gameRef.current.fen() === f) setHint(describeEngineMove(f, move));
    } catch (e) {
      setError(e.message);
    } finally {
      setHintLoading(false);
    }
  };

  const resign = () => {
    if (result) return;
    if (!confirmResign) {
      setConfirmResign(true);
      setTimeout(() => setConfirmResign(false), 3000);
      return;
    }
    setConfirmResign(false);
    cancelEngine();
    const winner = other(playerColor);
    setResult(resultFor({ winner, reason: 'Resignation', score: winner === 'w' ? '1-0' : '0-1' }, playerColor, true));
    setShowResult(true);
  };

  // Stockfish accepts a draw only if it isn't ahead on material and 10+ moves have been played.
  const offerDraw = () => {
    if (result) return;
    const g = gameRef.current;
    const bal = materialBalance(g);
    const computerAhead = playerColor === 'w' ? -bal : bal;
    const enoughMoves = g.history().length >= 20;
    if (enoughMoves && computerAhead <= 0) {
      cancelEngine();
      setResult(resultFor({ winner: null, reason: 'Draw by agreement', score: '½-½' }, playerColor, true));
      setShowResult(true);
    } else {
      flash(enoughMoves ? 'Stockfish declines the draw.' : 'Stockfish declines — too early for a draw.');
    }
  };

  const copyPgn = async () => {
    const g = gameRef.current;
    const setH = (k, v) => (g.setHeader ? g.setHeader(k, v) : g.header(k, v));
    const diffLabel = DIFFICULTIES.find((d) => d.id === difficulty)?.label;
    setH('Event', 'Chess Analyzer game');
    setH('Date', new Date().toISOString().slice(0, 10).replace(/-/g, '.'));
    setH('White', playerColor === 'w' ? 'You' : `Stockfish (${diffLabel})`);
    setH('Black', playerColor === 'b' ? 'You' : `Stockfish (${diffLabel})`);
    setH('Result', result ? result.score.replace('½-½', '1/2-1/2') : '*');
    try {
      await navigator.clipboard.writeText(g.pgn());
      flash('PGN copied to clipboard');
    } catch {
      flash("Couldn't access the clipboard");
    }
  };

  const reviewGame = () => {
    const moves = gameRef.current.history({ verbose: true });
    const diffLabel = DIFFICULTIES.find((d) => d.id === difficulty)?.label;
    openAnalysis({
      startFen: gameStartFen,
      moves,
      original: moves,
      headers: {
        White: playerColor === 'w' ? 'You' : `Stockfish (${diffLabel})`,
        Black: playerColor === 'b' ? 'You' : `Stockfish (${diffLabel})`,
        Result: result?.score,
      },
    }, moves.length, playerColor);
  };

  const goToSetup = () => {
    resetPlayUi();
    setScreen('setup');
  };

  // ================= ANALYSIS MODE =================
  const analysisChess = useMemo(
    () => (analysis ? buildPosition(analysis.startFen, analysis.moves, aIndex) : new Chess()),
    [analysis, aIndex]
  );

  const openAnalysis = (data, index = 0, orient = 'w') => {
    cancelEngine();
    clearSelection();
    setPromotion(null);
    setBestMove(null);
    setError('');
    setAnalysis(data);
    setAIndex(index);
    setAOrientation(orient);
    setScreen('analyze');
  };

  const loadPgn = () => {
    const g = new Chess();
    try {
      const ok = g.loadPgn(pgnText.trim());
      if (ok === false) throw new Error();
    } catch {
      setPgnError("Couldn't read that PGN. Check the notation and try again.");
      return;
    }
    setPgnError('');
    const headers = (g.getHeaders ? g.getHeaders() : g.header()) || {};
    const moves = g.history({ verbose: true });
    openAnalysis({ startFen: headers.FEN || START_FEN, moves, original: moves, headers }, 0);
  };

  const goTo = (i) => {
    if (!analysis) return;
    setAIndex(Math.max(0, Math.min(analysis.moves.length, i)));
    clearSelection();
    setPromotion(null);
    setBestMove(null);
  };

  const commitAnalysisMove = (moveObj) => {
    const g = buildPosition(analysis.startFen, analysis.moves, aIndex);
    const mv = g.move(moveObj);
    const next = analysis.moves[aIndex];
    if (!next || next.san !== mv.san) {
      setAnalysis({ ...analysis, moves: [...analysis.moves.slice(0, aIndex), mv] });
    }
    setAIndex(aIndex + 1);
    setBestMove(null);
    clearSelection();
    playSound(mv);
  };

  const divergeAt = analysis
    ? analysis.moves.findIndex((m, i) => !analysis.original[i] || analysis.original[i].san !== m.san)
    : -1;
  const inVariation = analysis && (divergeAt !== -1 || analysis.moves.length < analysis.original.length);

  const backToGameLine = () => {
    const point = divergeAt === -1 ? analysis.moves.length : divergeAt;
    setAnalysis({ ...analysis, moves: analysis.original });
    setAIndex(point);
    clearSelection();
    setBestMove(null);
  };

  const showBest = async () => {
    const f = analysisChess.fen();
    setBestLoading(true);
    setError('');
    try {
      const move = await fetchEngineMove(f, 'hard');
      setBestMove({ ...describeEngineMove(f, move), fen: f });
    } catch (e) {
      setError(e.message);
    } finally {
      setBestLoading(false);
    }
  };

  const playFromHere = (color) => {
    const g = buildPosition(analysis.startFen, analysis.moves, aIndex);
    startGame(color, g, analysis.startFen);
  };

  // Arrow keys step through the analysed game.
  useEffect(() => {
    if (screen !== 'analyze' || !analysis) return;
    const onKey = (e) => {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft') goTo(aIndex - 1);
      if (e.key === 'ArrowRight') goTo(aIndex + 1);
      if (e.key === 'ArrowUp') goTo(0);
      if (e.key === 'ArrowDown') goTo(analysis.moves.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, analysis, aIndex]);

  // ---------- promotion ----------
  const choosePromotion = (piece) => {
    const { from, to } = promotion;
    setPromotion(null);
    if (screen === 'play') commitPlayMove({ from, to, promotion: piece });
    else commitAnalysisMove({ from, to, promotion: piece });
  };

  const promotionPicker = promotion && (
    <div className="overlay">
      <div className="promo-box">
        <div className="promo-title">Promote to</div>
        <div className="promo-options">
          {['q', 'r', 'b', 'n'].map((t) => (
            <button key={t} className="promo-btn" onClick={() => choosePromotion(t)}>
              <span className={`piece ${promotion.color === 'w' ? 'white' : 'black'}`}>{GLYPHS[t]}</span>
            </button>
          ))}
        </div>
        <button className="btn small ghost" onClick={() => setPromotion(null)}>Cancel</button>
      </div>
    </div>
  );

  // ================= RENDER =================
  const header = (
    <header className="topbar">
      <div className="brand">
        <span className="brand-icon">{GLYPHS.n}</span> Chess Analyzer
      </div>
      <nav className="nav">
        <button
          className={`nav-btn ${screen !== 'analyze' ? 'active' : ''}`}
          onClick={() => setScreen(history.length > 0 && !result ? 'play' : 'setup')}
        >
          Play
        </button>
        <button className={`nav-btn ${screen === 'analyze' ? 'active' : ''}`} onClick={() => { cancelEngine(); clearSelection(); setScreen('analyze'); }}>
          Analyse
        </button>
        {[['walnut', 'Walnut board', '#ecd8b9', '#a97a52'], ['slate', 'Slate board', '#dfe5ec', '#7189a3']].map(([id, label, l, d]) => (
          <button key={id} className={`nav-btn swatch ${board === id ? 'active' : ''}`} title={label} aria-label={label} aria-pressed={board === id} onClick={() => setBoard(id)}>
            <span className="theme-swatch" aria-hidden="true"><i style={{ background: l }} /><i style={{ background: d }} /><i style={{ background: d }} /><i style={{ background: l }} /></span>
          </button>
        ))}
        <button className="nav-btn icon" title="Sound" onClick={() => setSoundOn(!soundOn)}>
          {soundOn ? '🔊' : '🔇'}
        </button>
      </nav>
    </header>
  );

  // ----- SETUP -----
  if (screen === 'setup') {
    return (
      <div className="app">
        {header}
        <main className="setup">
          <h1>Play vs Stockfish</h1>

          <section className="setup-section">
            <h2>I play as</h2>
            <div className="choice-row">
              {[
                { id: 'w', label: 'White', glyph: GLYPHS.k, cls: 'white' },
                { id: 'random', label: 'Random', glyph: '?', cls: 'random' },
                { id: 'b', label: 'Black', glyph: GLYPHS.k, cls: 'black' },
              ].map((c) => (
                <button
                  key={c.id}
                  className={`color-card ${setupColor === c.id ? 'active' : ''}`}
                  onClick={() => setSetupColor(c.id)}
                >
                  <span className={`color-glyph ${c.cls}`}>{c.glyph}</span>
                  {c.label}
                </button>
              ))}
            </div>
          </section>

          <section className="setup-section">
            <h2>Difficulty</h2>
            <div className="choice-row">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.id}
                  className={`chip ${difficulty === d.id ? 'active' : ''}`}
                  onClick={() => setDifficulty(d.id)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </section>

          <section className="setup-section">
            <h2>Time control</h2>
            <div className="choice-row">
              {TIME_CONTROLS.map((t) => (
                <button
                  key={t.secs}
                  className={`chip ${timeControl === t.secs ? 'active' : ''}`}
                  onClick={() => setTimeControl(t.secs)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          <button className="btn primary big" onClick={() => startGame(setupColor)}>
            Start game
          </button>

          <div className="divider"><span>or</span></div>

          <button className="btn secondary big" onClick={() => setScreen('analyze')}>
            Analyse a game (PGN)
          </button>
        </main>
      </div>
    );
  }

  // ----- PLAY -----
  if (screen === 'play') {
    const g = gameRef.current;
    const captured = capturedBy(history);
    const bal = materialBalance(g);
    const topColor = other(orientation);
    const bottomColor = orientation;
    const diffLabel = DIFFICULTIES.find((d) => d.id === difficulty)?.label;
    const nameFor = (c) => (c === playerColor ? 'You' : `Stockfish (${diffLabel})`);
    const advFor = (c) => (c === 'w' ? bal : -bal);
    const lastMove = history[history.length - 1];
    const handlers = makeHandlers(g, (c) => canPlayerMove && c === playerColor, commitPlayMove);

    let status;
    if (result) status = `${result.title} — ${result.detail}`;
    else if (thinking) status = 'Stockfish is thinking…';
    else if (g.turn() === playerColor) status = g.isCheck() ? 'Check! Your move' : 'Your move';
    else status = 'Waiting for Stockfish';

    const bar = (c) => (
      <PlayerBar
        name={nameFor(c)}
        color={c}
        captured={captured[c]}
        advantage={advFor(c)}
        clock={clock[c]}
        showClock={timeControl > 0}
        active={!result && g.turn() === c}
        thinking={thinking && c !== playerColor}
      />
    );

    return (
      <div className="app">
        {header}
        <main className="layout">
          <div className="board-col">
            {bar(topColor)}
            <Board
              chess={g}
              orientation={orientation}
              selected={selected}
              targets={targets}
              lastMove={lastMove}
              hint={hint}
              handlers={handlers}
            >
              {promotionPicker}
              {result && showResult && (
                <div className="overlay">
                  <div className="result-box">
                    <div className="result-title">{result.title}</div>
                    <div className="result-detail">{result.detail}</div>
                    <div className="result-score">{result.score}</div>
                    <div className="result-actions">
                      <button className="btn primary" onClick={() => startGame(playerColor)}>Rematch</button>
                      <button className="btn secondary" onClick={reviewGame}>Review game</button>
                      <button className="btn secondary" onClick={goToSetup}>New game</button>
                      <button className="btn ghost small" onClick={() => setShowResult(false)}>View board</button>
                    </div>
                  </div>
                </div>
              )}
            </Board>
            {bar(bottomColor)}
          </div>

          <aside className="panel">
            <div className={`status ${result ? 'over' : ''}`}>{status}</div>
            {error && (
              <div className="error">
                {error}
                <button className="btn small" onClick={() => setEngineRetry((n) => n + 1)}>Retry</button>
              </div>
            )}
            {notice && <div className="notice">{notice}</div>}

            <MoveList moves={history} startFen={gameStartFen} current={history.length - 1} />

            <div className="controls">
              <button className="btn" onClick={takeBack} disabled={!canTakeBack} title="Take back your last move">
                ↶ Takeback
              </button>
              <button className="btn" onClick={getHint} disabled={!canPlayerMove || hintLoading} title="Show Stockfish's best move">
                {hintLoading ? '…' : '💡 Hint'}
              </button>
              <button className="btn" onClick={() => setOrientation(other(orientation))} title="Flip board">
                ⇅ Flip
              </button>
            </div>
            <div className="controls">
              <button className="btn" onClick={offerDraw} disabled={!!result}>½ Offer draw</button>
              <button className={`btn danger ${confirmResign ? 'confirm' : ''}`} onClick={resign} disabled={!!result}>
                {confirmResign ? 'Confirm resign?' : '⚑ Resign'}
              </button>
            </div>
            <div className="controls">
              <button className="btn" onClick={copyPgn} disabled={history.length === 0}>Copy PGN</button>
              {result && <button className="btn" onClick={reviewGame}>Review</button>}
              <button className="btn primary" onClick={goToSetup}>New game</button>
            </div>
          </aside>
        </main>
      </div>
    );
  }

  // ----- ANALYSE: load screen -----
  if (!analysis) {
    return (
      <div className="app">
        {header}
        <main className="setup">
          <h1>Analyse a game</h1>
          <p className="muted">Paste a game in PGN format (from chess.com, lichess, or a book database).</p>
          <textarea
            className="pgn-input"
            value={pgnText}
            onChange={(e) => setPgnText(e.target.value)}
            placeholder={'[White "Carlsen"]\n[Black "Nakamura"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 ...'}
          />
          {pgnError && <div className="error">{pgnError}</div>}
          <button className="btn primary big" onClick={loadPgn} disabled={!pgnText.trim()}>
            Load game
          </button>
          <button
            className="btn secondary big"
            onClick={() => openAnalysis({ startFen: START_FEN, moves: [], original: [], headers: {} })}
          >
            Open empty board
          </button>
        </main>
      </div>
    );
  }

  // ----- ANALYSE: board -----
  const ac = analysisChess;
  const aHistory = ac.history({ verbose: true });
  const aCaptured = capturedBy(aHistory);
  const aBal = materialBalance(ac);
  const aLast = analysis.moves[aIndex - 1];
  const aInfo = gameOverInfo(ac);
  const aHandlers = makeHandlers(ac, (c) => !promotion && c === ac.turn(), commitAnalysisMove);
  const h = analysis.headers || {};
  const best = bestMove && bestMove.fen === ac.fen() ? bestMove : null;
  const aBar = (c) => (
    <PlayerBar
      name={(c === 'w' ? h.White : h.Black) || colorName(c)}
      color={c}
      captured={aCaptured[c]}
      advantage={c === 'w' ? aBal : -aBal}
      clock={0}
      showClock={false}
      active={ac.turn() === c && !aInfo}
    />
  );

  return (
    <div className="app">
      {header}
      <main className="layout">
        <div className="board-col">
          {aBar(other(aOrientation))}
          <Board
            chess={ac}
            orientation={aOrientation}
            selected={selected}
            targets={targets}
            lastMove={aLast}
            hint={best}
            handlers={aHandlers}
          >
            {promotionPicker}
          </Board>
          {aBar(aOrientation)}
        </div>

        <aside className="panel">
          <div className="game-info">
            <div className="game-players">
              {(h.White || 'White')} vs {(h.Black || 'Black')}
            </div>
            <div className="muted small">
              {[h.Event, h.Date, h.Result].filter((x) => x && x !== '?' && x !== '????.??.??').join(' · ')}
            </div>
          </div>

          <div className={`status ${aInfo ? 'over' : ''}`}>
            {aInfo
              ? aInfo.winner
                ? `${aInfo.reason} — ${colorName(aInfo.winner)} wins`
                : `Draw — ${aInfo.reason}`
              : `${colorName(ac.turn())} to move${ac.isCheck() ? ' (check)' : ''}`}
          </div>
          {inVariation && (
            <div className="notice">
              Exploring your own line.
              <button className="btn small" onClick={backToGameLine}>Back to game</button>
            </div>
          )}
          {error && <div className="error">{error}</div>}

          <MoveList moves={analysis.moves} startFen={analysis.startFen} current={aIndex - 1} onSelect={(i) => goTo(i + 1)} />

          <div className="controls nav-controls">
            <button className="btn" onClick={() => goTo(0)} disabled={aIndex === 0}>⏮</button>
            <button className="btn" onClick={() => goTo(aIndex - 1)} disabled={aIndex === 0}>◀</button>
            <button className="btn" onClick={() => goTo(aIndex + 1)} disabled={aIndex >= analysis.moves.length}>▶</button>
            <button className="btn" onClick={() => goTo(analysis.moves.length)} disabled={aIndex >= analysis.moves.length}>⏭</button>
          </div>

          <div className="controls">
            <button className="btn" onClick={showBest} disabled={bestLoading || !!aInfo}>
              {bestLoading ? 'Thinking…' : '💡 Best move'}
            </button>
            <button className="btn" onClick={() => setAOrientation(other(aOrientation))}>⇅ Flip</button>
          </div>
          {best && (
            <div className="best-move">
              Stockfish suggests <strong>{best.san}</strong>
              <button className="btn small" onClick={() => commitAnalysisMove({ from: best.from, to: best.to, promotion: best.promotion })}>
                Play it
              </button>
            </div>
          )}

          {!aInfo && (
            <div className="controls">
              <button className="btn" onClick={() => playFromHere('w')}>Play from here as White</button>
              <button className="btn" onClick={() => playFromHere('b')}>Play from here as Black</button>
            </div>
          )}

          <div className="controls">
            <button className="btn" onClick={() => { setAnalysis(null); setPgnError(''); }}>Load another game</button>
          </div>
          <p className="muted small">Tip: use ← → arrow keys to step through moves. Move pieces to try your own ideas.</p>
        </aside>
      </main>
    </div>
  );
}
