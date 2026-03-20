import { SudokuBoard, SudokuCell } from '../types';

export const generateFullBoard = (): number[][] => {
  const board: number[][] = Array(9).fill(null).map(() => Array(9).fill(0));
  
  const isValid = (row: number, col: number, num: number): boolean => {
    for (let x = 0; x < 9; x++) if (board[row][x] === num) return false;
    for (let x = 0; x < 9; x++) if (board[x][col] === num) return false;
    
    const startRow = row - (row % 3);
    const startCol = col - (col % 3);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (board[i + startRow][j + startCol] === num) return false;
      }
    }
    return true;
  };

  const solve = (): boolean => {
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (board[row][col] === 0) {
          const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - 0.5);
          for (const num of nums) {
            if (isValid(row, col, num)) {
              board[row][col] = num;
              if (solve()) return true;
              board[row][col] = 0;
            }
          }
          return false;
        }
      }
    }
    return true;
  };

  solve();
  return board;
};

export const createPuzzle = (fullBoard: number[][], difficulty: string): SudokuBoard => {
  const puzzle: SudokuBoard = fullBoard.map((row) =>
    row.map((val) => ({
      value: val,
      initialValue: val,
      isCorrect: true,
      isNotes: [],
    }))
  );

  let attempts = 0;
  let cellsToRemove = 0;
  switch (difficulty) {
    case '초급': cellsToRemove = 35; break;
    case '중급': cellsToRemove = 45; break;
    case '고급': cellsToRemove = 55; break;
    default: cellsToRemove = 35;
  }

  while (attempts < cellsToRemove) {
    const row = Math.floor(Math.random() * 9);
    const col = Math.floor(Math.random() * 9);
    if (puzzle[row][col].value !== null) {
      puzzle[row][col].value = null;
      puzzle[row][col].initialValue = null;
      attempts++;
    }
  }

  return puzzle;
};

export const checkWin = (board: SudokuBoard): boolean => {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (board[r][c].value === null || !board[r][c].isCorrect) return false;
    }
  }
  return true;
};

export const isValidMove = (board: number[][], row: number, col: number, num: number): boolean => {
  for (let x = 0; x < 9; x++) if (board[row][x] === num) return false;
  for (let x = 0; x < 9; x++) if (board[x][col] === num) return false;
  
  const startRow = row - (row % 3);
  const startCol = col - (col % 3);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (board[i + startRow][j + startCol] === num) return false;
    }
  }
  return true;
};
