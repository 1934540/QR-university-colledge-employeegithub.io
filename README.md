# BolashaqQR

BolashaqQR - система учета посещаемости через QR-коды для учебной организации. В текущем виде это демонстрационный продукт с рабочим статическим frontend и отдельным Django backend API.

## Что уже есть

- Терминал входа с QR-кодом точки прохода.
- Кабинет сотрудника с QR-сканированием, расписанием и историей посещений.
- Панель администратора с сотрудниками, журналом, настройками и Excel-импортом.
- Представление владельца с отчетами по опозданиям.
- Django backend с моделями сотрудников, расписаний, QR-точек и журналов посещений.
- Seed-команда для демо-данных и базовые API-тесты.

## Структура проекта

```text
BolashaqQR/
├── index.html              # Главный статический интерфейс
├── terminal.html           # Прямой вход в режим терминала
├── employee.html           # Прямой вход в кабинет сотрудника
├── admin.html              # Прямой вход в админский режим
├── owner.html              # Прямой вход в режим владельца
├── app.js                  # Основная frontend-логика демо-приложения
├── style.css               # Общие стили интерфейса
├── mockData.js             # Локальные демо-данные для fallback-режима
├── employee-template.xlsx  # Шаблон импорта сотрудников
├── package.json            # Локальный статический dev-сервер
└── backend/
    ├── manage.py
    ├── requirements.txt
    ├── start_backend.ps1
    ├── bolashaq_api/       # Django project settings/urls
    └── attendance/         # Attendance domain: models, API, services, tests
```

## Локальный запуск frontend

```powershell
npm run dev
```

После запуска откройте:

```text
http://localhost:5173
```

Frontend по умолчанию пытается подключиться к `/api`, если открыт через HTTP, или к `http://127.0.0.1:8000/api`, если открыт как локальный файл. Если backend недоступен, приложение работает в demo/fallback-режиме на `localStorage`.

## Локальный запуск backend

```powershell
cd backend
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py seed_demo
.\.venv\Scripts\python.exe manage.py createsuperuser
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

Полезные адреса:

- Django admin: `http://127.0.0.1:8000/admin/`
- API health: `http://127.0.0.1:8000/api/health/`

Демо-логины сотрудников после `seed_demo`:

- `emp001` / `emp001`
- `emp002` / `emp002`
- `emp004` / `emp004`

## Backend configuration

Все production-настройки задаются через переменные окружения:

```text
DJANGO_SECRET_KEY=...
DJANGO_DEBUG=0
DJANGO_ALLOWED_HOSTS=example.com,www.example.com
CORS_ALLOWED_ORIGINS=https://example.com
BOLASHAQ_ADMIN_API_KEY=change-this-key
BOLASHAQ_REQUIRE_ADMIN_API_KEY=1
```

Если `BOLASHAQ_REQUIRE_ADMIN_API_KEY=1`, чувствительные admin API вроде списка сотрудников и журналов требуют HTTP-заголовок:

```text
X-Bolashaq-Admin-Key: change-this-key
```

Для статического frontend ключ можно указать в консоли браузера:

```js
localStorage.setItem("bolashaq_admin_api_key", "change-this-key");
```

Публичными остаются health endpoint, вход сотрудника, QR точки прохода и сканирование QR.

## Текущее состояние

Это еще не production-система. Главные ограничения:

- frontend остается монолитным статическим приложением;
- часть данных в demo/fallback-режиме хранится в `localStorage`;
- полноценная ролевая авторизация еще не реализована;
- SQLite подходит для локальной разработки, но не для реальной эксплуатации;
- backend и frontend деплоятся отдельно.

## Ближайший roadmap

1. Перенести источник истины полностью в backend.
2. Разделить `app.js` на модули или перейти на frontend-фреймворк.
3. Добавить нормальную авторизацию и роли: сотрудник, администратор, владелец.
4. Перейти на PostgreSQL для production.
5. Расширить API для управления сотрудниками, расписаниями, оправданиями и отчетами.
6. Добавить end-to-end тесты для QR-прохода и админских сценариев.

## Тесты backend

```powershell
cd backend
.\.venv\Scripts\python.exe manage.py test
```
