import { useEffect, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { logout } from "../features/auth/authSlice";
import { createBoard, deleteBoard, fetchBoards, renameBoard } from "../features/kanban/kanbanSlice";

export default function BoardsPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector((s) => s.auth.user);
  const { boards, boardsLoading, mutationLoading, error } = useAppSelector((s) => s.kanban);

  const [newBoardTitle, setNewBoardTitle] = useState("");
  const [editingBoardId, setEditingBoardId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [boardPendingDelete, setBoardPendingDelete] = useState<{ id: number; title: string } | null>(null);

  useEffect(() => {
    dispatch(fetchBoards());
  }, [dispatch]);

  useEffect(() => {
    if (!boardPendingDelete) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") setBoardPendingDelete(null);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [boardPendingDelete]);

  async function handleCreateBoard() {
    const title = newBoardTitle.trim();
    if (!title) return;
    try {
      const board = await dispatch(createBoard(title)).unwrap();
      setNewBoardTitle("");
      navigate(`/boards/${board.id}`);
    } catch {
      // error is stored in slice
    }
  }

  function startEditing(boardId: number, title: string) {
    setEditingBoardId(boardId);
    setEditingTitle(title);
  }

  async function submitRename() {
    const title = editingTitle.trim();
    if (!editingBoardId || !title) {
      setEditingBoardId(null);
      setEditingTitle("");
      return;
    }
    try {
      await dispatch(renameBoard({ boardId: editingBoardId, title })).unwrap();
    } finally {
      setEditingBoardId(null);
      setEditingTitle("");
    }
  }

  function handleRenameKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); void submitRename(); }
    if (e.key === "Escape") { setEditingBoardId(null); setEditingTitle(""); }
  }

  function requestDeleteBoard(boardId: number, title: string) {
    setBoardPendingDelete({ id: boardId, title });
  }

  async function confirmDeleteBoard() {
    if (!boardPendingDelete) return;
    try {
      await dispatch(deleteBoard(boardPendingDelete.id)).unwrap();
      setBoardPendingDelete(null);
    } catch {
      // error is stored in slice
    }
  }

  function closeDeleteDialog() {
    setBoardPendingDelete(null);
  }

  function handleDialogBackdropMouseDown(e: ReactMouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) closeDeleteDialog();
  }

  function onLogout() {
    dispatch(logout());
    navigate("/login", { replace: true });
  }

  return (
    <>
      <div>
        <header className="app-bar">
          <div className="app-bar-left">
            <span className="app-bar-title">Kanban</span>
            <span className="app-bar-user">
              {user?.username}{user?.email ? ` · ${user.email}` : ""}
            </span>
          </div>
          <div className="app-bar-right">
            <button className="btn-secondary btn-sm" onClick={onLogout}>Выйти</button>
          </div>
        </header>

        <div className="boards-page">
          {error && <div className="error-msg">Ошибка: {error}</div>}

          <div className="boards-create">
            <input
              value={newBoardTitle}
              onChange={(e) => setNewBoardTitle(e.target.value)}
              placeholder="Название новой доски"
              onKeyDown={(e) => { if (e.key === "Enter") void handleCreateBoard(); }}
            />
            <button
              className="btn-primary btn-sm"
              onClick={() => void handleCreateBoard()}
              disabled={mutationLoading || !newBoardTitle.trim()}
            >
              Создать
            </button>
          </div>

          <h2>Мои доски</h2>

          {boardsLoading && <div className="loading-msg">Загрузка…</div>}
          {!boardsLoading && boards.length === 0 && (
            <div className="boards-empty">Досок пока нет — создайте первую</div>
          )}

          <ul className="boards-list">
            {boards.map((board) => (
              <li key={board.id} className="board-item">
                {editingBoardId === board.id ? (
                  <div className="board-item-rename">
                    <input
                      autoFocus
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => void submitRename()}
                      onKeyDown={handleRenameKeyDown}
                    />
                    <button className="btn-primary btn-sm" onClick={() => void submitRename()} disabled={mutationLoading || !editingTitle.trim()}>
                      Сохранить
                    </button>
                    <button className="btn-secondary btn-sm" onClick={() => { setEditingBoardId(null); setEditingTitle(""); }}>
                      Отмена
                    </button>
                  </div>
                ) : (
                  <>
                    <Link className="board-item-link" to={`/boards/${board.id}`}>{board.title}</Link>
                    <div className="board-item-actions">
                      <button className="btn-ghost btn-sm" onClick={() => startEditing(board.id, board.title)}>
                        Переименовать
                      </button>
                      <button className="btn-danger btn-sm" onClick={() => requestDeleteBoard(board.id, board.title)} disabled={mutationLoading}>
                        Удалить
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {boardPendingDelete && (
        <div className="dialog-backdrop" onMouseDown={handleDialogBackdropMouseDown}>
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="boards-delete-title">
            <h3 id="boards-delete-title" className="dialog-title">Удалить доску?</h3>
            <p className="dialog-text">Доска «{boardPendingDelete.title}» будет удалена вместе со всеми колонками и карточками.</p>
            <div className="dialog-actions">
              <button className="btn-secondary btn-sm" type="button" onClick={closeDeleteDialog}>
                Отмена
              </button>
              <button className="btn-danger btn-sm" type="button" onClick={() => void confirmDeleteBoard()} disabled={mutationLoading}>
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
