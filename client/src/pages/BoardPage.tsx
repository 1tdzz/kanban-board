import { Fragment, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDroppable,
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
        <a href={url} target="_blank" rel="noreferrer" style={{ pointerEvents: "auto" }}>
          <img src={url} alt="" className="card-image-thumb" draggable={false} style={{ pointerEvents: "none" }} />
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

function CardImages({ images, isDragging, isAnyDragging, onDelete, mutationLoading }: {
  images: CardImage[];
  isDragging?: boolean;
  isAnyDragging?: boolean;
  onDelete?: (id: number) => void;
  mutationLoading?: boolean;
}) {
  if (isDragging || images.length === 0) return null;
  return (
    <div className="card-images" style={isAnyDragging ? { pointerEvents: "none" } : undefined}>
      {images.map((img) => (
        <CardImageThumb
          key={img.id}
          image={img}
          onDelete={onDelete ? () => onDelete(img.id) : undefined}
          mutationLoading={mutationLoading}
        />
      ))}
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
  const [originalCardIndex, setOriginalCardIndex] = useState<number | null>(null);
  // Tracks where the dragged card will land for cross-column placeholder animation
  const [dropTarget, setDropTarget] = useState<{ columnId: number; beforeCardId: number | null } | null>(null);
  // Local copies updated optimistically during drag so SortableContexts stay in sync
  const [localColumnIds, setLocalColumnIds] = useState<number[]>([]);
  const [localCardIdsByColumnId, setLocalCardIdsByColumnId] = useState<Record<number, number[]>>({});

  // Confirmation dialogs
  const [pendingDeleteBoard, setPendingDeleteBoard] = useState(false);
  const [pendingDeleteColumn, setPendingDeleteColumn] = useState<{ id: number; title: string } | null>(null);
  const [pendingDeleteCard, setPendingDeleteCard] = useState<{ id: number; title: string } | null>(null);

  // Pan scroll
  const columnsRowRef = useRef<HTMLDivElement>(null);
  const panState = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number; } | null>(null);

  useEffect(() => {
    if (!pendingDeleteBoard && !pendingDeleteColumn && !pendingDeleteCard) return;
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        setPendingDeleteBoard(false);
        setPendingDeleteColumn(null);
        setPendingDeleteCard(null);
      }
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [pendingDeleteBoard, pendingDeleteColumn, pendingDeleteCard]);

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

  function handleDeleteColumn(colId: number, title: string) {
    setPendingDeleteColumn({ id: colId, title });
  }

  async function confirmDeleteColumn() {
    if (!pendingDeleteColumn) return;
    try {
      await dispatch(deleteColumn(pendingDeleteColumn.id)).unwrap();
    } finally {
      setPendingDeleteColumn(null);
    }
  }

  function handleDeleteCard(cardId: number, title: string) {
    setPendingDeleteCard({ id: cardId, title });
  }

  async function confirmDeleteCard() {
    if (!pendingDeleteCard) return;
    try {
      await dispatch(deleteCard(pendingDeleteCard.id)).unwrap();
    } finally {
      setPendingDeleteCard(null);
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
      const cardId = Number(id.replace("card-", ""));
      if (Number.isFinite(cardId)) {
        // Find which column the card currently belongs to in local state
        const columnId = Number(
          Object.entries(localCardIdsByColumnId).find(([, ids]) => ids.includes(cardId))?.[0]
        );
        if (Number.isFinite(columnId)) {
          return { type: "card", cardId, columnId };
        }
        // Fallback: search Redux state
        const reduxColumnId = Number(
          Object.entries(cardIdsByColumnId).find(([, ids]) => ids.includes(cardId))?.[0]
        );
        if (Number.isFinite(reduxColumnId)) {
          return { type: "card", cardId, columnId: reduxColumnId };
        }
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
    if (!overId || !activeId.startsWith("card-")) {
      setDropTarget(null);
      return;
    }

    if (activeDrag.type !== "card") return;

    const cardId = Number(activeId.replace("card-", ""));
    if (!Number.isFinite(cardId)) return;

    const fromColumnId = originalCardColumnId ?? Number(
      Object.entries(localCardIdsByColumnId).find(([, ids]) => ids.includes(cardId))?.[0]
    );
    if (!Number.isFinite(fromColumnId)) return;

    const removeFromSource = (state: Record<number, number[]>) => ({
      ...state,
      [fromColumnId]: (state[fromColumnId] ?? []).filter((id) => id !== cardId),
    });

    const restoreToSourceBefore = (state: Record<number, number[]>, beforeCardId: number) => {
      const sourceIds = (cardIdsByColumnId[fromColumnId] ?? []).filter((id) => id !== cardId);
      const insertAt = sourceIds.indexOf(beforeCardId);
      const nextSourceIds = [...sourceIds];
      nextSourceIds.splice(insertAt === -1 ? nextSourceIds.length : insertAt, 0, cardId);
      return { ...state, [fromColumnId]: nextSourceIds };
    };


    if (overId.startsWith("card-")) {
      const overCardId = Number(overId.replace("card-", ""));
      if (!Number.isFinite(overCardId) || overCardId === cardId) return;

      const overColumnId = Number(
        Object.entries(localCardIdsByColumnId).find(([, ids]) => ids.includes(overCardId))?.[0]
      );
      if (!Number.isFinite(overColumnId)) return;

      if (fromColumnId === overColumnId) {
        setDropTarget(null);
        setLocalCardIdsByColumnId((prev) => {
          const idsBefore = prev[fromColumnId] ?? [];
          if (!idsBefore.includes(cardId)) {
            return restoreToSourceBefore(prev, overCardId);
          }

          const ids = [...idsBefore];
          const oldIndex = ids.indexOf(cardId);
          const newIndex = ids.indexOf(overCardId);
          if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return prev;
          return { ...prev, [fromColumnId]: arrayMove(ids, oldIndex, newIndex) };
        });
        return;
      }

      const overRect = event.over?.rect;
      const activeRect = event.active.rect.current?.translated;
      const insertAfter = !!(
        overRect && activeRect && activeRect.top + activeRect.height / 2 > overRect.top + overRect.height / 2
      );

      const targetIds = localCardIdsByColumnId[overColumnId] ?? [];
      const overIndex = targetIds.indexOf(overCardId);
      const beforeCardId = insertAfter
        ? (overIndex < targetIds.length - 1 ? targetIds[overIndex + 1] : null)
        : overCardId;

      setDropTarget({ columnId: overColumnId, beforeCardId });
      setLocalCardIdsByColumnId((prev) => removeFromSource(prev));
      return;
    }

    if (overId.startsWith("col-top-") || overId.startsWith("col-bottom-") || overId.startsWith("col-empty-")) {
      const prefix = overId.startsWith("col-top-")
        ? "col-top-"
        : overId.startsWith("col-bottom-")
          ? "col-bottom-"
          : "col-empty-";
      const overColumnId = Number(overId.replace(prefix, ""));
      if (!Number.isFinite(overColumnId)) return;
      if (overColumnId === fromColumnId) {
        setDropTarget(null);
        return;
      }

      if (overId.startsWith("col-top-")) {
        const firstCardId = (localCardIdsByColumnId[overColumnId] ?? [])[0] ?? null;
        setDropTarget({ columnId: overColumnId, beforeCardId: firstCardId });
        setLocalCardIdsByColumnId((prev) => removeFromSource(prev));
      } else if (overId.startsWith("col-empty-")) {
        setDropTarget({ columnId: overColumnId, beforeCardId: null });
        setLocalCardIdsByColumnId((prev) => removeFromSource(prev));
      } else {
        setDropTarget({ columnId: overColumnId, beforeCardId: null });
        setLocalCardIdsByColumnId((prev) => removeFromSource(prev));
      }
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const overId = event.over ? String(event.over.id) : null;

    const draggedData = activeDrag;
    const origColumnId = originalCardColumnId;
    const origCardIndex = originalCardIndex;
    setActiveDrag(null);
    setOriginalCardColumnId(null);
    setOriginalCardIndex(null);
    setDropTarget(null);

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
    
      const activeColumnId = draggedData.columnId;
    
      let overColumnId: number | null = null;
    
      if (overId.startsWith("column-")) {
        overColumnId = Number(overId.replace("column-", ""));
      }
    
      if (!Number.isFinite(activeColumnId) || !Number.isFinite(overColumnId)) {
        setLocalColumnIds(columnIds);
        return;
      }
    
      const oldIndex = columnIds.indexOf(activeColumnId);
      const newIndex = columnIds.indexOf(overColumnId);
    
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
        setLocalColumnIds(columnIds);
        return;
      }
    
      const nextColumnIds = arrayMove(columnIds, oldIndex, newIndex);
    
      // Локально обновляем
      setLocalColumnIds(nextColumnIds);
    
      // Сервер
      await dispatch(
        reorderColumns({
          boardId: board.id,
          columnIds: nextColumnIds,
        })
      );
    
      return;
    }

    if (draggedData.type === "card") {
      const cardId = draggedData.cardId;
      const fromColumnId = origColumnId;
      if (fromColumnId === null) return;

      // Cross-column: use dropTarget which was computed with cursor position in handleDragOver
      if (dropTarget !== null) {
        const toColumnId = dropTarget.columnId;
        const fromIds = (localCardIdsByColumnId[fromColumnId] ?? []).filter((id) => id !== cardId);
        const toIds = [...(localCardIdsByColumnId[toColumnId] ?? [])];
        const insertAt = dropTarget.beforeCardId !== null
          ? (toIds.indexOf(dropTarget.beforeCardId) === -1 ? toIds.length : toIds.indexOf(dropTarget.beforeCardId))
          : toIds.length;
        toIds.splice(insertAt, 0, cardId);
        setLocalCardIdsByColumnId({ ...localCardIdsByColumnId, [fromColumnId]: fromIds, [toColumnId]: toIds });
        await dispatch(moveCard({ boardId: board.id, cardId, fromColumnId, toColumnId, toIndex: toIds.indexOf(cardId) }));
        return;
      }

      // Same-column: localCardIdsByColumnId already updated live by handleDragOver
      const toIndex = (localCardIdsByColumnId[fromColumnId] ?? []).indexOf(cardId);
      if (toIndex === -1) return;
      const origIds = cardIdsByColumnId[fromColumnId] ?? [];
      if (origIds.indexOf(cardId) === toIndex) return;
      await dispatch(moveCard({ boardId: board.id, cardId, fromColumnId, toColumnId: fromColumnId, toIndex }));
    }
  }

  const activeCard =
    activeDrag?.type === "card" && cardsById[activeDrag.cardId] ? cardsById[activeDrag.cardId] : null;
  const activeColumn =
    activeDrag?.type === "column" && columnsById[activeDrag.columnId] ? columnsById[activeDrag.columnId] : null;

  const displayColumnIds = activeDrag ? localColumnIds : columnIds;
  const displayCardIdsByColumnId = activeDrag ? localCardIdsByColumnId : cardIdsByColumnId;

  return (
    <div className="board-page">
      <header className="app-bar">
        <div className="app-bar-left">
          <Link className="back-link" to="/boards">← Доски</Link>
          {editingBoard ? (
            <div className="board-title-edit">
              <input
                autoFocus
                value={boardTitle}
                onChange={(e) => setBoardTitle(e.target.value)}
                onBlur={() => void submitBoardRename()}
                onKeyDown={(e) =>
                  handleEditorKeyDown(e, submitBoardRename, () => {
                    setEditingBoard(false);
                    setBoardTitle(board?.title ?? "");
                  })
                }
              />
              <button className="btn-primary btn-sm" onClick={() => void submitBoardRename()} disabled={mutationLoading || !boardTitle.trim()}>
                Сохранить
              </button>
            </div>
          ) : (
            <>
              <span className="app-bar-title">{board?.title ?? "…"}</span>
              {board && (
                <button className="btn-ghost btn-sm" onClick={() => setEditingBoard(true)}>
                  Переименовать
                </button>
              )}
            </>
          )}
        </div>
        <div className="app-bar-right">
          <span className="app-bar-user">
            {user?.username}{user?.email ? ` · ${user.email}` : ""}
          </span>
          <button className="btn-danger btn-sm" onClick={() => setPendingDeleteBoard(true)} disabled={!board || mutationLoading}>
            Удалить доску
          </button>
          <button className="btn-secondary btn-sm" onClick={onLogout}>Выйти</button>
        </div>
      </header>

      <div className="board-content">
        {boardLoading && !board && <div className="loading-msg">Загрузка…</div>}
        {error && error !== "board_not_found" && <div className="error-msg">{error}</div>}

        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={(event) => {
            const activeId = String(event.active.id);
            // Sync local state first so getDragData can look up columnId
            setLocalColumnIds(columnIds);
            setLocalCardIdsByColumnId(cardIdsByColumnId);
            let data: DragData | null = null;
            if (activeId.startsWith("card-")) {
              const cardId = Number(activeId.replace("card-", ""));
              const columnId = Number(
                Object.entries(cardIdsByColumnId).find(([, ids]) => ids.includes(cardId))?.[0]
              );
              if (Number.isFinite(cardId) && Number.isFinite(columnId)) {
                data = { type: "card", cardId, columnId };
              }
            } else if (activeId.startsWith("column-")) {
              const columnId = Number(activeId.replace("column-", ""));
              if (Number.isFinite(columnId)) data = { type: "column", columnId };
            }
            setActiveDrag(data);
            if (data?.type === "card") {
              setOriginalCardColumnId(data.columnId);
              setOriginalCardIndex((cardIdsByColumnId[data.columnId] ?? []).indexOf(data.cardId));
            }
          }}
          onDragOver={(event) => void handleDragOver(event)}
          onDragEnd={(event) => void handleDragEnd(event)}
          onDragCancel={() => {
            setActiveDrag(null);
            setOriginalCardColumnId(null);
            setOriginalCardIndex(null);
            setDropTarget(null);
            setLocalColumnIds(columnIds);
            setLocalCardIdsByColumnId(cardIdsByColumnId);
          }}
        >
          <SortableContext items={displayColumnIds.map((id) => `column-${id}`)} strategy={horizontalListSortingStrategy}>
            <div
              className="columns-row"
              ref={columnsRowRef}
              onMouseDown={(e) => {
                const target = e.target as HTMLElement;
                // Only start pan if clicking on the row background, not on interactive elements
                if (target.closest("button, input, textarea, a, .card, .column-header")) return;
                if (e.button !== 0) return;
                
                // Начальные координаты и скролл по обеим осям
                panState.current = { 
                  startX: e.clientX, 
                  startY: e.clientY,
                  scrollLeft: columnsRowRef.current?.scrollLeft ?? 0, 
                  scrollTop: columnsRowRef.current?.scrollTop ?? 0
                };
                
                e.currentTarget.style.cursor = "grabbing";
                e.currentTarget.style.userSelect = "none";
                // Предотвращение выделение текста и стандартный dnd
                e.preventDefault();
              }}
              onMouseMove={(e) => {
                if (!panState.current || !columnsRowRef.current) return;
                
                const dx = e.clientX - panState.current.startX;
                const dy = e.clientY - panState.current.startY;
                
                // Обновляем скролл по обеим осям (инвертируем, чтобы тянуть контент за собой)
                columnsRowRef.current.scrollLeft = panState.current.scrollLeft - dx;
                columnsRowRef.current.scrollTop = panState.current.scrollTop - dy;
              }}
              onMouseUp={(e) => {
                panState.current = null;
                e.currentTarget.style.cursor = "";
                e.currentTarget.style.userSelect = "";
              }}
              onMouseLeave={(e) => {
                panState.current = null;
                e.currentTarget.style.cursor = "";
                e.currentTarget.style.userSelect = "";
              }}
            >
              {displayColumnIds.map((colId) => {
                const col = columnsById[colId];
                if (!col) return null;
                return (
                  <SortableColumn
                    key={col.id}
                    column={col}
                    cards={(displayCardIdsByColumnId[col.id] ?? []).map((id) => cardsById[id]).filter(Boolean)}
                    isEditingColumn={editingColumnId === col.id}
                    columnTitle={columnTitle}
                    mutationLoading={mutationLoading}
                    newCardTitle={newCardTitles[col.id] ?? ""}
                    editingCardId={editingCardId}
                    cardDraft={cardDraft}
                    activeDragCardId={activeDrag?.type === "card" ? activeDrag.cardId : null}
                    isAnyDragging={activeDrag !== null}
                    dropTarget={dropTarget?.columnId === col.id ? dropTarget : null}
                    onColumnTitleChange={setColumnTitle}
                    onStartColumnRename={startColumnRename}
                    onSubmitColumnRename={() => void submitColumnRename()}
                    onCancelColumnRename={() => {
                      setEditingColumnId(null);
                      setColumnTitle("");
                    }}
                    onDeleteColumn={() => handleDeleteColumn(col.id, col.title)}
                    onNewCardTitleChange={(value) =>
                      setNewCardTitles((current) => ({ ...current, [col.id]: value }))
                    }
                    onCreateCard={() => void handleCreateCard(col.id)}
                    onStartCardEditing={startCardEditing}
                    onCardDraftChange={setCardDraft}
                    onSubmitCardEdit={() => void submitCardEdit()}
                    onCancelCardEdit={() => {
                      setEditingCardId(null);
                      setCardDraft({ title: "", description: "", dueDate: "" });
                    }}
                    onDeleteCard={(cardId) => {
                      const card = cardsById[cardId];
                      handleDeleteCard(cardId, card?.title ?? "");
                    }}
                    onHandleEditorKeyDown={handleEditorKeyDown}
                    imagesByCardId={imagesByCardId}
                    onUploadImage={(cardId, file) => void dispatch(uploadCardImage({ cardId, file }))}
                    onDeleteImage={(cardId, imageId) => void dispatch(deleteCardImage({ cardId, imageId }))}
                  />
                );
              })}

              {board && (
                <div className="add-column-form">
                  <input
                    value={newColumnTitle}
                    onChange={(e) => setNewColumnTitle(e.target.value)}
                    placeholder="Новая колонка…"
                    onKeyDown={(e) => { if (e.key === "Enter") void handleCreateColumn(); }}
                  />
                  <button className="btn-primary btn-sm" onClick={() => void handleCreateColumn()} disabled={mutationLoading || !newColumnTitle.trim()}>
                    +
                  </button>
                </div>
              )}
            </div>
          </SortableContext>

          <DragOverlay dropAnimation={null}>
            {activeCard ? (
              <div className="card dragging">
                <span className="card-title">{activeCard.title}</span>
              </div>
            ) : activeColumn ? (
              <div className="column dragging">
                <span className="column-title">{activeColumn.title}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Delete board dialog */}
      {pendingDeleteBoard && (
        <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setPendingDeleteBoard(false); }}>
          <div className="dialog" role="dialog" aria-modal="true">
            <h3 className="dialog-title">Удалить доску?</h3>
            <p className="dialog-text">Доска «{board?.title}» будет удалена вместе со всеми колонками и карточками.</p>
            <div className="dialog-actions">
              <button className="btn-secondary btn-sm" onClick={() => setPendingDeleteBoard(false)}>Отмена</button>
              <button className="btn-danger btn-sm" onClick={() => { setPendingDeleteBoard(false); void handleDeleteBoard(); }} disabled={mutationLoading}>Удалить</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete column dialog */}
      {pendingDeleteColumn && (
        <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setPendingDeleteColumn(null); }}>
          <div className="dialog" role="dialog" aria-modal="true">
            <h3 className="dialog-title">Удалить колонку?</h3>
            <p className="dialog-text">Колонка «{pendingDeleteColumn.title}» будет удалена вместе со всеми карточками.</p>
            <div className="dialog-actions">
              <button className="btn-secondary btn-sm" onClick={() => setPendingDeleteColumn(null)}>Отмена</button>
              <button className="btn-danger btn-sm" onClick={() => void confirmDeleteColumn()} disabled={mutationLoading}>Удалить</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete card dialog */}
      {pendingDeleteCard && (
        <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setPendingDeleteCard(null); }}>
          <div className="dialog" role="dialog" aria-modal="true">
            <h3 className="dialog-title">Удалить карточку?</h3>
            <p className="dialog-text">Карточка «{pendingDeleteCard.title}» будет удалена безвозвратно.</p>
            <div className="dialog-actions">
              <button className="btn-secondary btn-sm" onClick={() => setPendingDeleteCard(null)}>Отмена</button>
              <button className="btn-danger btn-sm" onClick={() => void confirmDeleteCard()} disabled={mutationLoading}>Удалить</button>
            </div>
          </div>
        </div>
      )}
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
  isAnyDragging: boolean;
  dropTarget: { columnId: number; beforeCardId: number | null } | null;
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

function ColumnTopZone({ columnId, hasCards }: { columnId: number; hasCards: boolean }) {
  const { setNodeRef } = useDroppable({ id: `col-top-${columnId}` });
  return <div ref={setNodeRef} style={{ height: hasCards ? 4 : 0 }} />;
}

function ColumnBottomZone({ columnId }: { columnId: number }) {
  const { setNodeRef } = useDroppable({ id: `col-bottom-${columnId}` });
  return <div ref={setNodeRef} style={{ minHeight: 4, flex: 1 }} />;
}

function EmptyColumnDropZone({ columnId }: { columnId: number }) {
  const { setNodeRef } = useDroppable({ id: `col-empty-${columnId}` });
  return <div ref={setNodeRef} className="card-list-empty">Нет карточек</div>;
}

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
        <div className="column-rename-form">
          <input
            autoFocus
            value={props.columnTitle}
            onChange={(e) => props.onColumnTitleChange(e.target.value)}
            onBlur={props.onSubmitColumnRename}
            onKeyDown={(e) => props.onHandleEditorKeyDown(e, props.onSubmitColumnRename, props.onCancelColumnRename)}
          />
          <button className="btn-primary btn-sm" onClick={props.onSubmitColumnRename} disabled={props.mutationLoading || !props.columnTitle.trim()}>
            Сохранить
          </button>
          <button className="btn-secondary btn-sm" type="button" onClick={props.onCancelColumnRename}>
            Отмена
          </button>
        </div>
      ) : (
        <div className="column-header">
          <button className="drag-handle" type="button" {...attributes} {...listeners}>
            ⠿
          </button>
          <span className="column-title">{props.column.title}</span>
          <div className="column-header-actions">
            <button className="btn-ghost btn-sm" onClick={() => props.onStartColumnRename(props.column.id, props.column.title)}>✎</button>
            <button className="btn-danger btn-sm" onClick={props.onDeleteColumn} disabled={props.mutationLoading}>✕</button>
          </div>
        </div>
      )}

      <div className="card-list">
        {props.cards.length > 0 && <ColumnTopZone columnId={props.column.id} hasCards />}
        <SortableContext items={props.cards.map((card) => `card-${card.id}`)} strategy={verticalListSortingStrategy}>
          {props.cards.length === 0 ? (
            props.dropTarget ? (
              <div className="card-drop-placeholder" />
            ) : (
              <EmptyColumnDropZone columnId={props.column.id} />
            )
          ) : (
            <>
              {props.cards.map((card) => (
                <Fragment key={card.id}>
                  {props.dropTarget?.beforeCardId === card.id && <div className="card-drop-placeholder" />}
                  <SortableCard
                    card={card}
                    columnId={props.column.id}
                    isEditing={props.editingCardId === card.id}
                    cardDraft={props.cardDraft}
                    mutationLoading={props.mutationLoading}
                    images={props.imagesByCardId[card.id] ?? []}
                    isDragPlaceholder={props.activeDragCardId === card.id}
                    isAnyDragging={props.isAnyDragging}
                    dropTarget={props.dropTarget}
                    onStartEditing={() => props.onStartCardEditing(card)}
                    onCardDraftChange={props.onCardDraftChange}
                    onSubmit={() => props.onSubmitCardEdit()}
                    onCancel={props.onCancelCardEdit}
                    onDelete={() => props.onDeleteCard(card.id)}
                    onUploadImage={(file) => props.onUploadImage(card.id, file)}
                    onDeleteImage={(imageId) => props.onDeleteImage(card.id, imageId)}
                  />
                </Fragment>
              ))}
              {props.dropTarget?.beforeCardId === null && <div className="card-drop-placeholder" />}
            </>
          )}
        </SortableContext>
        {props.cards.length > 0 && <ColumnBottomZone columnId={props.column.id} />}
      </div>

      <div className="add-card-form">
        <input
          value={props.newCardTitle}
          onChange={(e) => props.onNewCardTitleChange(e.target.value)}
          placeholder="Новая карточка…"
          onKeyDown={(e) => { if (e.key === "Enter") props.onCreateCard(); }}
        />
        <button className="btn-primary btn-sm" onClick={props.onCreateCard} disabled={props.mutationLoading || !props.newCardTitle.trim()}>
          +
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
  isDragPlaceholder?: boolean;
  isAnyDragging?: boolean;
  dropTarget?: { columnId: number; beforeCardId: number | null } | null;
};

