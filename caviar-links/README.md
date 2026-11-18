# Короткие ссылки Caviar

В [генераторе](https://stoliarovd-mitrey.github.io/black_edition/caviar-links/) вставьте HTTPS-ссылку на `caviar.global` или `caviar-phones.ru` и нажмите «Сократить». Каждый запуск создаёт новый адрес вида `https://caviar.global/k7qx3m2a`.

Нажмите «Скопировать запись и открыть GitHub», вставьте запись в редактор с предложенным именем файла и выберите **Commit changes** в `main`. Каждый адрес хранится в отдельном файле в `entries/`. После сборки Cloudflare короткая ссылка начнёт работать. Изменить страницу назначения можно в том же файле. Исходный пример `most-wanted` хранится в `links.json`.

Генератор и GitHub Pages доступны до подключения Cloudflare. [Тестовый переход Most Wanted](https://stoliarovd-mitrey.github.io/black_edition/caviar-links/?s=most-wanted) проверяет адрес назначения на GitHub Pages. Записи хранятся в публичном репозитории, поэтому используйте общедоступные ссылки.

## Подключение Cloudflare

В аккаунте, который управляет зоной `caviar.global`, подключите Cloudflare Workers Builds к репозиторию `stoliarovd-mitrey/black_edition`. Укажите имя Worker `caviar-links`, ветку `main`, корневой каталог `caviar-links` и Node.js 22 или новее.

- Команда проверки `npm test`
- Команда деплоя `npm run deploy`

У существующей DNS-записи `caviar.global` должен быть включён прокси Cloudflare. Деплой создаёт Worker Routes только для опубликованных коротких имён. Когда путь начинается с короткого имени, но ведёт на другую страницу, Worker передаёт запрос действующему сайту. Основной домен остаётся на текущем сервере.

После первого деплоя `curl -I 'https://caviar.global/most-wanted?utm_source=whatsapp'` должен вернуть `302` и адрес лендинга с UTM-меткой. Кампанийные метки из короткой ссылки дополняют адрес назначения. Если метка уже задана там, сохраняется исходное значение. Для проверки действующего сайта отдельно откройте `https://caviar.global/`.
