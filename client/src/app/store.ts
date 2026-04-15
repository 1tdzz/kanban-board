import { configureStore } from "@reduxjs/toolkit";
import { authReducer } from "../features/auth/authSlice";
import { kanbanReducer } from "../features/kanban/kanbanSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    kanban: kanbanReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

