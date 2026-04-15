import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { login } from "../features/auth/authSlice";

const ERR: Record<string, string> = {
  username_required: "Введите имя пользователя",
  user_not_found: "Пользователь не найден — сначала зарегистрируйтесь",
  login_failed: "Не удалось войти",
  invalid_response: "Некорректный ответ сервера",
};

export default function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const token = useAppSelector((s) => s.auth.token);
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (token) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await dispatch(login(username.trim())).unwrap();
      if (res.token) navigate("/", { replace: true });
    } catch (err) {
      const code = typeof err === "string" ? err : "login_failed";
      setError(ERR[code] ?? code);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1>Вход</h1>
      <p>Вход по имени пользователя</p>

      <form onSubmit={onSubmit}>
        <label>
          Имя пользователя
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>

        {error && <div>{error}</div>}

        <div>
          <button type="submit" disabled={busy}>
            {busy ? "Вход…" : "Войти"}
          </button>
        </div>
      </form>

      <p>
        Нет аккаунта? <Link to="/register">Регистрация</Link>
      </p>
    </div>
  );
}
