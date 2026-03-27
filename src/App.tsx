/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { 
  Trophy, 
  RotateCcw, 
  Timer, 
  AlertCircle, 
  Pause, 
  Play, 
  Lightbulb,
  Eraser,
  Pencil,
  User,
  Medal,
  ChevronRight,
  Wand2,
  Sparkles,
  Gamepad2
} from 'lucide-react';
import { Difficulty, SudokuBoard, GameState } from './types';
import { generateFullBoard, createPuzzle, checkWin } from './utils/sudoku';
import { db } from './firebase';
import { collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp, Timestamp, where } from 'firebase/firestore';

const DIFFICULTIES: Difficulty[] = ['초급', '중급', '고급'];

interface RankingEntry {
  id: string;
  username: string;
  time: number;
  difficulty: string;
  createdAt: Timestamp;
}

export default function App() {
  const [gameState, setGameState] = useState<GameState>({
    board: [],
    difficulty: '초급',
    mistakes: 0,
    time: 0,
    isPaused: false,
    isGameOver: false,
    isStarted: false,
    isHardcore: false,
    noHints: false,
    isAutoFilling: false,
    selectedCell: null,
  });
  const [solution, setSolution] = useState<number[][]>([]);
  const [isNotesMode, setIsNotesMode] = useState(false);
  const [username, setUsername] = useState(localStorage.getItem('sudoku_username') || '');
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [showRankings, setShowRankings] = useState(false);
  const [rankingDifficulty, setRankingDifficulty] = useState<Difficulty>('초급');

  const { numberStats, remainingCellsCount } = useMemo(() => {
    const counts = new Array(10).fill(0);
    let remaining = 0;
    gameState.board.forEach(row => {
      row.forEach(cell => {
        if (cell.value !== null && cell.isCorrect) {
          counts[cell.value]++;
        } else {
          remaining++;
        }
      });
    });
    const stats = counts.map((count, num) => ({
      num,
      count,
      remaining: 9 - count,
      isCompleted: count === 9
    }));
    return { numberStats: stats, remainingCellsCount: remaining };
  }, [gameState.board]);

  const startNewGame = useCallback((diff: Difficulty = gameState.difficulty) => {
    const fullBoard = generateFullBoard();
    const puzzle = createPuzzle(fullBoard, diff);
    setSolution(fullBoard);
    setGameState(prev => ({
      ...prev,
      board: puzzle,
      difficulty: diff,
      mistakes: 0,
      time: 0,
      isPaused: false,
      isGameOver: false,
      isStarted: false,
      isAutoFilling: false,
      selectedCell: null,
    }));
  }, [gameState.difficulty]);

  const handleStartGame = () => {
    if (!username.trim()) {
      alert('이름을 입력해주세요!');
      return;
    }
    setGameState(prev => ({ ...prev, isStarted: true }));
  };

  useEffect(() => {
    startNewGame();
  }, []);

  useEffect(() => {
    if (gameState.isGameOver && gameState.mistakes < 3) {
      const duration = 3 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      const interval: any = setInterval(function() {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
      }, 250);
    }
  }, [gameState.isGameOver, gameState.mistakes]);

  useEffect(() => {
    const q = query(
      collection(db, 'rankings'),
      where('difficulty', '==', rankingDifficulty),
      orderBy('time', 'asc'),
      limit(10)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const entries: RankingEntry[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as RankingEntry[];
      setRankings(entries);
    });
    return () => unsubscribe();
  }, [rankingDifficulty]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (gameState.isStarted && !gameState.isPaused && !gameState.isGameOver) {
      interval = setInterval(() => {
        setGameState(prev => ({ ...prev, time: prev.time + 1 }));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameState.isStarted, gameState.isPaused, gameState.isGameOver]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCellClick = (row: number, col: number) => {
    if (gameState.isPaused || gameState.isGameOver || gameState.isAutoFilling) return;
    setGameState(prev => ({ ...prev, selectedCell: [row, col] }));
  };

  const handleNumberInput = async (num: number) => {
    if (!gameState.selectedCell || gameState.isPaused || gameState.isGameOver || gameState.isAutoFilling) return;
    const [row, col] = gameState.selectedCell;
    const cell = gameState.board[row][col];

    if (cell.initialValue !== null) return;

    if (isNotesMode) {
      const newBoard = [...gameState.board];
      const notes = [...cell.isNotes];
      const index = notes.indexOf(num);
      if (index > -1) {
        notes.splice(index, 1);
      } else {
        notes.push(num);
      }
      newBoard[row][col] = { ...cell, isNotes: notes.sort() };
      setGameState(prev => ({ ...prev, board: newBoard }));
      return;
    }

    const isCorrect = solution[row][col] === num;
    const newBoard = [...gameState.board];
    newBoard[row][col] = {
      ...cell,
      value: num,
      isCorrect,
      isNotes: []
    };

    const newMistakes = isCorrect ? gameState.mistakes : gameState.mistakes + 1;
    const isWin = checkWin(newBoard);
    const isGameOver = (gameState.isHardcore && newMistakes > 0) || newMistakes >= 3 || isWin;

    if (isWin) {
      if (username.trim()) {
        try {
          await addDoc(collection(db, 'rankings'), {
            username: username.trim(),
            time: gameState.time,
            difficulty: gameState.difficulty,
            createdAt: serverTimestamp()
          });
        } catch (e) {
          console.error("Error adding ranking: ", e);
        }
      }
    }

    setGameState(prev => ({
      ...prev,
      board: newBoard,
      mistakes: newMistakes,
      isGameOver
    }));
  };

  const handleErase = () => {
    if (!gameState.selectedCell || gameState.isPaused || gameState.isGameOver || gameState.isAutoFilling) return;
    const [row, col] = gameState.selectedCell;
    const cell = gameState.board[row][col];
    if (cell.initialValue !== null) return;

    const newBoard = [...gameState.board];
    newBoard[row][col] = { ...cell, value: null, isNotes: [], isCorrect: true };
    setGameState(prev => ({ ...prev, board: newBoard }));
  };

  const handleHint = () => {
    if (gameState.noHints || !gameState.selectedCell || gameState.isPaused || gameState.isGameOver || gameState.isAutoFilling) return;
    const [row, col] = gameState.selectedCell;
    const cell = gameState.board[row][col];
    if (cell.value !== null) return;

    const correctValue = solution[row][col];
    const newBoard = [...gameState.board];
    newBoard[row][col] = {
      ...cell,
      value: correctValue,
      initialValue: correctValue,
      isCorrect: true,
      isNotes: []
    };

    setGameState(prev => ({
      ...prev,
      board: newBoard,
      time: prev.time + 30,
      isGameOver: checkWin(newBoard)
    }));
  };

  const handleAutoComplete = async () => {
    if (remainingCellsCount > 9 || gameState.isGameOver || gameState.isAutoFilling) return;

    setGameState(prev => ({ ...prev, isAutoFilling: true, selectedCell: null }));

    // Find all cells that need to be filled
    const cellsToFill: { r: number, c: number }[] = [];
    gameState.board.forEach((row, rIdx) => {
      row.forEach((cell, cIdx) => {
        if (cell.value === null || !cell.isCorrect) {
          cellsToFill.push({ r: rIdx, c: cIdx });
        }
      });
    });

    // Fill cells one by one with a delay
    let currentBoard = [...gameState.board.map(row => [...row])];
    
    for (const { r, c } of cellsToFill) {
      currentBoard[r][c] = {
        ...currentBoard[r][c],
        value: solution[r][c],
        isCorrect: true,
        isNotes: []
      };
      
      // Update state for each cell to show the process
      setGameState(prev => ({
        ...prev,
        board: [...currentBoard.map(row => [...row])]
      }));
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    if (username.trim()) {
      try {
        await addDoc(collection(db, 'rankings'), {
          username: username.trim(),
          time: gameState.time,
          difficulty: gameState.difficulty,
          createdAt: serverTimestamp()
        });
      } catch (e) {
        console.error("Error adding ranking: ", e);
      }
    }

    setGameState(prev => ({
      ...prev,
      isAutoFilling: false,
      isGameOver: true,
      selectedCell: null
    }));
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setUsername(val);
    localStorage.setItem('sudoku_username', val);
  };

  const selectedValue = gameState.selectedCell ? gameState.board[gameState.selectedCell[0]][gameState.selectedCell[1]].value : null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8 bg-purple-50">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-purple-900">Zen Sudoku</h1>
              <p className="text-purple-600 font-medium">Challenge your mind, find your focus.</p>
            </div>
            <button 
              onClick={() => setShowRankings(!showRankings)}
              className="p-3 bg-white rounded-2xl border border-purple-200 text-purple-600 hover:bg-purple-50 transition-all shadow-sm"
              title="Ranking Board"
            >
              <Medal size={24} />
            </button>
          </div>
          <div className="flex items-center gap-6 text-sm font-mono text-purple-700 bg-white px-4 py-2 rounded-xl shadow-sm border border-purple-200">
            <div className="flex flex-wrap gap-2 items-center">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className={gameState.isHardcore ? "text-red-500" : "text-purple-400"} />
                <span>실수: {gameState.mistakes}/{gameState.isHardcore ? '1' : '3'}</span>
              </div>
              {gameState.isHardcore && (
                <span className="px-2 py-0.5 bg-red-100 text-red-600 text-[10px] font-bold rounded-full uppercase tracking-tighter">Hardcore</span>
              )}
              {gameState.noHints && (
                <span className="px-2 py-0.5 bg-purple-100 text-purple-600 text-[10px] font-bold rounded-full uppercase tracking-tighter">No Hints</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Timer size={16} className="text-purple-400" />
              <span>{formatTime(gameState.time)}</span>
            </div>
          </div>
        </div>

        {/* Username Input */}
        <div className="relative group">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            <User size={18} className="text-purple-400" />
          </div>
          <input 
            type="text" 
            placeholder="사용자 이름을 입력하세요 (랭킹 등록용)"
            value={username}
            onChange={handleUsernameChange}
            className="w-full pl-12 pr-4 py-3 bg-white border border-purple-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all shadow-sm text-purple-900 font-medium"
          />
        </div>

        {/* Main Game Area */}
        <div className="relative aspect-square w-full bg-white rounded-2xl shadow-2xl border-4 border-purple-900 overflow-hidden">
          <div className="absolute inset-0 grid grid-cols-9 grid-rows-9">
            {gameState.board.map((row, rIdx) => 
              row.map((cell, cIdx) => {
                const isSelected = gameState.selectedCell?.[0] === rIdx && gameState.selectedCell?.[1] === cIdx;
                const isSameRowOrCol = gameState.selectedCell?.[0] === rIdx || gameState.selectedCell?.[1] === cIdx;
                const isSameValue = selectedValue !== null && cell.value === selectedValue;
                
                const borderRight = (cIdx + 1) % 3 === 0 && cIdx !== 8 ? 'border-r-2 border-purple-300' : (cIdx !== 8 ? 'border-r border-purple-300' : '');
                const borderBottom = (rIdx + 1) % 3 === 0 && rIdx !== 8 ? 'border-b-2 border-purple-300' : (rIdx !== 8 ? 'border-b border-purple-300' : '');

                // 3x3 Block Checkerboard pattern logic (cleaner than cell-by-cell)
                const isBlockChecker = (Math.floor(rIdx / 3) + Math.floor(cIdx / 3)) % 2 === 0;

                return (
                  <button
                    key={`${rIdx}-${cIdx}`}
                    onClick={() => handleCellClick(rIdx, cIdx)}
                    className={`
                      relative flex items-center justify-center text-2xl font-medium transition-all
                      ${borderRight} ${borderBottom}
                      ${isSelected ? 'bg-purple-700 text-white z-20 scale-105 shadow-xl ring-4 ring-purple-300' : 
                        isSameValue ? 'bg-purple-500 text-white scale-110 z-10 shadow-lg ring-2 ring-purple-400' :
                        isSameRowOrCol ? 'bg-purple-200/60 text-purple-900' : 
                        isBlockChecker ? 'bg-white' : 'bg-purple-50'}
                      ${!cell.isCorrect && cell.value !== null ? 'text-red-500' : ''}
                      ${cell.initialValue !== null ? 'font-bold text-purple-900' : 'font-normal text-purple-800'}
                    `}
                  >
                    {!gameState.isPaused && gameState.isStarted && (
                      <>
                        {cell.value !== null ? (
                          <motion.span
                            key={`${rIdx}-${cIdx}-${cell.value}`}
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ 
                              scale: isSameValue ? 1.2 : 1, 
                              opacity: 1 
                            }}
                            transition={{ 
                              type: 'spring', 
                              stiffness: 300, 
                              damping: 20,
                              scale: { duration: 0.2 }
                            }}
                          >
                            {cell.value}
                          </motion.span>
                        ) : (
                          <div className="grid grid-cols-3 gap-0.5 w-full h-full p-1">
                            {[1,2,3,4,5,6,7,8,9].map(n => (
                              <span key={n} className="text-[8px] leading-none text-purple-300 flex items-center justify-center">
                                {cell.isNotes.includes(n) ? n : ''}
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Start Screen Overlay */}
          <AnimatePresence>
            {!gameState.isStarted && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-purple-900/80 backdrop-blur-md flex items-center justify-center z-50 p-8 text-center"
              >
                <div className="max-w-sm w-full space-y-8 bg-white p-8 rounded-3xl shadow-2xl">
                  <div className="space-y-2">
                    <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Gamepad2 size={32} />
                    </div>
                    <h2 className="text-2xl font-bold text-purple-900">게임을 시작할까요?</h2>
                    <p className="text-purple-500 text-sm">이름을 입력하고 퍼즐에 도전하세요!</p>
                  </div>

                  <div className="space-y-4">
                    <div className="relative">
                      <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                        <User size={18} className="text-purple-400" />
                      </div>
                      <input 
                        type="text" 
                        placeholder="당신의 이름"
                        value={username}
                        onChange={handleUsernameChange}
                        className="w-full pl-12 pr-4 py-4 bg-purple-50 border-2 border-purple-100 rounded-2xl focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 outline-none transition-all font-medium text-purple-900"
                      />
                    </div>

                    <div className="flex gap-2">
                      {DIFFICULTIES.map(diff => (
                        <button
                          key={diff}
                          onClick={() => setGameState(prev => ({ ...prev, difficulty: diff }))}
                          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                            gameState.difficulty === diff 
                              ? 'bg-purple-600 text-white shadow-lg' 
                              : 'bg-purple-50 text-purple-400 hover:bg-purple-100'
                          }`}
                        >
                          {diff}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setGameState(prev => ({ ...prev, noHints: !prev.noHints }))}
                        className={`py-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 border-2 ${
                          gameState.noHints 
                            ? 'bg-red-50 border-red-200 text-red-600' 
                            : 'bg-purple-50 border-purple-100 text-purple-400'
                        }`}
                      >
                        <Lightbulb size={16} />
                        <span>힌트 없음</span>
                      </button>
                      <button
                        onClick={() => setGameState(prev => ({ ...prev, isHardcore: !prev.isHardcore }))}
                        className={`py-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 border-2 ${
                          gameState.isHardcore 
                            ? 'bg-red-600 border-red-600 text-white shadow-lg' 
                            : 'bg-purple-50 border-purple-100 text-purple-400'
                        }`}
                      >
                        <AlertCircle size={16} />
                        <span>원라이프</span>
                      </button>
                    </div>

                    <button 
                      onClick={handleStartGame}
                      className="w-full py-4 bg-purple-600 text-white rounded-2xl font-bold hover:bg-purple-700 transition-all shadow-lg shadow-purple-200 flex items-center justify-center gap-2 group"
                    >
                      <span>시작하기</span>
                      <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
                    </button>

                    <button 
                      onClick={() => setShowRankings(true)}
                      className="w-full py-3 bg-white text-purple-600 border-2 border-purple-100 rounded-2xl font-bold hover:bg-purple-50 transition-all flex items-center justify-center gap-2"
                    >
                      <Medal size={20} />
                      <span>명예의 전당 보기</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Ranking Board Overlay */}
          <AnimatePresence>
            {showRankings && (
              <motion.div 
                initial={{ opacity: 0, x: 300 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 300 }}
                className="absolute inset-0 bg-white z-[60] p-6 overflow-y-auto"
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-purple-900 flex items-center gap-2">
                    <Medal className="text-yellow-500" /> 명예의 전당
                  </h2>
                  <button onClick={() => setShowRankings(false)} className="p-2 hover:bg-purple-50 rounded-xl">
                    <ChevronRight size={24} className="text-purple-400" />
                  </button>
                </div>

                {/* Difficulty Tabs */}
                <div className="flex gap-2 mb-6 bg-purple-50 p-1 rounded-2xl">
                  {DIFFICULTIES.map(diff => (
                    <button
                      key={diff}
                      onClick={() => setRankingDifficulty(diff)}
                      className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${
                        rankingDifficulty === diff 
                          ? 'bg-white text-purple-600 shadow-sm' 
                          : 'text-purple-400 hover:text-purple-500'
                      }`}
                    >
                      {diff}
                    </button>
                  ))}
                </div>

                <div className="space-y-3">
                  {rankings.map((entry, idx) => (
                    <div key={entry.id} className="flex items-center justify-between p-4 bg-purple-50 rounded-2xl border border-purple-100">
                      <div className="flex items-center gap-4">
                        <span className={`w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm ${
                          idx === 0 ? 'bg-yellow-400 text-white' : 
                          idx === 1 ? 'bg-zinc-300 text-white' :
                          idx === 2 ? 'bg-orange-400 text-white' : 'bg-purple-200 text-purple-600'
                        }`}>
                          {idx + 1}
                        </span>
                        <div>
                          <p className="font-bold text-purple-900">{entry.username}</p>
                          <p className="text-[10px] text-purple-400">
                            {entry.createdAt?.toDate().toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-bold text-purple-700">{formatTime(entry.time)}</p>
                      </div>
                    </div>
                  ))}
                  {rankings.length === 0 && (
                    <p className="text-center text-purple-400 py-12">아직 {rankingDifficulty} 기록이 없습니다. 첫 주인공이 되어보세요!</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Pause Overlay */}
          <AnimatePresence>
            {gameState.isPaused && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-white/90 backdrop-blur-sm flex items-center justify-center z-20"
              >
                <button 
                  onClick={() => setGameState(prev => ({ ...prev, isPaused: false }))}
                  className="flex flex-col items-center gap-4 group"
                >
                  <div className="w-20 h-20 bg-purple-600 rounded-full flex items-center justify-center text-white group-hover:scale-110 transition-transform shadow-lg shadow-purple-200">
                    <Play size={40} fill="currentColor" />
                  </div>
                  <span className="text-xl font-bold text-purple-900">일시정지됨</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Game Over Overlay */}
          <AnimatePresence>
            {gameState.isGameOver && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute inset-0 bg-purple-900/95 flex items-center justify-center z-30 p-8 text-center"
              >
                <div className="space-y-6 text-white">
                  <div className="flex justify-center relative">
                    {gameState.mistakes < 3 ? (
                      <>
                        <motion.div 
                          animate={{ rotate: 360 }}
                          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                          className="absolute inset-0 flex items-center justify-center"
                        >
                          <Sparkles size={120} className="text-yellow-400/30" />
                        </motion.div>
                        <div className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/20 relative z-10">
                          <Trophy size={48} />
                        </div>
                      </>
                    ) : (
                      <div className="w-24 h-24 bg-red-500 rounded-full flex items-center justify-center shadow-lg shadow-red-500/20">
                        <AlertCircle size={48} />
                      </div>
                    )}
                  </div>
                  <div className="relative z-10">
                    <h2 className="text-5xl font-black italic tracking-tighter">
                      {gameState.mistakes < 3 ? 'VICTORY!' : 'GAME OVER'}
                    </h2>
                    <p className="text-purple-200 mt-2 font-medium">
                      {gameState.mistakes < 3 
                        ? `${gameState.difficulty} 난이도를 ${formatTime(gameState.time)}만에 정복했습니다!`
                        : '실수 한도를 초과했습니다. 다시 도전해보세요.'}
                    </p>
                  </div>
                  <button 
                    onClick={() => startNewGame()}
                    className="w-full py-4 bg-white text-purple-900 rounded-2xl font-bold hover:bg-purple-50 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl"
                  >
                    다시 하기
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Controls Bar */}
        <div className="flex items-center justify-between bg-white p-2 rounded-2xl shadow-sm border border-purple-200">
          <div className="flex gap-1">
            {DIFFICULTIES.map(diff => (
              <button
                key={diff}
                onClick={() => startNewGame(diff)}
                className={`px-4 py-1.5 rounded-xl text-sm font-semibold transition-all ${
                  gameState.difficulty === diff 
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-200' 
                    : 'text-purple-500 hover:bg-purple-50'
                }`}
              >
                {diff}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setGameState(prev => ({ ...prev, isPaused: !prev.isPaused }))}
              className="p-2 hover:bg-purple-50 rounded-xl transition-colors text-purple-600"
              title={gameState.isPaused ? "재개" : "일시정지"}
            >
              {gameState.isPaused ? <Play size={20} /> : <Pause size={20} />}
            </button>
            <button 
              onClick={() => startNewGame()}
              className="p-2 hover:bg-purple-50 rounded-xl transition-colors text-purple-600"
              title="새 게임"
            >
              <RotateCcw size={20} />
            </button>
          </div>
        </div>

        {/* Number Pad */}
        <div className="relative">
          <div className="grid grid-cols-9 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => {
              const stats = numberStats[num];
              const isCompleted = stats.isCompleted;
              return (
                <button
                  key={num}
                  onClick={() => !isCompleted && handleNumberInput(num)}
                  className={`aspect-square flex flex-col items-center justify-center border rounded-xl transition-all shadow-sm relative ${
                    isCompleted 
                      ? 'bg-purple-50 border-purple-100 text-purple-200 cursor-default' 
                      : 'bg-white border-purple-200 text-purple-900 hover:border-purple-600 hover:bg-purple-50'
                  }`}
                >
                  <span className="text-2xl font-bold leading-none">{num}</span>
                  <span className={`text-[10px] mt-0.5 font-medium ${isCompleted ? 'text-purple-200' : 'text-purple-400'}`}>
                    {stats.remaining}
                  </span>
                  {isCompleted && (
                    <div className="absolute top-0 right-0 p-0.5">
                      <div className="w-1.5 h-1.5 bg-purple-400 rounded-full" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Auto-complete Magic Wand Button */}
          <AnimatePresence>
            {remainingCellsCount <= 9 && remainingCellsCount > 0 && !gameState.isGameOver && (
              <motion.div
                initial={{ opacity: 0, scale: 0.5, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.5, y: 20 }}
                className="absolute -top-16 left-0 right-0 flex justify-center z-30"
              >
                <button
                  onClick={handleAutoComplete}
                  disabled={gameState.isAutoFilling}
                  className={`flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-full font-bold shadow-lg shadow-orange-200 transition-all ${
                    gameState.isAutoFilling ? 'opacity-80 scale-95' : 'hover:scale-105 animate-pulse'
                  }`}
                >
                  <Wand2 size={20} className={gameState.isAutoFilling ? 'animate-spin' : ''} />
                  <span>{gameState.isAutoFilling ? '자동 채우는 중...' : '자동 완성하기'}</span>
                  <Sparkles size={16} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-4 gap-4">
          <button 
            onClick={() => setIsNotesMode(!isNotesMode)}
            className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
              isNotesMode ? 'bg-purple-600 border-purple-600 text-white shadow-lg shadow-purple-100' : 'bg-white border-purple-200 text-purple-600 hover:border-purple-400'
            }`}
          >
            <Pencil size={20} />
            <span className="text-xs font-bold uppercase tracking-wider">메모 {isNotesMode ? 'On' : 'Off'}</span>
          </button>
          <button 
            onClick={handleHint}
            disabled={gameState.noHints}
            className={`flex flex-col items-center gap-2 p-4 bg-white rounded-2xl border border-purple-200 text-purple-600 hover:border-purple-400 transition-all shadow-sm ${gameState.noHints ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
          >
            <Lightbulb size={20} />
            <span className="text-xs font-bold uppercase tracking-wider">{gameState.noHints ? '잠김' : '힌트'}</span>
          </button>
          <button 
            onClick={handleErase}
            className="flex flex-col items-center gap-2 p-4 bg-white rounded-2xl border border-purple-200 text-purple-600 hover:border-purple-400 transition-all shadow-sm"
          >
            <Eraser size={20} />
            <span className="text-xs font-bold uppercase tracking-wider">지우기</span>
          </button>
          <button 
            onClick={() => startNewGame()}
            className="flex flex-col items-center gap-2 p-4 bg-white rounded-2xl border border-purple-200 text-purple-600 hover:border-purple-400 transition-all shadow-sm"
          >
            <RotateCcw size={20} />
            <span className="text-xs font-bold uppercase tracking-wider">초기화</span>
          </button>
        </div>
      </div>
    </div>
  );
}
