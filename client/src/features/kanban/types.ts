export type Board = {
  id: number;
  title: string;
};

export type Column = {
  id: number;
  boardId: number;
  title: string;
  position: number;
};

export type Card = {
  id: number;
  columnId: number;
  title: string;
  description: string;
  dueDate: string | null;
  position: number;
};

export type BoardPayload = {
  board: Board;
  columns: Column[];
  cards: Card[];
};

