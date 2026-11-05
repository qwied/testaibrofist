# Инструкции для Claude Code

## Куда выкладывать: сначала только testaibrofist

Все новые правки по умолчанию выкладываются ТОЛЬКО в `testaibrofist`.
`aibrofist` (живой сайт) не трогать, пока пользователь сам не скажет
выкатить/задеплоить в aibrofist — тогда см. «Выкладка в aibrofist» ниже.
Исключение — этот файл `CLAUDE.md`: он одинаковый в обоих репозиториях и
меняется в обоих сразу. Срочное исправление живого сайта в обход
`testaibrofist` — только если пользователь прямо об этом попросил.

## Автоматическая поставка изменений

Пользователь явно авторизовал полный цикл поставки изменений без
дополнительного подтверждения на каждом шаге. При любой задаче на
исправление багов или правку кода — по умолчанию в `testaibrofist`:

1. Внести правки в код.
2. Прогнать быструю проверку: `node -c` на изменённые `.js`-файлы; для
   `.html` — извлечь и проверить синтаксис инлайн-скриптов; где разумно —
   короткий smoke-тест (например, поднять `server.js` локально и убедиться,
   что он стартует и отвечает).
3. Добавить запись о правке в `pending-updates.json` (см. «Новости об
   обновлениях»).
4. Закоммитить. Сообщение коммита — ровно одно слово: `Update`. Никаких
   описаний, трейлеров (`Co-Authored-By`, `Claude-Session`) и ссылок.
5. Запушить в ветку (`git push -u origin <branch>`).
6. Создать Pull Request в `main` через GitHub: заголовок — одно слово
   `Update`, описание пустое.
7. Влить в `main` не кнопкой/API слияния, а fast-forward пушем того же
   коммита: `git push origin <branch>:main` (если `main` ушёл вперёд —
   сначала `git rebase origin/main` в ветке). GitHub сам отметит PR как
   смёрженный. Слияние через GitHub (и squash, и rebase) подписывает коммит
   личной почтой владельца репозитория — так делать нельзя.

Всё это — один непрерывный проход, без остановки на "запушить?"/"смержить?"
на каждом шаге. Останавливаться и спрашивать пользователя нужно только если:
- правка неоднозначна и есть несколько существенно разных вариантов решения;
- изменение architecturally значимое (меняет схему данных, ломает обратную
  совместимость, требует ручных действий на проде);
- пользователь сам попросил не мержить/не пушить для конкретной задачи.

Ветку для разработки называть `claude/<короткое-описание-задачи>`. Если
подходящая ветка уже существует и полностью смержена в `main` — пересоздать
её от актуального `main` (`git fetch origin main && git checkout -B <branch>
origin/main`), а не наслаивать новые коммиты поверх уже смержённой истории.

## Выкладка в aibrofist (только по команде пользователя)

Репозитории не копии друг друга: около 30 общих файлов законно отличаются
(в `testaibrofist` есть офлайн-режим, другие ники владельца и т.п.). Поэтому
переносятся не файлы целиком, а только изменения с прошлой выкладки:

1. В `testaibrofist` взять `base` из `pending-updates.json` и снять разницу
   `git diff <base> origin/main -- . ':(exclude)pending-updates.json'
   ':(exclude)CLAUDE.md'`. Части про файлы, которых в `aibrofist` нет
   (`offline.js`, `OFFLINE_*.md`, `test-offline.js` и прочее только для
   теста), не переносить.
2. В `aibrofist` (ветка от `origin/main`) применить её `git apply --reject`
   и разобрать каждый `*.rej`, затем удалить их. Куски, где меняются только
   номера `?v=N`, не лягут (в страницах `testaibrofist` рядом лишняя строка
   `offline.js`) — их не переносить, а поднять N в `aibrofist` самому, если
   среди перенесённого есть подключаемые со страниц `.css`/`.js`. Остальное,
   что не легло, перенести вручную по смыслу, не затирая отличий
   `aibrofist`. Проверить как обычно.
