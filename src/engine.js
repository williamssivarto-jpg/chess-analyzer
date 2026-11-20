// Stockfish running inside the visitor's browser (a Web Worker), so no server is needed.
// The engine files live in public/engine/ (GPL v3, see public/engine/README.txt).

const LEVELS = {
  easy: { skill: 1, movetime: 150 },
  medium: { skill: 8, movetime: 500 },
  hard: { skill: 20, movetime: 1500 },
};

let worker = null;
let ready = null;
let chain = Promise.resolve();
let busy = false;

function startWorker() {
  if (worker) return ready;
  const file = typeof WebAssembly === 'object' ? '/engine/stockfish.wasm.js' : '/engine/stockfish.js';
  worker = new Worker(file);
  ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The chess engine took too long to load. Please refresh the page.')), 20000);
    const onMsg = (e) => {
      if (String(e.data).startsWith('uciok')) {
        clearTimeout(timer);
        worker.removeEventListener('message', onMsg);
        resolve();
      }
    };
    worker.addEventListener('message', onMsg);
    worker.addEventListener('error', () => { clearTimeout(timer); reject(new Error('The chess engine could not start in this browser.')); });
    worker.postMessage('uci');
  });
  return ready;
}

function search(fen, difficulty) {
  const level = LEVELS[difficulty] || LEVELS.medium;
  return new Promise((resolve, reject) => {
    busy = true;
    const onMsg = (e) => {
      const line = String(e.data);
      if (!line.startsWith('bestmove')) return;
      worker.removeEventListener('message', onMsg);
      busy = false;
      const move = line.split(' ')[1];
      if (!move || move === '(none)') reject(new Error('The engine found no move'));
      else resolve(move);
    };
    worker.addEventListener('message', onMsg);
    worker.postMessage(`setoption name Skill Level value ${level.skill}`);
    worker.postMessage(`position fen ${fen}`);
    worker.postMessage(`go movetime ${level.movetime}`);
  });
}

// Returns the engine's move in UCI form, e.g. "e2e4" or "e7e8q".
export async function engineMove(fen, difficulty) {
  await startWorker();
  if (busy) worker.postMessage('stop'); // a newer request replaces an older one
  const run = chain.then(() => search(fen, difficulty));
  chain = run.catch(() => {});
  return run;
}
