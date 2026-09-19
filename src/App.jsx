import React, { useState, useEffect } from 'react';
import { Chess } from 'chess.js';
import './App.css';

export default function ChessAnalyzer() {
  const [mode, setMode] = useState('play');
  const [game, setGame] = useState(new Chess());
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalMoves, setLegalMoves] = useState([]);
  const [difficulty, setDifficulty] = useState('medium');
  const [isThinking, setIsThinking] = useState(false);
  
  // PGN mode state
  const [pgnInput, setPgnInput] = useState('');
  const [moveHistory, setMoveHistory] = useState([]);
  const [currentMove, setCurrentMove] = useState(0);

  const pieces = {
    'p': '♟', 'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚',
    'P': '♙', 'R': '♖', 'N': '♘', 'B': '♗', 'Q': '♕', 'K': '♔'
  };

  const depthMap = {
    easy: 15,
    medium: 20,
    hard: 25
  };

  // Computer move logic
  useEffect(() => {
    if (game.turn() === 'b' && mode === 'play' && !isThinking) {
      makeComputerMove();
    }
  }, [game, mode, isThinking]);

  const makeComputerMove = async () => {
    setIsThinking(true);

    try {
      const fen = game.fen();
      const depth = depthMap[difficulty];

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fen, depth })
      });

      if (!response.ok) {
        console.error('API error:', response.status);
        setIsThinking(false);
        return;
      }

      const data = await response.json();
      const bestMove = data.move;

      if (bestMove && bestMove !== '(none)') {
        const newGame = new Chess(fen);
        newGame.move({
          from: bestMove.substring(0, 2),
          to: bestMove.substring(2, 4),
          promotion: bestMove.length > 4 ? bestMove[4] : undefined
        });
        setGame(newGame);
      }
    } catch (error) {
      console.error('Error:', error);
    }

    setIsThinking(false);
  };

  const handleSquareClick = (square) => {
    if (isThinking || game.turn() === 'b') return;

    const piece = game.get(square);

    if (selectedSquare === null) {
      if (!piece || piece.color !== 'w') return;

      setSelectedSquare(square);
      const moves = game.moves({ square, verbose: true });
      setLegalMoves(moves.map(m => m.to));
    } else {
      if (selectedSquare === square) {
        setSelectedSquare(null);
        setLegalMoves([]);
        return;
      }

      const newGame = new Chess(game.fen());
      const result = newGame.move({
        from: selectedSquare,
        to: square,
        promotion: 'q'
      });

      if (result) {
        setGame(newGame);
        setSelectedSquare(null);
        setLegalMoves([]);
      }
    }
  };

  const resetGame = () => {
    setGame(new Chess());
    setSelectedSquare(null);
    setLegalMoves([]);
  };

  const parsePGN = (pgnText) => {
    const moveRegex = /\d+\.\s*(\S+)\s+(\S+)?/g;
    const moves = [];
    let match;

    while ((match = moveRegex.exec(pgnText)) !== null) {
      moves.push(match[1]);
      if (match[2]) moves.push(match[2]);
    }

    return moves.filter(m => !m.includes('$') && !m.includes('{'));
  };

  const loadPGN = () => {
    if (!pgnInput.trim()) return;

    const moves = parsePGN(pgnInput);
    const newGame = new Chess();
    const validMoves = [];

    for (let move of moves) {
      const result = newGame.move(move, { sloppy: true });
      if (result) {
        validMoves.push(result.san);
      }
    }

    setMoveHistory(validMoves);
    setCurrentMove(0);
    setGame(new Chess());
    setSelectedSquare(null);
    setLegalMoves([]);
  };

  const handleNextMove = () => {
    if (currentMove < moveHistory.length) {
      setCurrentMove(currentMove + 1);
      const newGame = new Chess();
      for (let i = 0; i <= currentMove; i++) {
        newGame.move(moveHistory[i], { sloppy: true });
      }
      setGame(newGame);
      setSelectedSquare(null);
      setLegalMoves([]);
    }
  };

  const handlePrevMove = () => {
    if (currentMove > 0) {
      setCurrentMove(currentMove - 1);
      const newGame = new Chess();
      for (let i = 0; i < currentMove; i++) {
        newGame.move(moveHistory[i], { sloppy: true });
      }
      setGame(newGame);
      setSelectedSquare(null);
      setLegalMoves([]);
    }
  };

  return (
    <div className="chess-analyzer">
      <h1>Chess Analyzer</h1>

      <div className="mode-selector">
        <button
          className={`mode-btn ${mode === 'play' ? 'active' : ''}`}
          onClick={() => setMode('play')}
        >
          Play vs Stockfish
        </button>
        <button
          className={`mode-btn ${mode === 'analyze' ? 'active' : ''}`}
          onClick={() => setMode('analyze')}
        >
          Load Historical Game
        </button>
      </div>

      {mode === 'play' && (
        <div className="mode-content">
          <div className="controls">
            <div className="difficulty-selector">
              <label>Difficulty:</label>
              <button
                className={`diff-btn ${difficulty === 'easy' ? 'active' : ''}`}
                onClick={() => setDifficulty('easy')}
                disabled={isThinking || game.turn() === 'b'}
              >
                Easy
              </button>
              <button
                className={`diff-btn ${difficulty === 'medium' ? 'active' : ''}`}
                onClick={() => setDifficulty('medium')}
                disabled={isThinking || game.turn() === 'b'}
              >
                Medium
              </button>
              <button
                className={`diff-btn ${difficulty === 'hard' ? 'active' : ''}`}
                onClick={() => setDifficulty('hard')}
                disabled={isThinking || game.turn() === 'b'}
              >
                Hard
              </button>
            </div>
            <button className="reset-btn" onClick={resetGame} disabled={isThinking}>
              New Game
            </button>
          </div>

          <div className="board">
            {Array.from({ length: 64 }).map((_, i) => {
              const file = i % 8;
              const rank = 7 - Math.floor(i / 8);
              const square = String.fromCharCode(97 + file) + (rank + 1);
              const piece = game.get(square);
              const isLight = (file + rank) % 2 === 0;
              const isSelected = square === selectedSquare;
              const isLegalMove = legalMoves.includes(square);

              return (
                <div
                  key={square}
                  className={`square ${isLight ? 'light' : 'dark'} ${isSelected ? 'selected' : ''} ${isLegalMove ? 'legal-move' : ''}`}
                  onClick={() => handleSquareClick(square)}
                >
                  {piece && <span className={`piece ${piece.color === 'w' ? 'white' : 'black'}`}>{pieces[piece.color === 'w' ? piece.type.toUpperCase() : piece.type]}</span>}
                </div>
              );
            })}
          </div>

          <div className="info">
            <p>{isThinking ? 'Thinking...' : `Turn: ${game.turn() === 'w' ? 'White (You)' : 'Black (Stockfish)'}`}</p>
            <p>FEN: {game.fen()}</p>
          </div>
        </div>
      )}

      {mode === 'analyze' && (
        <div className="mode-content">
          <div className="pgn-input-section">
            <label>Paste PGN:</label>
            <textarea
              value={pgnInput}
              onChange={(e) => setPgnInput(e.target.value)}
              placeholder="Paste game notation here (e.g., 1. e4 c5 2. Nf3...)"
              rows="4"
            />
            <button onClick={loadPGN} className="load-pgn-btn">
              Load Game
            </button>
          </div>

          {moveHistory.length > 0 && (
            <>
              <div className="board">
                {Array.from({ length: 64 }).map((_, i) => {
                  const file = i % 8;
                  const rank = 7 - Math.floor(i / 8);
                  const square = String.fromCharCode(97 + file) + (rank + 1);
                  const piece = game.get(square);
                  const isLight = (file + rank) % 2 === 0;
                  const isSelected = square === selectedSquare;
                  const isLegalMove = legalMoves.includes(square);

                  return (
                    <div
                      key={square}
                      className={`square ${isLight ? 'light' : 'dark'} ${isSelected ? 'selected' : ''} ${isLegalMove ? 'legal-move' : ''}`}
                      onClick={() => handleSquareClick(square)}
                    >
                      {piece && <span className={`piece ${piece.color === 'w' ? 'white' : 'black'}`}>{pieces[piece.color === 'w' ? piece.type.toUpperCase() : piece.type]}</span>}
                    </div>
                  );
                })}
              </div>

              <div className="controls">
                <button onClick={handlePrevMove} disabled={currentMove === 0}>
                  ← Prev
                </button>
                <span className="move-counter">
                  Move {currentMove} / {moveHistory.length}
                </span>
                <button onClick={handleNextMove} disabled={currentMove === moveHistory.length}>
                  Next →
                </button>
              </div>

              <div className="move-list">
                <h4>Moves:</h4>
                <div className="moves">
                  {moveHistory.map((move, idx) => (
                    <button
                      key={idx}
                      className={`move-btn ${idx < currentMove ? 'played' : ''} ${idx === currentMove ? 'current' : ''}`}
                      onClick={() => {
                        setCurrentMove(idx);
                        const newGame = new Chess();
                        for (let i = 0; i < idx; i++) {
                          newGame.move(moveHistory[i], { sloppy: true });
                        }
                        setGame(newGame);
                      }}
                    >
                      {move}
                    </button>
                  ))}
                </div>
              </div>

              <div className="info">
                <p>FEN: {game.fen()}</p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}