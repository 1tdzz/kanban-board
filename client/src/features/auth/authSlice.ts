import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

const STORAGE_TOKEN = "kanban_token";
const STORAGE_USER = "kanban_user";

export type User = {
  id: number;
  username: string;
  email: string | null;
  extraInfo: string | null;
};

type AuthState = {
  token: string | null;
  user: User | null;
};

function readPersisted(): AuthState {
  try {
    const token = localStorage.getItem(STORAGE_TOKEN);
    const raw = localStorage.getItem(STORAGE_USER);
    const user = raw ? (JSON.parse(raw) as User) : null;
    return { token: token || null, user };
  } catch {
    return { token: null, user: null };
  }
}

function persistSession(token: string, user: User) {
  localStorage.setItem(STORAGE_TOKEN, token);
  localStorage.setItem(STORAGE_USER, JSON.stringify(user));
}

function clearPersisted() {
  localStorage.removeItem(STORAGE_TOKEN);
  localStorage.removeItem(STORAGE_USER);
}

export const login = createAsyncThunk<
  { token: string; user: User },
  string,
  { rejectValue: string }
>("auth/login", async (username, { rejectWithValue }) => {
  const r = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  const data = (await r.json()) as { error?: string; token?: string; user?: User };
  if (!r.ok) return rejectWithValue(data.error ?? "login_failed");
  if (!data.token || !data.user) return rejectWithValue("invalid_response");
  return { token: data.token, user: data.user };
});

export type RegisterInput = { username: string; email: string; extraInfo: string };

export const register = createAsyncThunk<
  { token: string; user: User },
  RegisterInput,
  { rejectValue: string }
>("auth/register", async (input, { rejectWithValue }) => {
  const r = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: input.username,
      email: input.email,
      extraInfo: input.extraInfo,
    }),
  });
  const data = (await r.json()) as { error?: string; token?: string; user?: User };
  if (!r.ok) return rejectWithValue(data.error ?? "register_failed");
  if (!data.token || !data.user) return rejectWithValue("invalid_response");
  return { token: data.token, user: data.user };
});

const authSlice = createSlice({
  name: "auth",
  initialState: readPersisted() as AuthState,
  reducers: {
    logout(state) {
      state.token = null;
      state.user = null;
      clearPersisted();
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.fulfilled, (state, a) => {
        state.token = a.payload.token;
        state.user = a.payload.user;
        persistSession(a.payload.token, a.payload.user);
      })
      .addCase(register.fulfilled, (state, a) => {
        state.token = a.payload.token;
        state.user = a.payload.user;
        persistSession(a.payload.token, a.payload.user);
      });
  },
});

export const { logout } = authSlice.actions;
export const authReducer = authSlice.reducer;