3. Все записи из `pending-updates.json` свести в ОДНУ запись `updates.json`
   (см. ниже) и закоммитить вместе с правками; выложить `aibrofist` по шагам
   4–7 выше.
4. В `testaibrofist` записать в `pending-updates.json` новый `base` — тот
   коммит `origin/main`, с которого снималась разница, — и пустой `updates`;
   выложить так же.
5. Убедиться, что живой сайт отвечает и новость появилась в Logs.

## О проекте

Node.js + Express + Socket.IO мультиплеерная браузерная игра, без сборки,
ванильный JS на клиенте и сервере. Два репозитория: `testaibrofist` —
где делаются и копятся правки, `aibrofist` — живой сайт, куда они
переносятся только при выкладке (см. выше).

Скрипты и стили подключаются со страниц с параметром версии
(`mobile.css?v=N`, `i18n.js?v=N` и т.д., N одно на все страницы). После
правки любого такого `.css`/`.js` подними N во ВСЕХ `.html` (и в
`owner.js` для `adminAbuse.js`) — иначе телефоны, установленное
приложение и CDN продолжают отдавать старый файл по старому адресу, и
новая страница работает со старыми стилями.

## Новости об обновлениях

Пока правки копятся, о каждой пишется запись в `pending-updates.json` в
`testaibrofist` (в конец массива `updates`, в том же коммите, что и правка):

    { "base": "<коммит testaibrofist на момент прошлой выкладки>",
      "updates": [ { "title": "Short title", "text": "What changed." } ] }

При выкладке все они сводятся в одну запись в конце `updates.json` в
`aibrofist`:

    { "id": "2026-10-13-1", "date": "2026-10-13",
      "title": "Short title", "text": "- First change\n- Second change" }

- `id` — дата и номер за этот день, уникальный и неизменный; `date` — день
  выкладки (`YYYY-MM-DD`). Текст — список строк через `\n`, каждая с `- `.
- Только по-английски (сайт на английском), без эмодзи, простыми словами о
  том, что заметит игрок. Без личных данных, ссылок на сессию, имён файлов и
  технических подробностей. Если для игроков ничего не изменилось — коротко,
  например «Stability and security improvements».
- `updates.json` есть только в `aibrofist`; в `testaibrofist` его не
  создавать — по нему сервер публикует новости. Уже выложенные записи не
  править и не удалять без просьбы пользователя: правка текста записи
  сама повторяется в Logs и в сообщениях бота в Discord, а запись,
  убранная из `updates.json`, сама удаляется из Logs и Discord.

После выкладки сервер `aibrofist` сам (`updatesFeed.js`) публикует запись:
бот Discord выкладывает её в канал #updates, и только после этого она
появляется в Logs в игре. Пока бота нет (не задан `DISCORD_BOT_TOKEN` на
хостинге), в Logs не пишется ничего — так попросил пользователь; канал бот
находит сам по имени `updates`, либо он задаётся `DISCORD_UPDATES_CHANNEL_ID`.
Публикуются только записи не старше 7 дней.

## Приватность

- Никогда не добавлять в коммиты, описания PR и комментарии на GitHub ссылки
  на сессию Claude (строку `Claude-Session:` и адреса `claude.ai/code/session_…`).
- Не публиковать в GitHub личные данные: почту, данные игроков (`data/`),
  содержимое сессии.
- Коммиты, PR и их описания — без подробностей: одно слово `Update`, описание
  пустое (см. шаги 4, 6, 7 выше). Комментарии на GitHub не оставлять.
- Инструмент создания PR сам дописывает в описание подпись со ссылкой на
  сессию — сразу после создания PR очистить описание
  (`gh api -X PATCH repos/<owner>/<repo>/pulls/<N> -f body=''`) и проверить,
  что оно пустое.

## Общие правила работы с кодом

При противоречии с правилами выше приоритет у правил выше.

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
