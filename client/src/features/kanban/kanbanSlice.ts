import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { Board, BoardPayload, Card, Column } from "./types";
import { login, logout, register } from "../auth/authSlice";

type KanbanState = {
  board: Board | null;
  columnsById: Record<number, Column>;
  columnIds: number[];
  cardsById: Record<number, Card>;
  cardIdsByColumnId: Record<number, number[]>;
  loading: boolean;
  error: string | null;
};

const initialState: KanbanState = {
  board: null,
  columnsById: {},
  columnIds: [],
  cardsById: {},
  cardIdsByColumnId: {},
  loading: false,
  error: null,
};

type Rootish = { auth: { token: string | null } };

function authHeader(getState: () => unknown): HeadersInit {
  const token = (getState() as Rootish).auth.token;
  if (!token) return { "Content-Type": "application/json" };
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
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

export const fetchBoard = createAsyncThunk("kanban/fetchBoard", async (_, { getState, rejectWithValue }) => {
  const token = (getState() as Rootish).auth.token;
  if (!token) return rejectWithValue("not_authenticated");

  const r = await fetch("/api/board", { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 401) return rejectWithValue("unauthorized");
  if (!r.ok) return rejectWithValue(`http_${r.status}`);
  return (await r.json()) as BoardPayload;
});

export const addColumn = createAsyncThunk("kanban/addColumn", async (title: string, { getState }) => {
  const r = await fetch("/api/columns", {
    method: "POST",
    headers: authHeader(getState),
    body: JSON.stringify({ title }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as Column;
});

export const deleteColumn = createAsyncThunk("kanban/deleteColumn", async (columnId: number, { getState }) => {
  const r = await fetch(`/api/columns/${columnId}`, {
    method: "DELETE",
    headers: authHeader(getState),
  });
  if (!r.ok && r.status !== 204) throw new Error(`HTTP ${r.status}`);
  return columnId;
});

export const addCard = createAsyncThunk(
  "kanban/addCard",
  async (args: { columnId: number; title: string }, { getState }) => {
    const r = await fetch("/api/cards", {
      method: "POST",
      headers: authHeader(getState),
      body: JSON.stringify(args),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as Card;
  },
);

export const deleteCard = createAsyncThunk("kanban/deleteCard", async (cardId: number, { getState }) => {
  const r = await fetch(`/api/cards/${cardId}`, {
    method: "DELETE",
    headers: authHeader(getState),
  });
  if (!r.ok && r.status !== 204) throw new Error(`HTTP ${r.status}`);
  return cardId;
});

const kanbanSlice = createSlice({
  name: "kanban",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchBoard.pending, (s) => {
        s.loading = true;
        s.error = null;
      })
      .addCase(fetchBoard.fulfilled, (s, a) => {
        s.loading = false;
        s.board = a.payload.board;
        const n = normalize(a.payload);
        s.columnsById = n.columnsById;
        s.columnIds = n.columnIds;
        s.cardsById = n.cardsById;
        s.cardIdsByColumnId = n.cardIdsByColumnId;
      })
      .addCase(fetchBoard.rejected, (s, a) => {
        s.loading = false;
        s.error =
          typeof a.payload === "string"
            ? a.payload
            : (a.error.message ?? "Ошибка загрузки");
      })
      .addCase(addColumn.fulfilled, (s, a) => {
        const col = a.payload;
        s.columnsById[col.id] = col;
        s.columnIds.push(col.id);
        s.cardIdsByColumnId[col.id] = [];
      })
      .addCase(deleteColumn.fulfilled, (s, a) => {
        const colId = a.payload;
        delete s.columnsById[colId];
        s.columnIds = s.columnIds.filter((id) => id !== colId);

        const cardIds = s.cardIdsByColumnId[colId] ?? [];
        for (const cardId of cardIds) delete s.cardsById[cardId];
        delete s.cardIdsByColumnId[colId];
      })
      .addCase(addCard.fulfilled, (s, a) => {
        const card = a.payload;
        s.cardsById[card.id] = card;
        if (!s.cardIdsByColumnId[card.columnId]) s.cardIdsByColumnId[card.columnId] = [];
        s.cardIdsByColumnId[card.columnId].push(card.id);
      })
      .addCase(deleteCard.fulfilled, (s, a) => {
        const cardId = a.payload;
        const card = s.cardsById[cardId];
        if (card) {
          s.cardIdsByColumnId[card.columnId] = (s.cardIdsByColumnId[card.columnId] ?? []).filter(
            (id) => id !== cardId,
          );
        }
        delete s.cardsById[cardId];
      })
      .addCase(logout, () => ({ ...initialState }))
      .addCase(login.fulfilled, () => ({ ...initialState }))
      .addCase(register.fulfilled, () => ({ ...initialState }));
  },
});

export const kanbanReducer = kanbanSlice.reducer;
