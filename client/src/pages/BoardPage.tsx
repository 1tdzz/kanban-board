import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { logout } from "../features/auth/authSlice";
import { addCard, addColumn, deleteCard, deleteColumn, fetchBoard } from "../features/kanban/kanbanSlice";

export default function BoardPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector((s) => s.auth.user);
  const { board, loading, error, columnIds, columnsById, cardsById, cardIdsByColumnId } =
    useAppSelector((s) => s.kanban);

  const [addingColumn, setAddingColumn] = useState(false);

  useEffect(() => {
    dispatch(fetchBoard());
  }, [dispatch]);

  useEffect(() => {
    if (error === "unauthorized") {
      dispatch(logout());
      navigate("/login", { replace: true });
    }
  }, [error, dispatch, navigate]);

  const columns = useMemo(() => columnIds.map((id) => columnsById[id]).filter(Boolean), [columnIds, columnsById]);

  function onLogout() {
    dispatch(logout());
    navigate("/login", { replace: true });
  }

  return (
    <div>
      <header>
        <div>
          <div>
            {user?.username}
            {user?.email ? ` · ${user.email}` : ""}
          </div>
          <h1>{board?.title ?? "…"}</h1>
        </div>

        <div>
          <button onClick={() => dispatch(fetchBoard())} disabled={loading}>
            Обновить
          </button>
          <button
            onClick={async () => {
              const title = prompt("Название колонки");
              if (!title) return;
              setAddingColumn(true);
              try {
                await dispatch(addColumn(title)).unwrap();
              } finally {
                setAddingColumn(false);
              }
            }}
            disabled={loading || addingColumn}
          >
            + Колонка
          </button>
          <button onClick={onLogout}>Выйти</button>
        </div>
      </header>

      <main>
        {loading && !board && <div>Загрузка...</div>}
        {error && <div>Ошибка: {error}</div>}

        <div>
          {columns.map((col) => {
            const cardIds = cardIdsByColumnId[col.id] ?? [];
            return (
              <section key={col.id}>
                <div>
                  <div>{col.title}</div>
                  <button onClick={() => dispatch(deleteColumn(col.id))} title="Удалить колонку">
                    ×
                  </button>
                </div>

                <div>
                  {cardIds.length === 0 && <div>Пока нет карточек</div>}
                  {cardIds.map((id) => {
                    const card = cardsById[id];
                    if (!card) return null;
                    return (
                      <div key={card.id}>
                        <div>
                          <div>{card.title}</div>
                          <button onClick={() => dispatch(deleteCard(card.id))} title="Удалить карточку">
                            ×
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={() => {
                    const title = prompt("Название карточки");
                    if (!title) return;
                    dispatch(addCard({ columnId: col.id, title }));
                  }}
                >
                  + Карточка
                </button>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
