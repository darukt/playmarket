# Безопасность «Витрины»

Дата прогона: 05.11.2026. Стенд: Go-бэкенд, JSON-хранилище, nginx-гейтвей.

## Что проверяли

| Проверка | Как | Результат |
|---|---|---|
| Открытая БД / файлы данных | HTTP-запросы к `/data/*.json`, `/backend/data/*`, `/seed.json`, `/users.json`, `/scores.json`, `/.env`, `/.git/config`, `/api/../data/seed.json`, traversal через `/uploads/..` | 404 / редирект на 404, содержимое ни разу не отдано |
| SQL-инъекции | `' OR 1=1--`, `" OR "1"="1`, `1; DROP TABLE accounts;--`, `admin'--` в логине, поиске и имени лидерборда | SQL в проекте отсутствует; JSON-хранилище и `encoding/json`; все ответы 4xx, без 5xx и без утечек SQL-ошибок |
| XSS / JS-инъекции | `<script>alert(1)</script>`, `<svg/onload=alert(1)>`, `<img src=x onerror=alert(1)>`, `javascript:alert(1)` в имени счёта и поиске | Валидация имени отклоняет разметку (400); ответы `application/json`; Go экранирует `<` в JSON; React и пререндер экранируют HTML |
| Активные файлы в загрузках | `/uploads/<id>/icon.html`, `.svg`, `.js`, `artifact-windows.exe` | 404: отдаются только разрешённые `webp/png/jpg/jpeg/gif`, причём только из карточки |
| Path traversal в загрузках | `/uploads/../seed.json`, двойное кодирование, `..\\`, подкаталоги | Отклоняется; используется `os.OpenRoot` и проверка состава пути |
| Заголовки безопасности | `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` на API | `nosniff`, `no-referrer`, `DENY` |
| Админ-доступ | Заголовок `X-Admin-Key` без сессии, чужой UUID в `/api/me` | 401; identity берётся только из серверной cookie, а не из query/header |
| TCP-порт | Публичный plaintext-листенер без TLS | Не поднимается (тест `TestTCPPublicListenerRequiresTLS`) |

## Команды

```sh
cd backend
go test ./...                    # весь бэкенд, включая security_test.go
go test ./internal/services/platform/controller/ -run "SQL|XSS|Security|Data|Uploads" -v
```

## Ограничения и что осталось

- Базы SQL нет: каталог и очки лежат в JSON-файлах с атомарной записью
  (`tmp + rename`). Это не «открытая БД» в сетевом смысле: файлы вне корня
  статики, nginx блокирует `/backend`, `/data`, `/internal`, `/.`.
- CSP не задаётся, потому что пререндеренные страницы содержат inline
  JSON-LD; при добавлении CSP нужен nonce/hash. Сейчас защита строится на
  экранировании и отсутствии `dangerouslySetInnerHTML`.
- Ограничение частоты запросов живёт в сервисе очков; на уровне nginx
  rate-limit не настроен.
