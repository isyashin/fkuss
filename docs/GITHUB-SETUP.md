# Настройка GitHub-репозитория

Репозиторий: [`isyashin/fkuss`](https://github.com/isyashin/fkuss).

Документ описывает рекомендуемую настройку репозитория для разработки,
тестирования и последующего выпуска платформы ресторанных сайтов.

## Исходное решение

Репозиторий открыт временно, чтобы дать Codex доступ на первом этапе. Проект
не планируется как open source и позже должен стать приватным.

После входа через `gh auth login` Codex работает от имени GitHub-аккаунта
`isyashin`, у которого есть доступ `ADMIN`. Поэтому публичная видимость больше
не нужна для доступа Codex: после перевода репозитория в private чтение, Issues,
ветки, push и pull requests продолжат работать через сохранённую авторизацию.

Не передавать в чат пароль, токены, резервные коды или коды двухфакторной
авторизации. Не запускать `gh auth status --show-token` и `gh auth token` в
общем терминале или при записи экрана.

## Состояние на 21 сентября 2026 года

- Репозиторий публичный, основная ветка — `main`.
- У `main` нет branch protection или ruleset.
- GitHub Actions разрешены; workflow находится в `.github/workflows/test.yml`.
- Полный workflow успешно пройден на `main`: GitHub Actions `35609347912`.
- Токен workflows по умолчанию имеет только read-доступ — это правильно.
- Actions не могут одобрять pull requests — это правильно.
- Secret scanning и push protection включены; открытых secret alerts нет.
- Dependabot alerts и Dependabot security updates выключены.
- Code scanning не настроен.
- Разрешены merge commit, squash и rebase; автоматическое удаление веток
  выключено.
- Нет GitHub Environments, Actions secrets, variables, webhooks и deploy keys.
- Нет корневого `README.md`, описания, topics и лицензии.
- Открытых Issues, pull requests, tags и releases нет.

Это безопасная минимальная конфигурация для одиночной разработки, но она не
защищает `main` от ошибочного push и не проверяет изменения перед выпуском.

## Порядок настройки

Действовать именно в указанном порядке. Не включать защиту `main` посреди
текущей работы Кими: существующий процесс отправляет изменения напрямую и
может быть прерван новыми правилами.

### Шаг 1. Закончить текущую итерацию

1. Дождаться сообщения Кими о завершении.
2. Проверить, что все нужные изменения закоммичены и отправлены:

   ```powershell
   cd "D:\сайт ресторана"
   git status --short --branch
   git log -1 --oneline
   git ls-remote origin HEAD
   ```

3. Рабочее дерево перед сменой процесса должно быть чистым. Не удалять и не
   сбрасывать чужие незакоммиченные изменения.
4. Выполнить тестирование по `docs/TEST-PLAN-RESTAURANT-ENHANCEMENTS.md` и
   плану повторной приёмки из `тестировщик/журнал.md`.
5. Только после последнего прямого push переходить к следующим шагам.

### Шаг 2. Перевести репозиторий в private

Сделать это можно сразу после завершения текущей итерации: действующая
авторизация Codex уже предоставляет `ADMIN`-доступ.

Перед переключением:

- убедиться, что в истории нет действующих секретов;
- проверить вкладку **Security** и secret scanning alerts;
- считать всю прежнюю публичную историю уже опубликованной: смена видимости не
  удаляет чужие клоны, архивы и ранее скачанные файлы;
- если секрет когда-либо попадал в commit, удалить его из текущего кода
  недостаточно — секрет нужно отозвать и заменить;
- проверить публичные forks. На момент аудита их нет, но GitHub не делает
  существующие публичные forks приватными: он отделяет их в другую сеть.

Переключение через интерфейс:

1. Открыть [Settings → General](https://github.com/isyashin/fkuss/settings).
2. Прокрутить до **Danger Zone**.
3. Выбрать **Change repository visibility**.
4. Нажать **Change to private**.
5. Подтвердить имя `isyashin/fkuss` и предупреждение GitHub.

После переключения проверить:

```powershell
gh auth status
gh repo view isyashin/fkuss --json visibility,isPrivate,viewerPermission
git ls-remote origin HEAD
```

Ожидается `visibility: PRIVATE`, `isPrivate: true` и `viewerPermission: ADMIN`.

Важные ограничения GitHub:

- публичные forks остаются публичными и отделяются от исходного репозитория;
- GitHub Pages будет снят с публикации, если он использовался;
- stars и watchers сбрасываются;
- CodeQL/code scanning для приватного репозитория может требовать платный
  тариф или GitHub Code Security;
- branch rulesets и защищённые ветки в приватном личном репозитории могут
  требовать GitHub Pro. Если элементы Rules недоступны после переключения,
  это ограничение тарифа, а не ошибка настройки.

Официальная справка: [Setting repository visibility](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility).

### Шаг 3. Настроить описание репозитория

В [Settings → General](https://github.com/isyashin/fkuss/settings) заполнить:

- **Description**: `White-label платформа сайтов ресторанов: меню, заказы, доставка, бронирование и биллинг`;
- **Website**: оставить пустым до готовности публичного адреса проекта;
- **Topics**: `nextjs`, `typescript`, `postgresql`, `prisma`, `restaurant`,
  `food-delivery`, `white-label`, `docker`.

Корневой `README.md` стоит добавить отдельной задачей. В нём достаточно:

- назначения проекта;
- структуры `template/`, `platform/`, `scripts/`, `docs/`;
- требований к окружению;
- безопасного локального запуска;
- ссылок на `docs/PLAN.md`, `ARCHITECTURE.md` и `DEPLOY.md`;
- пометки, что это частный коммерческий проект.

Открытую лицензию (`MIT`, `Apache-2.0` и подобную) добавлять не нужно, если
владелец не собирается разрешать свободное использование кода. Временная
публичность сама по себе не делает проект open source и не требует выдавать
лицензию.

### Шаг 4. Поддерживать воспроизводимый CI

До защиты `main` workflow `.github/workflows/test.yml` должен хотя бы один раз
полностью пройти на GitHub. Иначе GitHub не сможет требовать его проверки.

Текущий workflow уже проверяет оба приложения с отдельными PostgreSQL service,
миграциями, unit/integration tests, lint, production build, seed и Playwright.
Целевой состав проверок:

1. `template-quality`
   - установка Node.js и зависимостей через lockfile;
   - lint и typecheck;
   - Prisma validate;
   - unit-тесты без БД;
   - production build.
2. `platform-quality`
   - lint и typecheck;
   - Prisma validate;
   - unit-тесты;
   - production build.
3. `integration`
   - одноразовый PostgreSQL service;
   - применение миграций;
   - отдельные БД для `template` и `platform`;
   - seed/fixtures;
   - все PostgreSQL integration tests.
4. `e2e`
   - одноразовая тестовая БД;
   - production-сборка и запуск приложений;
   - Playwright для 360 px, desktop Chromium и WebKit;
   - загрузка trace/screenshots только при ошибке.
5. `security`
   - dependency audit;
   - проверка отсутствия секретов;
   - проверка миграций и tracked-файлов контента.

Требования к CI:

- он не подключается к production БД, VPS или реальным каналам уведомлений;
- тесты используют только disposable PostgreSQL и mock/sandbox-провайдеры;
- production-секреты не передаются в pull requests;
- один запуск не зависит от данных предыдущего;
- локальная и CI-команды совпадают;
- падение любой обязательной проверки завершает job с ненулевым кодом.

Перед созданием ruleset workflow нужно хотя бы один раз запустить на GitHub,
чтобы названия status checks появились в настройках ветки.

### Шаг 5. Настроить GitHub Actions

Открыть [Settings → Actions → General](https://github.com/isyashin/fkuss/settings/actions).

Рекомендуемые значения:

- **Actions permissions**: после создания CI разрешить только GitHub-owned и
  проверенные actions либо явно перечисленные действия;
- по возможности фиксировать сторонние actions по полному commit SHA;
- **Workflow permissions**: `Read repository contents permission`;
- **Allow GitHub Actions to create and approve pull requests**: выключено;
- workflows из внешних forks запускать только после ручного подтверждения.

Сейчас первые два ограничения не нужно включать вслепую: сначала определить
точный список actions в `ci.yml`, иначе рабочий CI можно случайно заблокировать.

### Шаг 6. Включить Dependabot

Открыть **Settings → Security and quality → Advanced Security**.

Включить:

- Dependency graph;
- Dependabot alerts;
- Dependabot security updates;
- Dependabot version updates.

Для version updates добавить `.github/dependabot.yml` отдельным коммитом:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /template
    schedule:
      interval: weekly
    open-pull-requests-limit: 5

  - package-ecosystem: npm
    directory: /platform
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
```

После включения проверить вкладку **Security → Dependabot**. Найденные
уязвимости не исправлять автоматическим merge без сборки и полного теста.

Официальная справка: [Dependabot quickstart](https://docs.github.com/en/code-security/tutorials/secure-your-dependencies/dependabot-quickstart).

### Шаг 7. Настроить code scanning

Пока репозиторий публичный, можно включить **Security → Code scanning → Set up
CodeQL → Default setup** и выполнить первый анализ.

После перевода в private проверить доступность функции на текущем тарифе. На
личном бесплатном тарифе code scanning для private может стать недоступен. В
этом случае оставить локальные/CI-проверки и Dependabot, а CodeQL вернуть после
подключения подходящего тарифа.

Уже включённые secret scanning и push protection не отключать. Private
vulnerability reporting для одиночного закрытого проекта не обязателен; он
полезен только если внешним исследователям нужен приватный канал сообщений.

### Шаг 8. Защитить `main`

Настраивать после завершения текущей прямой работы Кими и первого зелёного CI.

1. Открыть **Settings → Rules → Rulesets**.
2. Создать **New branch ruleset**.
3. Название: `protect-main`.
4. Enforcement status: `Active`.
5. Target branches: **Include default branch**.
6. Включить:
   - Restrict deletions;
   - Require a pull request before merging;
   - Require status checks to pass;
   - Require conversation resolution;
   - Require linear history;
   - Block force pushes.
7. В обязательные status checks добавить jobs CI после их первого запуска.

Для одиночной разработки можно не требовать чужого approving review: работа
всё равно проходит через PR и автоматические проверки. Если появится второй
разработчик, установить минимум один approval и включить сброс устаревшего
approval после новых изменений.

Не добавлять постоянный admin bypass без необходимости: Codex и Кими работают
через тот же административный аккаунт, и обход лишит ruleset практического
смысла. Для аварийной ситуации ruleset можно временно перевести в Disabled.

После включения новый процесс разработки:

```text
main → новая ветка → изменения → тесты → push → pull request → CI → merge
```

Для веток Codex использовать префикс `codex/`, например
`codex/fix-order-payment`.

Официальная справка: [Creating rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository) и [Available rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets).

Если private-репозиторий на текущем тарифе не поддерживает rulesets, варианты:

1. подключить GitHub Pro;
2. оставить репозиторий публичным до конца первичной разработки;
3. сделать private и соблюдать PR + CI добровольно, понимая, что GitHub не
   сможет технически запретить прямой push.

Предпочтительный вариант для коммерческого проекта — private + GitHub Pro.

### Шаг 9. Упростить правила слияния

Открыть **Settings → General → Pull Requests**.

Рекомендуется:

- оставить **Allow squash merging**;
- выключить **Allow merge commits**;
- выключить **Allow rebase merging**, если нет отдельной причины его сохранять;
- включить **Automatically delete head branches**;
- auto-merge оставить выключенным до стабильного CI.

Так один PR создаёт один понятный commit в `main`, а использованные ветки не
накапливаются.

### Шаг 10. Не переносить production-секреты в GitHub

Текущая модель проекта хранит секреты на сервере в `secrets/` и env-файлах,
которые не попадают в git. Пока деплой выполняется серверными скриптами, GitHub
Actions secrets не нужны.

Не добавлять в репозиторий или Actions без отдельного проектного решения:

- содержимое `secrets/*.env`;
- пароли PostgreSQL;
- SMTP-пароли;
- токены Telegram/MAX;
- ключи ЮKassa;
- SSH private keys;
- production `CRON_SECRET`, `ADMIN_PASSWORD` и `SITE_KEY`.

Если позже появится автоматический деплой, сначала создать GitHub Environment
`production` с ручным подтверждением, затем выдать workflow минимальный
отдельный deploy credential. Не использовать основной личный SSH-ключ.

## Финальная проверка

После настройки выполнить:

```powershell
gh auth status
gh repo view isyashin/fkuss --json visibility,isPrivate,defaultBranchRef,viewerPermission
gh workflow list --all --repo isyashin/fkuss
gh run list --repo isyashin/fkuss --limit 10
gh api repos/isyashin/fkuss/rulesets
gh api repos/isyashin/fkuss/actions/permissions
git status --short --branch
git ls-remote origin HEAD
```

Готовность репозитория подтверждается, если:

- [ ] репозиторий private и Codex видит его с `ADMIN`-доступом;
- [ ] `main` защищена либо осознанно оставлена без enforcement из-за тарифа;
- [ ] CI запускается на push/PR и полностью зелёный;
- [ ] обязательные status checks входят в ruleset;
- [ ] force push и удаление `main` запрещены;
- [ ] Dependabot alerts и security updates включены;
- [ ] secret scanning/push protection остаются включёнными, если доступны;
- [ ] production-секретов нет в git, Actions logs и workflow-файлах;
- [ ] merge выполняется через squash, использованные ветки удаляются;
- [ ] текущая итерация Кими не потеряна и присутствует в remote `main`.

## Что можно отложить

- Releases и теги `v0.x.y` — до первого стабильного выпуска.
- GitHub Environments — до автоматизации деплоя.
- CODEOWNERS — до появления нескольких разработчиков.
- Issue/PR templates — до регулярной работы через Issues и PR.
- Wiki и Projects можно оставить включёнными или отключить, если они не
  используются: на безопасность и сборку это не влияет.
