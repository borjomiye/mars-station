# Mars Station: правила проекта для ИИ-ассистентов

Браузерная игра для детей 7–12 лет (NASA Space Apps). Игрок — капитан станции на Марсе: 15 солов делит энергию между системами и принимает решения, у каждого из которых есть цена. Полный план и распределение ролей: `PLAN.md`.

## Команды

```bash
npm run dev          # игра локально
npm test             # Vitest: инварианты движка и данных
npm run typecheck    # tsc
npm run simulate     # боты и проверка баланса (npm run simulate -- 2000)
npm run fetch:donki  # реальные данные DONKI → src/data/donki-periods.json (нужен NASA_API_KEY в .env)
```

Перед каждым PR должны проходить `npm run typecheck` и `npm test`.

## Архитектура (не нарушать)

- `src/engine/` — чистая логика без React и без DOM. Каждая фаза — функция `(state, решение) → новое состояние` (`startSol`, `beginEnergy`, `allocateEnergy`, `resolveEvent`, `sendMessageAndSleep` в `sol.ts`). Состояние не мутируем снаружи: функции клонируют его.
- `src/engine/types.ts` — **контракт**. Меняет только P1 (тимлид). Нужно поле или тип — попроси P1.
- Вся случайность — из seed (`rng.ts`). Никакого `Math.random()` в движке (исключение: `randomSeed()` для новой игры).
- **Все числа** — в `src/data/balance.json`. **Все тексты** — в `src/data/en.json` (ключи по разделам: `ui.*`, `avatar.*`, `term.*`, `event.*`, `reply.*`, `end.*`, `data.*`, `crew.*`, `site.*`, `pending.*`). В коде движка — только ключи текстов.
- События и варианты выбора — данные в `src/data/events.json`, их последствия описываются только через тип `Effect`. У каждого варианта должна быть цена (тест `every choice has a cost`).
- UI (`src/ui/`) вызывает только публичный API из `src/engine/index.ts`.
- Игра не ходит в сеть. Данные NASA заранее скачаны в JSON. Ключ API — только в `.env`, никогда в коде.

## Честность данных (важно для судей)

- Никаких выдуманных «фактов NASA». Каждый реальный факт хранит ссылку на источник (`link`).
- Встроенные данные не выдаём за живые. DONKI пишем как «это реально было <дата>», а не «это ударило по Марсу».
- Пока `donki-periods.json` содержит `"stub": true`, игра показывает предупреждение. Перед демо заменить реальными данными.
- Упрощения объясняем на экране «Откуда данные» (`data.*` в `en.json`).

## Кто какие папки правит

| Роль | Папки и файлы |
|---|---|
| P1 движок | `src/engine/types.ts, state.ts, sol.ts, effects.ts, rng.ts, content.ts, index.ts` |
| P2 движок-2 и тесты | `src/engine/radiation.ts, comms.ts, scoring.ts`, `tests/`, `scripts/simulate.ts, bots.ts` |
| P3 интерфейс | `src/ui/` (кроме `theme.css`), `src/main.tsx` |
| P4 данные NASA | `scripts/fetch-donki.ts`, `src/data/donki-periods.json, radlab-iss.json, facts.json, sites.json`, `DATA.md` |
| P5 геймдизайн и тексты | `src/data/events.json, balance.json, en.json` |
| P6 графика и UX | `src/assets/`, `src/ui/theme.css`, SVG-компоненты аватара и станции |

Не правь чужие файлы без договорённости. В общие JSON добавляй ключи только в свой раздел, маленьким PR.

## Стиль

- TypeScript strict, без `any`.
- Тексты для детей: короткие предложения, простые слова; термин объясняется при первом появлении (`termKey`).
- Доступность: кнопки не меньше 44px, у шкал `aria-label`, контраст.
- Цвета — только через CSS-переменные из `theme.css`.

## Обновление: механика greybox (ноябрь 2026)

Движок в `src/engine/` заменён механикой прототипа `greybox/`. Что изменилось относительно правил выше:

- Фазы сола: `briefing → plan → event → results → radio → report`. Публичные функции: `createMission`, `startPlanning`, `applyPlan`, `confirmPlan`, `resolveEvent`, `playSol`, `proceed`, `sendMessage`, `endMission` (все в `src/engine/index.ts`).
- Числа: `src/data/balance.json` (`base` + `modes.cadet` / `modes.commander` + `bot`).
- События: названия в `events.json`, варианты выбора и их цена строятся в `src/engine/rules.ts` (`eventChoices`), а не через тип `Effect`.
- Тексты: статические (слова, имена экипажа, названия миссий) в `en.json`; фразы движка пока строками в коде. Перенос в ключи — отдельная задача.
- Случайности в исходах нет вообще: сид (название миссии) определяет только расписание.
- `sites.json`, `facts.json`, `radlab-iss.json` новым движком не используются.
