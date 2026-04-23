import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { Board, BoardPayload, BoardsPayload, Card, CardImage, Column } from "./types";
import { login, logout, register } from "../auth/authSlice";

type KanbanState = {
  boards: Board[];
  board: Board | null;
  columnsById: Record<number, Column>;
  columnIds: number[];
  cardsById: Record<number, Card>;
  cardIdsByColumnId: Record<number, number[]>;
  imagesByCardId: Record<number, CardImage[]>;
  boardsLoading: boolean;
  boardLoading: boolean;
  mutationLoading: boolean;
  error: string | null;
};

const initialState: KanbanState = {
  boards: [],
  board: null,
  columnsById: {},
  columnIds: [],
  cardsById: {},
  cardIdsByColumnId: {},
  imagesByCardId: {},
  boardsLoading: false,
  boardLoading: false,
  mutationLoading: false,
  error: null,
};

type Rootish = { auth: { token: string | null } };

function authHeader(getState: () => unknown): HeadersInit {
  const token = (getState() as Rootish).auth.token;
  if (!token) return { "Content-Type": "application/json" };
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function readJson<T>(r: Response): Promise<T> {
  return (await r.json()) as T;
}

async function readError(r: Response, fallback: string) {
  try {
    const data = (await r.json()) as { error?: string };
    return data.error ?? fallback;
  } catch {
    return fallback;
  }
}

function normalize(payload: BoardPayload) {
  const columnsById: Record<number, Column> = {};
  const columnIds = payload.columns
    .slice()
    .sort((a, b) => a.position - b.position || a.id - b.id)
    .map((c) => {
      columnsById[c.id] = c;
      return c.id;
    });

  const cardsById: Record<number, Card> = {};
  const cardIdsByColumnId: Record<number, number[]> = {};
  for (const colId of columnIds) cardIdsByColumnId[colId] = [];

  const sortedCards = payload.cards.slice().sort((a, b) => a.position - b.position || a.id - b.id);

  for (const card of sortedCards) {
    cardsById[card.id] = card;
    if (!cardIdsByColumnId[card.columnId]) cardIdsByColumnId[card.columnId] = [];
    cardIdsByColumnId[card.columnId].push(card.id);
  }

  return { columnsById, columnIds, cardsById, cardIdsByColumnId };
}

function clearBoardState(state: KanbanState) {
  state.board = null;
  state.columnsById = {};
  state.columnIds = [];
  state.cardsById = {};
  state.cardIdsByColumnId = {};
}

function applyBoardPayload(state: KanbanState, payload: BoardPayload) {
  state.board = payload.board;
  const existing = state.boards.find((item) => item.id === payload.board.id);
  if (existing) {
    existing.title = payload.board.title;
  } else {
    state.boards.push(payload.board);
  }
  const n = normalize(payload);
  state.columnsById = n.columnsById;
  state.columnIds = n.columnIds;
  state.cardsById = n.cardsById;
  state.cardIdsByColumnId = n.cardIdsByColumnId;
}

export const fetchBoards = createAsyncThunk("kanban/fetchBoards", async (_, { getState, rejectWithValue }) => {
  const token = (getState() as Rootish).auth.token;
  if (!token) return rejectWithValue("not_authenticated");

  const r = await fetch("/api/boards", { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 401) return rejectWithValue("unauthorized");
  if (!r.ok) return rejectWithValue(await readError(r, `http_${r.status}`));
  return (await readJson<BoardsPayload>(r)).boards;
});

export const createBoard = createAsyncThunk(
  "kanban/createBoard",
  async (title: string, { getState, rejectWithValue }) => {
    const r = await fetch("/api/boards", {
      method: "POST",
      headers: authHeader(getState),
      body: JSON.stringify({ title }),
    });
    if (!r.ok) return rejectWithValue(await readError(r, `http_${r.status}`));
    return await readJson<Board>(r);
  },
);

export const renameBoard = createAsyncThunk(
  "kanban/renameBoard",
  async (args: { boardId: number; title: string }, { getState, rejectWithValue }) => {
    const r = await fetch(`/api/boards/${args.boardId}`, {
      method: "PATCH",
      headers: authHeader(getState),
      body: JSON.stringify({ title: args.title }),
    });
    if (!r.ok) return rejectWithValue(await readError(r, `http_${r.status}`));
    return await readJson<Board>(r);
  },
);

export const deleteBoard = createAsyncThunk(
  "kanban/deleteBoard",
  async (boardId: number, { getState, rejectWithValue }) => {
    const r = await fetch(`/api/boards/${boardId}`, {
      method: "DELETE",
      headers: authHeader(getState),
    });
    if (!r.ok && r.status !== 204) return rejectWithValue(await readError(r, `http_${r.status}`));
    return boardId;
  },
);

export const fetchBoard = createAsyncThunk(
  "kanban/fetchBoard",
  async (boardId: number, { getState, rejectWithValue }) => {
    const token = (getState() as Rootish).auth.token;
    if (!token) return rejectWithValue("not_authenticated");

    const r = await fetch(`/api/boards/${boardId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 401) return rejectWithValue("unauthorized");
    if (!r.ok) return rejectWithValue(await readError(r, `http_${r.status}`));
    return await readJson<BoardPayload>(r);
  },
);

export const reorderColumns = createAsyncThunk(
  "kanban/reorderColumns",
  async (args: { boardId: number; columnIds: number[] }, { getState, rejectWithValue }) => {
    const r = await fetch(`/api/boards/${args.boardId}/columns/reorder`, {
      method: "PATCH",
      headers: authHeader(getState),
      body: JSON.stringify({ columnIds: args.columnIds }),
    });
    if (!r.ok) return rejectWithValue(await readError(r, `http_${r.status}`));
    return await readJson<BoardPayload>(r);
  },
);

export const addColumn = createAsyncThunk(
  "kanban/addColumn",
  async (args: { boardId: number; title: string }, { getState, rejectWithValue }) => {
    const r = await fetch(`/api/boards/${args.boardId}/columns`, {
      method: "POST",
      headers: authHeader(getState),
      body: JSON.stringify({ title: args.title }),
    });
    if (!r.ok) return rejectWithValue(await readError(r, `http_${r.status}`));
    return await readJson<Column>(r);
  },
);

export const renameColumn = createAsyncThunk(
  "kanban/renameColumn",
  async (args: { columnId: number; title: string }, { getState, rejectWithValue }) => {
    const r = await fetch(`/api/columns/${args.columnId}`, {
      method: "PATCH",
      headers: authHeader(getState),
      body: JSON.stringify({ title: args.title }),
    });
    if (!r.ok) return rejectWithValue(await readError(r, `http_${r.status}`));
    return await readJson<Column>(r);
  },
);

export const deleteColumn = createAsyncThunk(
  "kanban/deleteColumn",
  async (columnId: number, { getState, rejectWithValue }) => {
    const r = await fetch(`/api/columns/${columnId}`, {
      method: "DELETE",
      headers: authHeader(getState),
    });
    if (!r.ok && r.status !== 204) return rejectWithValue(await readError(r, `http_${r.status}`));
    return columnId;
  },
);

export const moveCard = createAsyncThunk(
  "kanban/moveCard",
  async (
    args: { boardId: number; cardId: number; fromColumnId: number; toColumnId: number; toIndex: number },
    { getState, rejectWithValue },
  ) => {
    const r = await fetch(`/api/boards/${args.boardId}/cards/move`, {
      method: "PATCH",
      headers: authHeader(getState),
      body: JSON.stringify(args),
    });
    if (!r.ok) return rejectWithValue(await readError(r, `http_${r.status}`));
    return await readJson<BoardPayload>(r);
  },
);

export const addCard = createAsyncThunk(
  "kanban/addCard",
  async (args: { columnId: number; title: string }, { getState, rejectWithValue }) => {
    const r = await fetch(`/api/columns/${args.columnId}/cards`, {
      method: "POST",
      headers: authHeader(getState),
      body: JSON.stringify({ title: args.title }),
    });
    if (!r.ok) return rejectWithValue(await readError(r, `http_${r.status}`));
    return await readJson<Card>(r);
  },
);

export const updateCard = createAsyncThunk(
  "kanban/updateCard",
  async (
    args: { cardId: number; title?: string; description?: string; dueDate?: string | null },
    { getState, rejectWithValue },
  ) => {
    const r = await fetch(`/api/cards/${args.cardId}`, {
      method: "PATCH",
      headers: authHeader(getState),
      body: JSON.stringify(args),
    });
    if (!r.ok) return rejectWithValue(await readError(r, `http_${r.status}`));
    return await readJson<Card>(r);
  },
);

export const deleteCard = createAsyncThunk(
  "kanban/deleteCard",
  async (cardId: number, { getState, rejectWithValue }) => {
    const r = await fetch(`/api/cards/${cardId}`, {
      method: "DELETE",
      headers: authHeader(getState),
    });
    if (!r.ok && r.status !== 204) return rejectWithValue(await readError(r, `http_${r.status}`));
    return cardId;
  },
);

export const fetchCardImages = createAsyncThunk(
  "kanban/fetchCardImages",
  async (cardId: number, { getState, rejectWithValue }) => {
    const r = await fetch(`/api/cards/${cardId}/images`, { headers: authHeader(getState) });
    if (!r.ok) return rejectWithValue(await readError(r, `http_${r.status}`));
    const data = (await r.json()) as { images: CardImage[] };
    return { cardId, images: data.images };
  },
);

export const uploadCardImage = createAsyncThunk(
  "kanban/uploadCardImage",
  async (args: { cardId: number; file: File }, { getState, rejectWithValue }) => {
    const token = (getState() as Rootish).auth.token;
    const headers: HeadersInit = { "Content-Type": args.file.type };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const r = await fetch(`/api/cards/${args.cardId}/images`, {
      method: "POST",
      headers,
      body: args.file,
    });
    if (!r.ok) return rejectWithValue(await readError(r, `http_${r.status}`));
    const image = (await r.json()) as CardImage;
    return { cardId: args.cardId, image };
  },
);

export const deleteCardImage = createAsyncThunk(
  "kanban/deleteCardImage",
  async (args: { cardId: number; imageId: number }, { getState, rejectWithValue }) => {
    const r = await fetch(`/api/card-images/${args.imageId}`, {
      method: "DELETE",
      headers: authHeader(getState),
    });
    if (!r.ok && r.status !== 204) return rejectWithValue(await readError(r, `http_${r.status}`));
    return args;
  },
);

const kanbanSlice = createSlice({
  name: "kanban",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchBoards.pending, (s) => {
        s.boardsLoading = true;
        s.error = null;
      })
      .addCase(fetchBoards.fulfilled, (s, a) => {
        s.boardsLoading = false;
        s.boards = a.payload;
      })
      .addCase(fetchBoards.rejected, (s, a) => {
        s.boardsLoading = false;
        s.error = typeof a.payload === "string" ? a.payload : (a.error.message ?? "Ошибка загрузки досок");
      })
      .addCase(createBoard.pending, (s) => {
        s.mutationLoading = true;
        s.error = null;
      })
      .addCase(createBoard.fulfilled, (s, a) => {
        s.mutationLoading = false;
        s.boards.push(a.payload);
      })
      .addCase(createBoard.rejected, (s, a) => {
        s.mutationLoading = false;
        s.error = typeof a.payload === "string" ? a.payload : (a.error.message ?? "Ошибка создания доски");
      })
      .addCase(renameBoard.pending, (s) => {
        s.mutationLoading = true;
        s.error = null;
      })
      .addCase(renameBoard.fulfilled, (s, a) => {
        s.mutationLoading = false;
        const board = s.boards.find((item) => item.id === a.payload.id);
        if (board) board.title = a.payload.title;
        if (s.board?.id === a.payload.id) s.board.title = a.payload.title;
      })
      .addCase(renameBoard.rejected, (s, a) => {
        s.mutationLoading = false;
        s.error = typeof a.payload === "string" ? a.payload : (a.error.message ?? "Ошибка переименования доски");
      })
      .addCase(deleteBoard.pending, (s) => {
        s.mutationLoading = true;
        s.error = null;
      })
      .addCase(deleteBoard.fulfilled, (s, a) => {
        s.mutationLoading = false;
        s.boards = s.boards.filter((board) => board.id !== a.payload);
        if (s.board?.id === a.payload) clearBoardState(s);
      })
      .addCase(deleteBoard.rejected, (s, a) => {
        s.mutationLoading = false;
        s.error = typeof a.payload === "string" ? a.payload : (a.error.message ?? "Ошибка удаления доски");
      })
      .addCase(fetchBoard.pending, (s) => {
        s.boardLoading = true;
        s.error = null;
      })
      .addCase(fetchBoard.fulfilled, (s, a) => {
        s.boardLoading = false;
        applyBoardPayload(s, a.payload);
      })
      .addCase(fetchBoard.rejected, (s, a) => {
        s.boardLoading = false;
        clearBoardState(s);
        s.error = typeof a.payload === "string" ? a.payload : (a.error.message ?? "Ошибка загрузки доски");
      })
      .addCase(reorderColumns.pending, (s) => {
        s.mutationLoading = true;
        s.error = null;
      })
      .addCase(reorderColumns.fulfilled, (s, a) => {
        s.mutationLoading = false;
        applyBoardPayload(s, a.payload);
      })
      .addCase(reorderColumns.rejected, (s, a) => {
        s.mutationLoading = false;
        s.error = typeof a.payload === "string" ? a.payload : (a.error.message ?? "Ошибка изменения порядка колонок");
      })
      .addCase(addColumn.pending, (s) => {
        s.mutationLoading = true;
        s.error = null;
      })
      .addCase(addColumn.fulfilled, (s, a) => {
        s.mutationLoading = false;
        const col = a.payload;
        s.columnsById[col.id] = col;
        s.columnIds.push(col.id);
        s.cardIdsByColumnId[col.id] = [];
      })
      .addCase(addColumn.rejected, (s, a) => {
        s.mutationLoading = false;
        s.error = typeof a.payload === "string" ? a.payload : (a.error.message ?? "Ошибка создания колонки");
      })
      .addCase(renameColumn.pending, (s) => {
        s.mutationLoading = true;
        s.error = null;
      })
      .addCase(renameColumn.fulfilled, (s, a) => {
        s.mutationLoading = false;
        if (s.columnsById[a.payload.id]) s.columnsById[a.payload.id] = a.payload;
      })
      .addCase(renameColumn.rejected, (s, a) => {
        s.mutationLoading = false;
        s.error = typeof a.payload === "string" ? a.payload : (a.error.message ?? "Ошибка переименования колонки");
      })
      .addCase(deleteColumn.pending, (s) => {
        s.mutationLoading = true;
        s.error = null;
      })
      .addCase(deleteColumn.fulfilled, (s, a) => {
        s.mutationLoading = false;
        const colId = a.payload;
        delete s.columnsById[colId];
        s.columnIds = s.columnIds.filter((id) => id !== colId);

        const cardIds = s.cardIdsByColumnId[colId] ?? [];
        for (const cardId of cardIds) delete s.cardsById[cardId];
        delete s.cardIdsByColumnId[colId];
      })
      .addCase(deleteColumn.rejected, (s, a) => {
        s.mutationLoading = false;
        s.error = typeof a.payload === "string" ? a.payload : (a.error.message ?? "Ошибка удаления колонки");
      })
      .addCase(moveCard.pending, (s) => {
        s.mutationLoading = true;
        s.error = null;
      })
      .addCase(moveCard.fulfilled, (s, a) => {
        s.mutationLoading = false;
        applyBoardPayload(s, a.payload);
      })
      .addCase(moveCard.rejected, (s, a) => {
        s.mutationLoading = false;
        s.error = typeof a.payload === "string" ? a.payload : (a.error.message ?? "Ошибка перемещения карточки");
      })
      .addCase(addCard.pending, (s) => {
        s.mutationLoading = true;
        s.error = null;
      })
      .addCase(addCard.fulfilled, (s, a) => {
        s.mutationLoading = false;
        const card = a.payload;
        s.cardsById[card.id] = card;
        if (!s.cardIdsByColumnId[card.columnId]) s.cardIdsByColumnId[card.columnId] = [];
        s.cardIdsByColumnId[card.columnId].push(card.id);
      })
      .addCase(addCard.rejected, (s, a) => {
        s.mutationLoading = false;
        s.error = typeof a.payload === "string" ? a.payload : (a.error.message ?? "Ошибка создания карточки");
      })
      .addCase(updateCard.pending, (s) => {
        s.mutationLoading = true;
        s.error = null;
      })
      .addCase(updateCard.fulfilled, (s, a) => {
        s.mutationLoading = false;
        if (s.cardsById[a.payload.id]) s.cardsById[a.payload.id] = a.payload;
      })
      .addCase(updateCard.rejected, (s, a) => {
        s.mutationLoading = false;
        s.error = typeof a.payload === "string" ? a.payload : (a.error.message ?? "Ошибка обновления карточки");
      })
      .addCase(deleteCard.pending, (s) => {
        s.mutationLoading = true;
        s.error = null;
      })
      .addCase(deleteCard.fulfilled, (s, a) => {
        s.mutationLoading = false;
        const cardId = a.payload;
        const card = s.cardsById[cardId];
        if (card) {
          s.cardIdsByColumnId[card.columnId] = (s.cardIdsByColumnId[card.columnId] ?? []).filter(
            (id) => id !== cardId,
          );
        }
        delete s.cardsById[cardId];
        delete s.imagesByCardId[cardId];
      })
      .addCase(deleteCard.rejected, (s, a) => {
        s.mutationLoading = false;
        s.error = typeof a.payload === "string" ? a.payload : (a.error.message ?? "Ошибка удаления карточки");
      })
      .addCase(fetchCardImages.fulfilled, (s, a) => {
        s.imagesByCardId[a.payload.cardId] = a.payload.images;
      })
      .addCase(uploadCardImage.fulfilled, (s, a) => {
        const { cardId, image } = a.payload;
        if (!s.imagesByCardId[cardId]) s.imagesByCardId[cardId] = [];
        s.imagesByCardId[cardId].push(image);
      })
      .addCase(deleteCardImage.fulfilled, (s, a) => {
        const { cardId, imageId } = a.payload;
        if (s.imagesByCardId[cardId]) {
          s.imagesByCardId[cardId] = s.imagesByCardId[cardId].filter((img) => img.id !== imageId);
        }
      })
      .addCase(logout, () => ({ ...initialState }))
      .addCase(login.fulfilled, () => ({ ...initialState }))
      .addCase(register.fulfilled, () => ({ ...initialState }));
  },
});

export const kanbanReducer = kanbanSlice.reducer;
