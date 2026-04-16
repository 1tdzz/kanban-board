import { useEffect, useState, type KeyboardEvent } from "react";
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

  useEffect(() => {
    dispatch(fetchBoards());
  }, [dispatch]);

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
    if (e.key === "Enter") {
      e.preventDefault();
      void submitRename();
    }
    if (e.key === "Escape") {
      setEditingBoardId(null);
      setEditingTitle("");
    }
  }

  async function handleDeleteBoard(boardId: number) {
    try {
      await dispatch(deleteBoard(boardId)).unwrap();
    } catch {
      // error is stored in slice
    }
  }

  function onLogout() {
    dispatch(logout());
    navigate("/login", { replace: true });
  }

  return (
    <div>
      <header>
        <div>
          <h1>Доски</h1>
          <div>
            {user?.username}
            {user?.email ? ` · ${user.email}` : ""}
          </div>
        </div>

        <button onClick={onLogout}>Выйти</button>
      </header>

      {error && <div>Ошибка: {error}</div>}

      <section>
        <h2>Новая доска</h2>
        <input
          value={newBoardTitle}
          onChange={(e) => setNewBoardTitle(e.target.value)}
          placeholder="Название доски"
        />
        <button onClick={() => void handleCreateBoard()} disabled={mutationLoading || !newBoardTitle.trim()}>
          Создать доску
        </button>
      </section>

      <section>
        <h2>Список досок</h2>
        {boardsLoading && <div>Загрузка...</div>}
        {!boardsLoading && boards.length === 0 && <div>У вас пока нет досок</div>}

        <ul>
          {boards.map((board) => (
            <li key={board.id}>
              {editingBoardId === board.id ? (
                <>
                  <input
                    autoFocus
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onBlur={() => void submitRename()}
                    onKeyDown={handleRenameKeyDown}
                  />
                  <button onClick={() => void submitRename()} disabled={mutationLoading || !editingTitle.trim()}>
                    Сохранить
                  </button>
                </>
              ) : (
                <>
                  <Link to={`/boards/${board.id}`}>{board.title}</Link>
                  <button onClick={() => startEditing(board.id, board.title)}>Переименовать</button>
                </>
              )}
              <button onClick={() => void handleDeleteBoard(board.id)} disabled={mutationLoading}>
                Удалить
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
