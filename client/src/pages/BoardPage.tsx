import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { logout } from "../features/auth/authSlice";
import {
  addCard,
  addColumn,
  deleteBoard,
  deleteCard,
  deleteCardImage,
  deleteColumn,
  fetchBoard,
  fetchCardImages,
  moveCard,
  renameBoard,
  renameColumn,
  reorderColumns,
  updateCard,
  uploadCardImage,
} from "../features/kanban/kanbanSlice";
import type { Card, CardImage, Column } from "../features/kanban/types";

function useImageUrl(imageId: number) {
  const token = useAppSelector((s) => s.auth.token);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    fetch(`/api/card-images/${imageId}/data`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.blob())
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageId, token]);

  return url;
}

function CardImageThumb({ image, onDelete, mutationLoading }: { image: CardImage; onDelete?: () => void; mutationLoading?: boolean }) {
  const url = useImageUrl(image.id);
  return (
    <div className="card-image-item">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt="" className="card-image-thumb" />
        </a>
      ) : (
        <div className="card-image-thumb card-image-loading" />
      )}
      {onDelete && (
        <button type="button" onClick={onDelete} disabled={mutationLoading}>
          Удалить
        </button>
      )}
    </div>
  );
}

type DragData =
  | { type: "column"; columnId: number }
  | { type: "card"; cardId: number; columnId: number };

