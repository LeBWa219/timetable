# Расписание — личный планировщик дня

Тёмное стеклянное веб-приложение: записывай дела на сегодня, отмечай выполненные,
видно «сейчас»/«дальше», просроченное и прогресс дня. Данные синхронизируются
через GitHub API в этот же приватный репозиторий — доступны с любого устройства.

**Адрес:** https://lebwa219.github.io/timetable/ (после первого деплоя)

## Синхронизация

Нужен personal access token (fine-grained):

1. Открой https://github.com/settings/personal-access-tokens/new
2. Repository access → **Only select repositories → timetable**
3. Permissions → **Contents: Read and write**
4. Создай токен и вставь его в приложении (⚙ шестерёнка)

Токен хранится только в localStorage твоего устройства. Данные лежат в
`data/timetable.json` этого репо; редактируешь оффлайн — изменения уедут при
появлении сети. При конфликте побеждает более поздняя правка.

## Технологии

React 18 + Vite, без UI-библиотек. Деплой: GitHub Actions (`.github/workflows/deploy.yml`)
→ GitHub Pages, пересборка при каждом пуше в `main`.

```bash
npm install
npm run dev      # локальная разработка
npm run build    # сборка в dist/
```
