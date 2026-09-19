import Stockfish from 'stockfish';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { fen, depth } = req.body;

  if (!fen || !depth) {
    return res.status(400).json({ error: 'Missing fen or depth' });
  }

  return new Promise((resolve) => {
    const engine = Stockfish();
    let bestMove = null;

    engine.onmessage = (msg) => {
      if (msg.data && msg.data.startsWith('bestmove')) {
        bestMove = msg.data.split(' ')[1];
        engine.terminate();
        resolve(res.status(200).json({ move: bestMove }));
      }
    };

    engine.postMessage(`position fen ${fen}`);
    engine.postMessage(`go depth ${depth}`);

    // Timeout after 10 seconds
    setTimeout(() => {
      if (bestMove === null) {
        engine.terminate();
        resolve(res.status(500).json({ error: 'Timeout' }));
      }
    }, 10000);
  });
}