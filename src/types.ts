export type Difficulty = '초급' | '중급' | '고급';

export interface SudokuCell {
  value: number | null;
  initialValue: number | null;
  isCorrect: boolean;
  isNotes: number[];
}

export type SudokuBoard = SudokuCell[][];

export interface GameState {
  board: SudokuBoard;
  difficulty: Difficulty;
  mistakes: number;
  time: number;
  isPaused: boolean;
  isGameOver: boolean;
  isStarted: boolean;
  isAutoFilling: boolean;
  selectedCell: [number, number] | null;
}
