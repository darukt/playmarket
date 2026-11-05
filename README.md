# Play Market

Каталог приложений и три игры в браузере: «Змейка», 2048 и «Разлом».
Публичная точка входа — nginx. React обращается к относительным `/api/…`,
`/uploads/…`; адресов внутренних сервисов в клиентском коде нет.

## Локальный запуск

Нужны Node.js 22.18+ (или 24), Go 1.25+ и nginx в PATH. При другом расположении
nginx задайте `NGINX_BIN` абсолютным путём. Зависимости: `npm ci`.

В трёх терминалах из корня проекта:

```powershell
# Терминал 1: frontend, доступен только на loopback
npm run dev

# Терминал 2: API, доступен только на loopback
cd backend
$env:PM_PUBLIC_URL = 'http://localhost:8088'
go run ./cmd/server

# Терминал 3: единая точка входа
npm run dev:gateway
```

Открыть **http://localhost:8088**. Открытие Vite напрямую не подключает API.
`node scripts/gateway.mjs --check` проверяет nginx без запуска.
`npm run build` собирает frontend и пререндерит страницы; `PUBLIC_URL`
задаёт адрес для sitemap и canonical URL.

## Публичный запуск через Cloudflare Tunnel на Windows

Нужны те же Node.js, Go и nginx, что для локального запуска. Скачайте официальный
[`cloudflared-windows-amd64.exe`](https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe)
и сохраните как `.runtime/bin/cloudflared.exe`. При необходимости задайте `NGINX_BIN`.
После `npm ci` запустите из корня проекта:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/tunnel.ps1 start
powershell -ExecutionPolicy Bypass -File scripts/tunnel.ps1 status
powershell -ExecutionPolicy Bypass -File scripts/tunnel.ps1 stop
```

`start` создаёт Cloudflare Quick Tunnel, собирает frontend с полученным HTTPS-адресом,
запускает Go API на `127.0.0.1:8081` и nginx на `127.0.0.1:8090`, затем проверяет
публичный `/api/healthz` и выводит ссылку. API получает тот же адрес в `PM_PUBLIC_URL`,
поэтому регистрация, CSRF и Secure-cookie работают через туннель. nginx отдаёт
собранный `dist`; открывать Vite наружу не требуется.

Данные этого запуска хранятся отдельно в `.runtime/tunnel-data`; остановка их
сохраняет. Состояние процессов, конфигурация и логи — в `.runtime/tunnel`.
Скрипт останавливает только собственные процессы. Все эти файлы исключены из Git.
Переменные OAuth и администратора при необходимости передаются через окружение;
скрипт не читает `.env`. Сырой TCP при таком запуске выключен.

Quick Tunnel не требует аккаунта Cloudflare и выдаёт новый временный адрес при
каждом старте. Ссылка доступна, пока работают компьютер и процессы туннеля.
Для постоянного домена нужен именованный туннель Cloudflare и настройка DNS.

## Контейнеры и роли

```sh
docker compose up --build
```

`gateway` собирает и отдаёт статический frontend, проксирует API и WebSocket.
`api` исполняет бизнес-логику, хранит данные в томе `catalog-data`.
Только gateway публикует порт `127.0.0.1:8088`. Порты API/TCP наружу не публикуются.
Сеть private не является Docker internal-сетью: API нужен исходящий HTTPS к Google.

Это модульный монолит Go с разделением доменов. `cmd/server` — только точка запуска:

```text
backend/internal/
  httpx/                     общие HTTP-ответы
  storage/                   атомарная запись данных
  services/
    auth/                    facade + controller / repo / services / test
    catalog/                 controller / repo / services / test
    scores/                  controller / repo / services / test
    platform/                controller / repo / services
    transfers/               services / test
