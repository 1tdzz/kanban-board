import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import cors from "cors";
import type { Request, Response, NextFunction } from "express";
import { initSchema, migrateUsersTable, openDb } from "./db";
import { signToken, verifyToken } from "./auth";

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

const CORS_ALLOWED = new Set([
  CLIENT_ORIGIN,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

const dataDir = path.resolve(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = openDb();
initSchema(db);
migrateUsersTable(db);

const DEFAULT_BOARD_TITLE = "Моя доска";

function getPrimaryBoardId(userId: number): number {
  const board =
    (db
      .prepare("SELECT id FROM boards WHERE user_id = ? ORDER BY id LIMIT 1")
      .get(userId) as { id: number } | undefined) ?? null;

  if (!board) {
    const info = db
      .prepare("INSERT INTO boards (user_id, title) VALUES (?, ?)")
      .run(userId, DEFAULT_BOARD_TITLE);
    return Number(info.lastInsertRowid);
  }
  return board.id;
}

type AuthedRequest = Request & { userId?: number };

function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  const token = h?.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token) return res.status(401).json({ error: "unauthorized" });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "invalid_token" });
  req.userId = payload.sub;
  next();
}

const app = express();

app.use(
  cors({
    credentials: true,
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (CORS_ALLOWED.has(origin)) return cb(null, true);
      cb(null, false);
    },
  }),
);
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/auth/me", authMiddleware, (req: AuthedRequest, res) => {
  const row = db
    .prepare("SELECT id, username, email, extra_info as extraInfo FROM users WHERE id = ?")
    .get(req.userId!) as
    | { id: number; username: string; email: string | null; extraInfo: string | null }
    | undefined;
  if (!row) return res.status(404).json({ error: "user_not_found" });
  res.json(row);
});

app.post("/auth/register", (req, res) => {
  const username = String(req.body?.username ?? "").trim();
  const email = String(req.body?.email ?? "").trim();
  const extraInfo = String(req.body?.extraInfo ?? "").trim();

  if (!username) return res.status(400).json({ error: "username_required" });
  if (!email) return res.status(400).json({ error: "email_required" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "email_invalid" });

  const takenEmail = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: number } | undefined;
  if (takenEmail) return res.status(409).json({ error: "email_taken" });

  try {
    const info = db
      .prepare("INSERT INTO users (username, email, extra_info) VALUES (?, ?, ?)")
      .run(username, email, extraInfo || null);
    const userId = Number(info.lastInsertRowid);
    getPrimaryBoardId(userId);
    const token = signToken(userId);
    return res.status(201).json({
      token,
      user: { id: userId, username, email, extraInfo: extraInfo || null },
    });
  } catch (e: unknown) {
    const msg = String((e as { message?: string })?.message ?? "");
    if (msg.includes("UNIQUE")) {
      if (msg.toLowerCase().includes("username")) return res.status(409).json({ error: "username_taken" });
      return res.status(409).json({ error: "duplicate" });
    }
    return res.status(500).json({ error: "internal_error" });
  }
});

app.post("/auth/login", (req, res) => {
  const username = String(req.body?.username ?? "").trim();
  if (!username) return res.status(400).json({ error: "username_required" });

  const row = db
    .prepare("SELECT id, username, email, extra_info as extraInfo FROM users WHERE username = ?")
    .get(username) as
    | { id: number; username: string; email: string | null; extraInfo: string | null }
    | undefined;

  if (!row) return res.status(404).json({ error: "user_not_found" });
  const token = signToken(row.id);
  return res.json({ token, user: row });
});

app.get("/board", authMiddleware, (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const boardId = getPrimaryBoardId(userId);

  const board = db
    .prepare("SELECT id, title FROM boards WHERE id = ? AND user_id = ?")
    .get(boardId, userId) as { id: number; title: string } | undefined;

  if (!board) return res.status(404).json({ error: "board_not_found" });

  const columns = db
    .prepare(
      "SELECT id, board_id as boardId, title, position FROM columns WHERE board_id = ? ORDER BY position ASC, id ASC",
    )
    .all(boardId) as Array<{
    id: number;
    boardId: number;
    title: string;
    position: number;
  }>;

  const cards = db
    .prepare(
      `SELECT id, column_id as columnId, title, description, due_date as dueDate, position
       FROM cards
       WHERE column_id IN (SELECT id FROM columns WHERE board_id = ?)
       ORDER BY position ASC, id ASC`,
    )
    .all(boardId) as Array<{
    id: number;
    columnId: number;
    title: string;
    description: string;
    dueDate: string | null;
    position: number;
  }>;

  res.json({ board, columns, cards });
});

app.post("/columns", authMiddleware, (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const boardId = getPrimaryBoardId(userId);
  const title = String(req.body?.title ?? "").trim();
  if (!title) return res.status(400).json({ error: "title_required" });

  const posRow = db
    .prepare("SELECT COALESCE(MAX(position), -1) as maxPos FROM columns WHERE board_id = ?")
    .get(boardId) as { maxPos: number };
  const position = Number(posRow.maxPos) + 1;

  const info = db
    .prepare("INSERT INTO columns (board_id, title, position) VALUES (?, ?, ?)")
    .run(boardId, title, position);

  res.status(201).json({ id: info.lastInsertRowid, boardId, title, position });
});

app.delete("/columns/:id", authMiddleware, (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const boardId = getPrimaryBoardId(userId);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });

  const info = db.prepare("DELETE FROM columns WHERE id = ? AND board_id = ?").run(id, boardId);
  if (info.changes === 0) return res.status(404).json({ error: "column_not_found" });
  res.status(204).send();
});

app.post("/cards", authMiddleware, (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const boardId = getPrimaryBoardId(userId);
  const columnId = Number(req.body?.columnId);
  const title = String(req.body?.title ?? "").trim();
  if (!Number.isFinite(columnId)) return res.status(400).json({ error: "invalid_columnId" });
  if (!title) return res.status(400).json({ error: "title_required" });

  const col = db
    .prepare("SELECT id FROM columns WHERE id = ? AND board_id = ?")
    .get(columnId, boardId) as { id: number } | undefined;
  if (!col) return res.status(404).json({ error: "column_not_found" });

  const posRow = db
    .prepare("SELECT COALESCE(MAX(position), -1) as maxPos FROM cards WHERE column_id = ?")
    .get(columnId) as { maxPos: number };
  const position = Number(posRow.maxPos) + 1;

  const info = db
    .prepare("INSERT INTO cards (column_id, title, position) VALUES (?, ?, ?)")
    .run(columnId, title, position);

  res.status(201).json({
    id: info.lastInsertRowid,
    columnId,
    title,
    description: "",
    dueDate: null,
    position,
  });
});

app.delete("/cards/:id", authMiddleware, (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const boardId = getPrimaryBoardId(userId);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });

  const row = db
    .prepare(
      `SELECT c.id FROM cards c
       INNER JOIN columns col ON col.id = c.column_id
       WHERE c.id = ? AND col.board_id = ?`,
    )
    .get(id, boardId) as { id: number } | undefined;
  if (!row) return res.status(404).json({ error: "card_not_found" });

  db.prepare("DELETE FROM cards WHERE id = ?").run(id);
  res.status(204).send();
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] http://localhost:${PORT}`);
});
