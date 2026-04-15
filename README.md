# Kanban Board (React + Express + SQLite)

Аналог Trello/Notion:

- **frontend**: React + Vite (`/client`)
- **backend**: Express + SQLite (`/server`)
- **данные**: SQLite-файл в `server/data/app.db`

## Запуск

Для запуска требуется установленный Node.js, из корня проекта выполнить команды:

```bash
npm install
npm run dev
```

- клиент: `http://127.0.0.1:5173`
- сервер: `http://127.0.0.1:3001`

- `http://127.0.0.1:3001/health` - статус сервера