```

`controller` разбирает HTTP; `services` применяет правила; `repo` работает с
хранилищем; `test` проверяет границы и регрессии. Междоменные загрузки, админские
операции и транспорт собраны в platform. Хранилища JSON предполагают **один
процесс API**; несколько реплик потребуют общей БД и хранилища сессий.

## Регистрация и Google

Обычная регистрация доступна через «Войти». Пароль: не менее 12 символов.
Соль и PBKDF2-HMAC-SHA256 с 600 000 итераций; при неизвестном email сервер
выполняет такую же проверку dummy hash. Есть лимиты попыток и параллельных
вычислений. Dummy hash выравнивает стоимость проверки, а не делает слабый пароль
невозможным для подбора.

В Google Cloud Console создайте OAuth Client типа Web application. Redirect URI:

```text
http://localhost:8088/api/auth/google/callback
```

Для публичного сайта используйте HTTPS-домен из `PM_PUBLIC_URL`. Передайте API
`PM_GOOGLE_CLIENT_ID` и `PM_GOOGLE_CLIENT_SECRET`. В compose они читаются из `.env`
(пример — `.env.example`); для `go run` задавайте переменные окружения. Без обеих
настроек Google-вход выключен, обычная регистрация доступна.

OAuth проверяет state, PKCE S256, nonce, подпись Google ID token, issuer, audience,
срок действия и verified email. Аккаунты не связываются автоматически по совпадению
email. Google identity определяется стабильным `sub`.

Сессии серверные, 12 часов; cookie HttpOnly + SameSite=Lax, в HTTPS дополнительно
Secure и префикс `__Host-`. Перезапуск API отзывает все сессии. POST-запросам нужен
`X-CSRF-Token` из `GET /api/auth/session`; клиент получает только свою учётную
запись. Пароли и секреты не передаются через URL.

## Администраторы и handshake

Старый `PM_ADMIN_KEY` / `X-Admin-Key` больше не авторизует запросы.
Для обычного аккаунта добавьте ID из собственной сессии в `PM_ADMIN_USER_IDS`.
Для Google-аккаунтов можно задать `PM_ADMIN_GOOGLE_EMAILS`: учитываются только
подтверждённые Google-идентичности. Локальная регистрация такого email прав не даст.

Задайте отдельный случайный `PM_ADMIN_DEVICE_KEY` длиной минимум 32 байта. После
входа администратор вводит его в форме аккаунта. Сервер выдаёт одноразовый challenge;
браузер возвращает HMAC-SHA256. Доступ открывается на 5 минут и привязан к сессии.
Секрет не сохраняется браузером и не включён в сборку; challenge живёт 60 секунд,
повторное использование запрещено. Админские запросы дополнительно требуют CSRF.

Handshake подтверждает знание отдельного секрета. Аппаратную идентичность
компьютера он не аттестует; HTTPS защищает обмен. Для аппаратной привязки нужны
WebAuthn либо клиентские сертификаты.

`PM_TRUST_PROXY=true` включайте только если API изолирован, а nginx перезаписывает
`X-Real-IP`. В compose это настроено. При самостоятельном размещении TLS должен
завершаться на nginx или доверенном внешнем ingress; HTTP-конфигурация контейнера
предназначена для локальной сети за ним. Для публичного origin auth требует HTTPS.

## TCP и загрузки

Сырой TCP выключен по умолчанию. Для включения нужны `PM_TCP_ADDR` и отдельный
`PM_TCP_KEY` минимум 32 байта. Протокол PM2 использует новый случайный challenge
для каждого соединения. Внешний listener требует TLS-сертификат и ключ через
`PM_TCP_TLS_CERT`, `PM_TCP_TLS_KEY` (TLS 1.3); без TLS допустим только loopback.
Клиент: `go run ./cmd/pmget -h`. PM1 без авторизации удалён.

Веб-загрузки идут нативным механизмом браузера через nginx, без буферизации всего
файла в React и без фиктивной «установки». «Мои загрузки» — локальная история
запросов, не доказательство установки или завершения скачивания.

**Исходный seed не содержит оригинальные APK/EXE приложений.** Для таких записей
сохранены демонстрационные пакеты проекта; реальные артефакты добавляет администратор
через `/api/admin/games`. Приложения Google Play автоматически не распространяются.
`/uploads/` отдаёт только привязанное к каталогу растровое медиа; установщики
доступны через контроллер загрузок, каталог данных через URL не публикуется.

## Проверки

```sh
npm test
npm run lint
npm run build
cd backend
go test ./...
go vet ./...
go test -race ./...
```

На Windows для `-race` нужен C toolchain с CGO. В средах с ограниченным системным
TEMP задайте `TEMP`, `TMP`, `TMPDIR` в доступный каталог рабочего пространства.
Результаты ревью и эксплуатационные ограничения — в `REVIEW.md`.

Скрипты сбора каталога и медиа сохранены: `npm run catalog:collect`,
`npm run catalog:media`; источники — `scripts/base.json`, `src/data/details.json`.