function SortableCard(props: SortableCardProps) {
  const dispatch = useAppDispatch();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `card-${props.card.id}`,
    data: { columnId: props.columnId },
  });

  // Fetch images on mount so they show in view mode without opening editor
  const hasFetchedImages = useRef(false);

  useEffect(() => {
    if (!hasFetchedImages.current) {
      hasFetchedImages.current = true;
      void dispatch(fetchCardImages(props.card.id));
    }
  }, [props.card.id, dispatch]);

  const isCrossColumnDrag = props.isDragPlaceholder && props.isAnyDragging &&
    props.dropTarget !== null && props.dropTarget.columnId !== props.columnId;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : "none",
  };

  // Same-column drag: show teal placeholder in place of the card
  if (props.isDragPlaceholder && !isCrossColumnDrag) {
    return <div ref={setNodeRef} style={style} className="card-drop-placeholder" />;
  }

  // Cross-column drag: remove card from source column so only target placeholder is visible
  if (isCrossColumnDrag) {
    return <div ref={setNodeRef} style={{ display: "none" }} />;
  }

  return (
    <div ref={setNodeRef} style={style} className={`card${isDragging ? " dragging" : ""}`}>
      <div className="card-top">
        <button className="drag-handle" type="button" {...attributes} {...listeners}>
          ⠿
        </button>
        <span className="card-title">{props.card.title}</span>
        {!props.isEditing && (
          <div className="card-actions">
            <button className="btn-ghost btn-sm" onClick={props.onStartEditing}>✎</button>
            <button className="btn-danger btn-sm" onClick={props.onDelete} disabled={props.mutationLoading}>✕</button>
          </div>
        )}
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
            rows={3}
          />
          <input
            type="date"
            value={props.cardDraft.dueDate}
            onChange={(e) => props.onCardDraftChange({ ...props.cardDraft, dueDate: e.target.value })}
          />
          <CardImages images={props.images} isDragging={props.isDragPlaceholder} isAnyDragging={props.isAnyDragging} onDelete={props.onDeleteImage} mutationLoading={props.mutationLoading} />
          <label className="card-image-upload">
            + Добавить картинку
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
          <div className="row">
            <button className="btn-primary btn-sm" type="submit" disabled={props.mutationLoading || !props.cardDraft.title.trim()}>
              Сохранить
            </button>
            <button className="btn-secondary btn-sm" type="button" onClick={props.onCancel}>
              Отмена
            </button>
          </div>
        </form>
      ) : (
        <>
          {props.card.description && (
            <div className="card-desc">{props.card.description}</div>
          )}
          {props.card.dueDate && (
            <div className="card-meta">до {props.card.dueDate}</div>
          )}
          <CardImages images={props.images} isDragging={props.isDragPlaceholder} isAnyDragging={props.isAnyDragging} />
        </>
      )}
    </div>
  );
}
