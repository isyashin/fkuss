# Публикация лендинга

Лендинг запускается отдельно от ресторанов: контейнер fkuss-landing,
сеть fkuss-landing, своя SQLite-база и настройки входа. Контейнер
не подключается к PostgreSQL, сети ресторанов или Docker socket.
Порт опубликован только на 127.0.0.1:4185; внешний вход — через Caddy.

## Файлы сервера

~~~text
/home/ilya/resto/
├── landing/
│   ├── releases/<git-sha>/landing-prototype/
│   └── current -> releases/<git-sha>/landing-prototype/
├── secrets/landing/
│   ├── admin.json
│   ├── runtime.env
│   └── data/leads.db
└── backups/landing/
~~~

admin.json содержит логин и scrypt-хеш. Файл монтируется только для чтения.
База вынесена из образа и каталога релиза, чтобы обновление контейнера
сохраняло заявки. Частные файлы и каталоги имеют права 600 / 700.
В runtime.env задаются FKUSS_LANDING_ORIGIN и
FKUSS_LANDING_TRUSTED_PROXY_IPS — адрес шлюза только своей Docker-сети.
Caddy перезаписывает X-Forwarded-For адресом соединения; приложение
принимает заголовок только от указанного шлюза.

## Запуск проверенного релиза

Исходники берутся из GitHub на точном Git-коммите и извлекаются
в отдельный каталог релиза. Рабочий checkout ресторанов не переключается.
Перед запуском нужна отдельная внешняя Docker-сеть fkuss-landing.

~~~bash
export FKUSS_LANDING_RELEASE=<полный-git-sha>
export FKUSS_LANDING_SECRETS_DIR=/home/ilya/resto/secrets/landing
docker compose -f /home/ilya/resto/landing/current/ops/compose.yaml config --quiet
docker compose -f /home/ilya/resto/landing/current/ops/compose.yaml build landing
docker compose -f /home/ilya/resto/landing/current/ops/compose.yaml up -d --no-deps landing
curl --fail http://127.0.0.1:4185/healthz
~~~

Контейнер работает от node, с файловой системой только для чтения,
без Linux capabilities и повышения привилегий. Лимиты: 192 МБ RAM,
0,5 CPU, 64 процесса, 10 МБ логов. В образе закреплён digest официального
Node 22; внешний npm-пакет для приёма заявок не нужен.

## Маршрут и откат

В Caddy меняется только прежний блок fkuss.ru, www.fkuss.ru.
Кандидат адаптируется и проходит caddy validate перед записью.
Остальные маршруты сравниваются с прежним конфигом и остаются прежними.
Применение — через systemctl reload caddy.

~~~caddyfile
fkuss.ru {
    encode zstd gzip
    reverse_proxy 127.0.0.1:4185 {
        header_up X-Forwarded-For {remote_host}
    }
}
www.fkuss.ru {
    redir https://fkuss.ru{uri} permanent
}
~~~

Перед переключением сохраняются исходный Caddyfile и список ID
работающих контейнеров. При ошибке восстанавливаются исходный конфиг
и прежний маршрут; база заявок сохраняется. Для последующих релизов
хранятся предыдущий образ и каталог релиза.

Общий scripts/update.sh для этой публикации не применяется: он
обновляет сервисы ресторанов и платформы.

## Бэкап

fkuss-landing-backup.timer запускает отдельную службу ежедневно
в 04:50 с небольшим случайным сдвигом. Она делает согласованный снимок
SQLite через online backup API, проверяет quick_check и сохраняет
настройки входа. Остаются последние 14 отмеченных бэкапов лендинга.
Скрипт не удаляет чужие папки; исходные данные остаются на месте.

Для восстановления: остановить только контейнер лендинга, сохранить
текущую базу, восстановить leads.db и admin.json из выбранного бэкапа,
проверить права файлов, запустить лендинг и проверить админку.

~~~bash
systemctl status fkuss-landing-backup.timer
systemctl start fkuss-landing-backup.service
~~~