export default function BoardPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const params = useParams();
  const boardId = Number(params.boardId);
  const user = useAppSelector((s) => s.auth.user);
  const { board, boardLoading, mutationLoading, error, columnIds, columnsById, cardsById, cardIdsByColumnId, imagesByCardId } =
    useAppSelector((s) => s.kanban);

  const [newColumnTitle, setNewColumnTitle] = useState("");
  const [editingBoard, setEditingBoard] = useState(false);
  const [boardTitle, setBoardTitle] = useState("");
  const [editingColumnId, setEditingColumnId] = useState<number | null>(null);
  const [columnTitle, setColumnTitle] = useState("");
  const [newCardTitles, setNewCardTitles] = useState<Record<number, string>>({});
  const [editingCardId, setEditingCardId] = useState<number | null>(null);
  const [cardDraft, setCardDraft] = useState({ title: "", description: "", dueDate: "" });
  const [activeDrag, setActiveDrag] = useState<DragData | null>(null);
  const [originalCardColumnId, setOriginalCardColumnId] = useState<number | null>(null);
  // Local copies updated optimistically during drag so SortableContexts stay in sync
  const [localColumnIds, setLocalColumnIds] = useState<number[]>([]);
  const [localCardIdsByColumnId, setLocalCardIdsByColumnId] = useState<Record<number, number[]>>({});

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

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

  // Keep local drag state in sync with Redux when not dragging
  useEffect(() => {
    if (!activeDrag) {
      setLocalColumnIds(columnIds);
      setLocalCardIdsByColumnId(cardIdsByColumnId);
    }
  }, [activeDrag, columnIds, cardIdsByColumnId]);

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

  function startCardEditing(card: Card) {
    setEditingCardId(card.id);
    setCardDraft({
      title: card.title,
      description: card.description,
      dueDate: card.dueDate ?? "",
    });
    void dispatch(fetchCardImages(card.id));
  }

  async function submitCardEdit(e?: FormEvent) {
    e?.preventDefault();
    if (!editingCardId) return;

    const title = cardDraft.title.trim();
    if (!title) return;

    try {
      await dispatch(
        updateCard({
          cardId: editingCardId,
          title,
          description: cardDraft.description,
          dueDate: cardDraft.dueDate || null,
        }),
      ).unwrap();
      setEditingCardId(null);
      setCardDraft({ title: "", description: "", dueDate: "" });
    } catch {
      // error is stored in slice
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

  function getDragData(id: string): DragData | null {
    if (id.startsWith("card-")) {
      const parts = id.split("-");
      const cardId = Number(parts[1]);
      const columnId = Number(parts[2]);
      if (Number.isFinite(cardId) && Number.isFinite(columnId)) {
        return { type: "card", cardId, columnId };
      }
    }
    if (id.startsWith("column-")) {
      const columnId = Number(id.replace("column-", ""));
      return Number.isFinite(columnId) ? { type: "column", columnId } : null;
    }
    return null;
  }

  function handleDragOver(event: DragOverEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId) return;

    const activeData = getDragData(activeId);
    if (activeData?.type !== "card") return;

    const overData = getDragData(overId);
    if (!overData) return;

    const cardId = activeData.cardId;
    const toColumnId = overData.columnId;

    // Find which column currently holds the card in local state
    const fromColumnId = Object.entries(localCardIdsByColumnId).find(([, ids]) =>
      ids.includes(cardId)
    )?.[0];
    if (!fromColumnId) return;
    const fromColId = Number(fromColumnId);

    if (fromColId === toColumnId) {
      // Reorder within same column
      const ids = localCardIdsByColumnId[fromColId] ?? [];
      const oldIndex = ids.indexOf(cardId);
      const newIndex = overData.type === "card" ? ids.indexOf(overData.cardId) : ids.length;
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      setLocalCardIdsByColumnId((prev) => ({
        ...prev,
        [fromColId]: arrayMove(ids, oldIndex, newIndex),
      }));
    } else {
      // Move card to different column
      const fromIds = (localCardIdsByColumnId[fromColId] ?? []).filter((id) => id !== cardId);
      const toIds = [...(localCardIdsByColumnId[toColumnId] ?? [])];
      const insertAt = overData.type === "card" ? toIds.indexOf(overData.cardId) : toIds.length;
      const safeInsert = insertAt === -1 ? toIds.length : insertAt;
      toIds.splice(safeInsert, 0, cardId);
      setLocalCardIdsByColumnId((prev) => ({
        ...prev,
        [fromColId]: fromIds,
        [toColumnId]: toIds,
      }));
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const overId = event.over ? String(event.over.id) : null;

    const draggedData = activeDrag;
    const origColumnId = originalCardColumnId;
    setActiveDrag(null);
    setOriginalCardColumnId(null);

    if (!board || !draggedData) {
      setLocalColumnIds(columnIds);
      setLocalCardIdsByColumnId(cardIdsByColumnId);
      return;
    }

    if (draggedData.type === "column") {
      if (!overId) {
        setLocalColumnIds(columnIds);
        return;
      }
      const overData = getDragData(overId);
      const overColumnId =
        overData?.type === "column" ? overData.columnId :
        overData?.type === "card" ? overData.columnId : null;
      if (overColumnId === null) {
        setLocalColumnIds(columnIds);
        return;
      }
      const oldIndex = localColumnIds.indexOf(draggedData.columnId);
      const newIndex = localColumnIds.indexOf(overColumnId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
        setLocalColumnIds(columnIds);
        return;
      }
      const nextColumnIds = arrayMove(localColumnIds, oldIndex, newIndex);
      setLocalColumnIds(nextColumnIds);
      await dispatch(reorderColumns({ boardId: board.id, columnIds: nextColumnIds }));
      return;
    }

    if (draggedData.type === "card") {
      const cardId = draggedData.cardId;
      const fromColumnId = origColumnId;
      if (fromColumnId === null) return;

      // Find where the card ended up in local state
      const toColumnId = Number(
        Object.entries(localCardIdsByColumnId).find(([, ids]) => ids.includes(cardId))?.[0]
      );
      if (!Number.isFinite(toColumnId)) return;

      const toIndex = (localCardIdsByColumnId[toColumnId] ?? []).indexOf(cardId);
      if (toIndex === -1) return;

      // If dropped back in same column at same position, no-op
      const origIds = cardIdsByColumnId[fromColumnId] ?? [];
      if (toColumnId === fromColumnId && origIds.indexOf(cardId) === toIndex) return;

      await dispatch(moveCard({ boardId: board.id, cardId, fromColumnId, toColumnId, toIndex }));
    }
  }

  const activeCard =
    activeDrag?.type === "card" && cardsById[activeDrag.cardId] ? cardsById[activeDrag.cardId] : null;
  const activeColumn =
    activeDrag?.type === "column" && columnsById[activeDrag.columnId] ? columnsById[activeDrag.columnId] : null;

  return (
    <div className="page">
      <header className="board-header">
        <div>
          <div>
            <Link to="/boards">К списку досок</Link>
          </div>
          <div>
            {user?.username}
            {user?.email ? ` · ${user.email}` : ""}
          </div>
          {editingBoard ? (
            <div className="field-row-inline">
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

        <div className="field-row-inline">
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
          <section className="inline-form">
            <h2>Новая колонка</h2>
            <div className="field-row-inline">
              <input
                value={newColumnTitle}
                onChange={(e) => setNewColumnTitle(e.target.value)}
                placeholder="Название колонки"
              />
              <button onClick={() => void handleCreateColumn()} disabled={mutationLoading || !newColumnTitle.trim()}>
                Добавить колонку
              </button>
            </div>
          </section>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={(event) => {
            const data = getDragData(String(event.active.id));
            setActiveDrag(data);
            if (data?.type === "card") setOriginalCardColumnId(data.columnId);
            setLocalColumnIds(columnIds);
            setLocalCardIdsByColumnId(cardIdsByColumnId);
          }}
          onDragOver={(event) => void handleDragOver(event)}
          onDragEnd={(event) => void handleDragEnd(event)}
          onDragCancel={() => {
            setActiveDrag(null);
            setOriginalCardColumnId(null);
            setLocalColumnIds(columnIds);
            setLocalCardIdsByColumnId(cardIdsByColumnId);
          }}
        >
          <SortableContext items={localColumnIds.map((id) => `column-${id}`)} strategy={horizontalListSortingStrategy}>
            <div className="columns-row">
              {localColumnIds.map((colId) => {
                const col = columnsById[colId];
                if (!col) return null;
                return (
                  <SortableColumn
                    key={col.id}
                    column={col}
                    cards={(localCardIdsByColumnId[col.id] ?? []).map((id) => cardsById[id]).filter(Boolean)}
                    isEditingColumn={editingColumnId === col.id}
                    columnTitle={columnTitle}
                    mutationLoading={mutationLoading}
                    newCardTitle={newCardTitles[col.id] ?? ""}
                    editingCardId={editingCardId}
                    cardDraft={cardDraft}
                    activeDragCardId={activeDrag?.type === "card" ? activeDrag.cardId : null}
                    onColumnTitleChange={setColumnTitle}
                    onStartColumnRename={startColumnRename}
                    onSubmitColumnRename={() => void submitColumnRename()}
                    onCancelColumnRename={() => {
                      setEditingColumnId(null);
                      setColumnTitle("");
                    }}
                    onDeleteColumn={() => void dispatch(deleteColumn(col.id))}
                    onNewCardTitleChange={(value) =>
                      setNewCardTitles((current) => ({
                        ...current,
                        [col.id]: value,
                      }))
                    }
                    onCreateCard={() => void handleCreateCard(col.id)}
                    onStartCardEditing={startCardEditing}
                    onCardDraftChange={setCardDraft}
                    onSubmitCardEdit={() => void submitCardEdit()}
                    onCancelCardEdit={() => {
                      setEditingCardId(null);
                      setCardDraft({ title: "", description: "", dueDate: "" });
                    }}
                    onDeleteCard={(cardId) => void dispatch(deleteCard(cardId))}
                    onHandleEditorKeyDown={handleEditorKeyDown}
                    imagesByCardId={imagesByCardId}
                    onUploadImage={(cardId, file) => void dispatch(uploadCardImage({ cardId, file }))}
                    onDeleteImage={(cardId, imageId) => void dispatch(deleteCardImage({ cardId, imageId }))}
                  />
                );
              })}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeCard ? (
              <div className="card dragging">
                <strong>{activeCard.title}</strong>
              </div>
            ) : activeColumn ? (
              <div className="column dragging">
                <strong>{activeColumn.title}</strong>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>
    </div>
  );
}

type SortableColumnProps = {
  column: Column;
  cards: Card[];
  isEditingColumn: boolean;
  columnTitle: string;
  mutationLoading: boolean;
  newCardTitle: string;
  editingCardId: number | null;
  cardDraft: { title: string; description: string; dueDate: string };
  activeDragCardId: number | null;
  onColumnTitleChange: (value: string) => void;
  onStartColumnRename: (columnId: number, title: string) => void;
  onSubmitColumnRename: () => void;
  onCancelColumnRename: () => void;
  onDeleteColumn: () => void;
  onNewCardTitleChange: (value: string) => void;
  onCreateCard: () => void;
  onStartCardEditing: (card: Card) => void;
  onCardDraftChange: (value: { title: string; description: string; dueDate: string }) => void;
  onSubmitCardEdit: () => void;
  onCancelCardEdit: () => void;
  onDeleteCard: (cardId: number) => void;
  onHandleEditorKeyDown: (
    e: KeyboardEvent<HTMLInputElement>,
    submit: () => Promise<void> | void,
    cancel: () => void,
  ) => void;
  imagesByCardId: Record<number, CardImage[]>;
  onUploadImage: (cardId: number, file: File) => void;
  onDeleteImage: (cardId: number, imageId: number) => void;
};

function SortableColumn(props: SortableColumnProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `column-${props.column.id}`,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <section ref={setNodeRef} style={style} className={`column${isDragging ? " dragging" : ""}`}>
      {props.isEditingColumn ? (
        <div className="field-row-inline">
          <input
            autoFocus
            value={props.columnTitle}
            onChange={(e) => props.onColumnTitleChange(e.target.value)}
            onBlur={props.onSubmitColumnRename}
            onKeyDown={(e) => props.onHandleEditorKeyDown(e, props.onSubmitColumnRename, props.onCancelColumnRename)}
          />
          <button onClick={props.onSubmitColumnRename} disabled={props.mutationLoading || !props.columnTitle.trim()}>
            Сохранить
          </button>
        </div>
      ) : (
        <div className="column-header">
          <div className="field-row-inline">
            <button className="drag-handle" type="button" {...attributes} {...listeners}>
              ⇅
            </button>
            <strong>{props.column.title}</strong>
          </div>
          <div className="field-row-inline">
            <button onClick={() => props.onStartColumnRename(props.column.id, props.column.title)}>Переименовать</button>
            <button onClick={props.onDeleteColumn} disabled={props.mutationLoading}>
              Удалить
            </button>
          </div>
        </div>
      )}

      <div id={`column-drop-${props.column.id}`} className="card-list">
        <SortableContext items={props.cards.map((card) => `card-${card.id}-${props.column.id}`)} strategy={verticalListSortingStrategy}>
          {props.cards.length === 0 && <div>Перетащите сюда карточку</div>}
          {props.cards.map((card) => {
            if (props.activeDragCardId === card.id) return null;
            return (
              <SortableCard
                key={card.id}
                card={card}
                columnId={props.column.id}
                isEditing={props.editingCardId === card.id}
                cardDraft={props.cardDraft}
                mutationLoading={props.mutationLoading}
                images={props.imagesByCardId[card.id] ?? []}
                onStartEditing={() => props.onStartCardEditing(card)}
                onCardDraftChange={props.onCardDraftChange}
                onSubmit={() => props.onSubmitCardEdit()}
                onCancel={props.onCancelCardEdit}
                onDelete={() => props.onDeleteCard(card.id)}
                onUploadImage={(file) => props.onUploadImage(card.id, file)}
                onDeleteImage={(imageId) => props.onDeleteImage(card.id, imageId)}
              />
            );
          })}
        </SortableContext>
      </div>

      <div className="inline-form">
        <input
          value={props.newCardTitle}
          onChange={(e) => props.onNewCardTitleChange(e.target.value)}
          placeholder="Название карточки"
        />
        <button onClick={props.onCreateCard} disabled={props.mutationLoading || !props.newCardTitle.trim()}>
          Добавить карточку
        </button>
      </div>
    </section>
  );
}

type SortableCardProps = {
  card: Card;
  columnId: number;
  isEditing: boolean;
  cardDraft: { title: string; description: string; dueDate: string };
  mutationLoading: boolean;
  images: CardImage[];
  onStartEditing: () => void;
  onCardDraftChange: (value: { title: string; description: string; dueDate: string }) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onUploadImage: (file: File) => void;
  onDeleteImage: (imageId: number) => void;
};

function SortableCard(props: SortableCardProps) {
  const dispatch = useAppDispatch();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `card-${props.card.id}-${props.columnId}`,
  });

  // Fetch images on mount so they show in view mode without opening editor
  useEffect(() => {
    if (props.images.length === 0) {
      void dispatch(fetchCardImages(props.card.id));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.card.id]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className={`card${isDragging ? " dragging" : ""}`}>
      <div className="field-row-inline">
        <button className="drag-handle" type="button" {...attributes} {...listeners}>
          ↕
        </button>
        <strong>{props.card.title}</strong>
      </div>

      {props.isEditing ? (
        <form
          className="card-editor"
          onSubmit={(e) => {
            e.preventDefault();
            props.onSubmit();
          }}
        >
          <input
            value={props.cardDraft.title}
            onChange={(e) => props.onCardDraftChange({ ...props.cardDraft, title: e.target.value })}
            placeholder="Название"
          />
          <textarea
            value={props.cardDraft.description}
            onChange={(e) => props.onCardDraftChange({ ...props.cardDraft, description: e.target.value })}
            placeholder="Описание"
            rows={4}
          />
          <input
            type="date"
            value={props.cardDraft.dueDate}
            onChange={(e) => props.onCardDraftChange({ ...props.cardDraft, dueDate: e.target.value })}
          />
          <div className="card-images">
            {props.images.map((img) => (
              <CardImageThumb
                key={img.id}
                image={img}
                onDelete={() => props.onDeleteImage(img.id)}
                mutationLoading={props.mutationLoading}
              />
            ))}
          </div>
          <label className="card-image-upload">
            Добавить картинку
            <input
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                files.forEach((f) => props.onUploadImage(f));
                e.target.value = "";
              }}
            />
          </label>
          <div className="field-row-inline">
            <button type="submit" disabled={props.mutationLoading || !props.cardDraft.title.trim()}>
              Сохранить
            </button>
            <button type="button" onClick={props.onCancel}>
              Отмена
            </button>
          </div>
        </form>
      ) : (
        <div className="field-row">
          <div>{props.card.description || "Без описания"}</div>
          <div className="card-meta">Срок: {props.card.dueDate || "не указан"}</div>
          {props.images.length > 0 && (
            <div className="card-images">
              {props.images.map((img) => (
                <CardImageThumb key={img.id} image={img} />
              ))}
            </div>
          )}
          <div className="field-row-inline">
            <button onClick={props.onStartEditing}>Редактировать</button>
            <button onClick={props.onDelete} disabled={props.mutationLoading}>
              Удалить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
