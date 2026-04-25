import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { register } from "../features/auth/authSlice";

const ERR: Record<string, string> = {
  username_required: "Введите имя пользователя",
  email_required: "Введите почту",
  email_invalid: "Некорректный адрес почты",
  username_taken: "Это имя пользователя уже занято",
  email_taken: "Эта почта уже зарегистрирована",
  register_failed: "Не удалось зарегистрироваться",
  invalid_response: "Некорректный ответ сервера",
  duplicate: "Такие данные уже есть в системе",
};

export default function RegisterPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const token = useAppSelector((s) => s.auth.token);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [extraInfo, setExtraInfo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (token) return <Navigate to="/boards" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await dispatch(
        register({
          username: username.trim(),
          email: email.trim(),
          extraInfo: extraInfo.trim(),
        }),
      ).unwrap();
      navigate("/boards", { replace: true });
    } catch (err) {
      const code = typeof err === "string" ? err : "register_failed";
      setError(ERR[code] ?? code);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Регистрация</h1>
        <p className="auth-subtitle">Имя, почта и дополнительная информация о себе</p>

        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            Имя пользователя
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </label>

          <label>
            Электронная почта
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label>
            Дополнительная информация
            <textarea
              value={extraInfo}
              onChange={(e) => setExtraInfo(e.target.value)}
              placeholder="Например: группа, предпочтения по задачам…"
              rows={3}
            />
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Регистрация…" : "Создать аккаунт"}
          </button>
        </form>

        <p className="auth-footer">
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </p>
      </div>
    </div>
  );
}
