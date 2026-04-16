import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { logout } from "../features/auth/authSlice";
import {
  addCard,
  addColumn,
  deleteBoard,
  deleteCard,
  deleteColumn,
  fetchBoard,
  renameBoard,
  renameCard,
  renameColumn,
} from "../features/kanban/kanbanSlice";

export default function BoardPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const params = useParams();
  const boardId = Number(params.boardId);
  const user = useAppSelector((s) => s.auth.user);
  const { board, boardLoading, mutationLoading, error, columnIds, columnsById, cardsById, cardIdsByColumnId } =
    useAppSelector((s) => s.kanban);

  const [newColumnTitle, setNewColumnTitle] = useState("");
  const [editingBoard, setEditingBoard] = useState(false);
  const [boardTitle, setBoardTitle] = useState("");
  const [editingColumnId, setEditingColumnId] = useState<number | null>(null);
  const [columnTitle, setColumnTitle] = useState("");
  const [editingCardId, setEditingCardId] = useState<number | null>(null);
  const [cardTitle, setCardTitle] = useState("");
  const [newCardTitles, setNewCardTitles] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!Number.isFinite(boardId)) {
      navigate("/boards", { replace: true });
      return;
    }
    dispatch(fetchBoard(boardId));
  }, [boardId, dispatch, navigate]);

  useEffect(() => {
    if (board) setBoardTitle(board.title);
  }, [board]);

  useEffect(() => {
    if (error === "unauthorized") {
      dispatch(logout());
      navigate("/login", { replace: true });
      return;
    }
    if (error === "board_not_found") {
      navigate("/boards", { replace: true });
    }
  }, [error, dispatch, navigate]);

  const columns = useMemo(() => columnIds.map((id) => columnsById[id]).filter(Boolean), [columnIds, columnsById]);

  function onLogout() {
    dispatch(logout());
    navigate("/login", { replace: true });
  }

  async function submitBoardRename() {
    const title = boardTitle.trim();
    if (!board || !title) {
      setEditingBoard(false);
      if (board) setBoardTitle(board.title);
      return;
    }

    try {
      await dispatch(renameBoard({ boardId: board.id, title })).unwrap();
    } finally {
      setEditingBoard(false);
    }
  }

  async function handleDeleteBoard() {
    if (!board) return;
    try {
      await dispatch(deleteBoard(board.id)).unwrap();
      navigate("/boards", { replace: true });
    } catch {
      // error is stored in slice
    }
  }

  async function handleCreateColumn() {
    const title = newColumnTitle.trim();
    if (!board || !title) return;
    try {
      await dispatch(addColumn({ boardId: board.id, title })).unwrap();
      setNewColumnTitle("");
    } catch {
      // error is stored in slice
    }
  }

  function startColumnRename(columnId: number, title: string) {
    setEditingColumnId(columnId);
    setColumnTitle(title);
  }

  async function submitColumnRename() {
    const title = columnTitle.trim();
    if (!editingColumnId || !title) {
      setEditingColumnId(null);
      setColumnTitle("");
      return;
    }

    try {
      await dispatch(renameColumn({ columnId: editingColumnId, title })).unwrap();
    } finally {
      setEditingColumnId(null);
      setColumnTitle("");
    }
  }

  function startCardRename(cardId: number, title: string) {
    setEditingCardId(cardId);
    setCardTitle(title);
  }

  async function submitCardRename() {
    const title = cardTitle.trim();
    if (!editingCardId || !title) {
      setEditingCardId(null);
      setCardTitle("");
      return;
    }

    try {
      await dispatch(renameCard({ cardId: editingCardId, title })).unwrap();
    } finally {
      setEditingCardId(null);
      setCardTitle("");
    }
  }

  function handleEditorKeyDown(
    e: KeyboardEvent<HTMLInputElement>,
    submit: () => Promise<void> | void,
    cancel: () => void,
  ) {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
    if (e.key === "Escape") {
      cancel();
    }
  }

  async function handleCreateCard(columnId: number) {
    const title = (newCardTitles[columnId] ?? "").trim();
    if (!title) return;
    try {
      await dispatch(addCard({ columnId, title })).unwrap();
      setNewCardTitles((current) => ({ ...current, [columnId]: "" }));
    } catch {
      // error is stored in slice
    }
  }

  return (
    <div>
      <header>
        <div>
          <div>
            <Link to="/boards">К списку досок</Link>
          </div>
          <div>
            {user?.username}
            {user?.email ? ` · ${user.email}` : ""}
          </div>
          {editingBoard ? (
            <div>
              <input
                autoFocus
                value={boardTitle}
                onChange={(e) => setBoardTitle(e.target.value)}
                onBlur={() => void submitBoardRename()}
                onKeyDown={(e) =>
                  handleEditorKeyDown(
                    e,
                    submitBoardRename,
                    () => {
                      setEditingBoard(false);
                      setBoardTitle(board?.title ?? "");
                    },
                  )
                }
              />
              <button onClick={() => void submitBoardRename()} disabled={mutationLoading || !boardTitle.trim()}>
                Сохранить
              </button>
            </div>
          ) : (
            <div>
              <h1>{board?.title ?? "…"}</h1>
              {board && <button onClick={() => setEditingBoard(true)}>Переименовать доску</button>}
            </div>
          )}
        </div>

        <div>
          <button onClick={handleDeleteBoard} disabled={!board || mutationLoading}>
            Удалить доску
          </button>
          <button onClick={onLogout}>Выйти</button>
        </div>
      </header>

      <main>
        {boardLoading && !board && <div>Загрузка...</div>}
        {error && error !== "board_not_found" && <div>Ошибка: {error}</div>}

        {board && (
          <section>
            <h2>Новая колонка</h2>
            <input
              value={newColumnTitle}
              onChange={(e) => setNewColumnTitle(e.target.value)}
              placeholder="Название колонки"
            />
            <button onClick={() => void handleCreateColumn()} disabled={mutationLoading || !newColumnTitle.trim()}>
              Добавить колонку
            </button>
          </section>
        )}

        <div>
          {columns.map((col) => {
            const cardIds = cardIdsByColumnId[col.id] ?? [];
            return (
              <section key={col.id}>
                {editingColumnId === col.id ? (
                  <div>
                    <input
                      autoFocus
                      value={columnTitle}
                      onChange={(e) => setColumnTitle(e.target.value)}
                      onBlur={() => void submitColumnRename()}
                      onKeyDown={(e) =>
                        handleEditorKeyDown(
                          e,
                          submitColumnRename,
                          () => {
                            setEditingColumnId(null);
                            setColumnTitle("");
                          },
                        )
                      }
                    />
                    <button onClick={() => void submitColumnRename()} disabled={mutationLoading || !columnTitle.trim()}>
                      Сохранить
                    </button>
                  </div>
                ) : (
                  <div>
                    <strong>{col.title}</strong>
                    <button onClick={() => startColumnRename(col.id, col.title)}>Переименовать</button>
                    <button onClick={() => void dispatch(deleteColumn(col.id))} disabled={mutationLoading}>
                      Удалить
                    </button>
                  </div>
                )}

                <div>
                  {cardIds.length === 0 && <div>Пока нет карточек</div>}
                  {cardIds.map((id) => {
                    const card = cardsById[id];
                    if (!card) return null;
                    return (
                      <div key={card.id}>
                        {editingCardId === card.id ? (
                          <div>
                            <input
                              autoFocus
                              value={cardTitle}
                              onChange={(e) => setCardTitle(e.target.value)}
                              onBlur={() => void submitCardRename()}
                              onKeyDown={(e) =>
                                handleEditorKeyDown(
                                  e,
                                  submitCardRename,
                                  () => {
                                    setEditingCardId(null);
                                    setCardTitle("");
                                  },
                                )
                              }
                            />
                            <button onClick={() => void submitCardRename()} disabled={mutationLoading || !cardTitle.trim()}>
                              Сохранить
                            </button>
                          </div>
                        ) : (
                          <div>
                            <span>{card.title}</span>
                            <button onClick={() => startCardRename(card.id, card.title)}>Переименовать</button>
                            <button onClick={() => void dispatch(deleteCard(card.id))} disabled={mutationLoading}>
                              Удалить
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div>
                  <input
                    value={newCardTitles[col.id] ?? ""}
                    onChange={(e) => setNewCardTitles((current) => ({ ...current, [col.id]: e.target.value }))}
                    placeholder="Название карточки"
                  />
                  <button
                    onClick={() => void handleCreateCard(col.id)}
                    disabled={mutationLoading || !(newCardTitles[col.id] ?? "").trim()}
                  >
                    Добавить карточку
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
