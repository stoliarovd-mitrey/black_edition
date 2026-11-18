# Короткие ссылки Caviar

После подключения Cloudflare адрес `https://go.caviar.global/most-wanted` перенаправит на страницу коллекции Most Wanted. [Тестовый переход на GitHub Pages](https://stoliarovd-mitrey.github.io/black_edition/caviar-links/?s=most-wanted) использует тот же список ссылок.

## Как добавить или изменить ссылку

Откройте [links.json в редакторе GitHub](https://github.com/stoliarovd-mitrey/black_edition/edit/main/caviar-links/links.json), добавьте пару «короткое имя → полный адрес» и сохраните коммит в `main`. В имени разрешены строчные латинские буквы, цифры и дефисы между ними. После сборки адрес будет доступен на `go.caviar.global`.

```json
{
  "most-wanted": "https://caviar.global/collections/most-wanted/promo/",
  "global": "https://caviar.global/?utm_source=whatsapp"
}
```

Сокращатель принимает HTTPS-ссылки на `caviar.global`, `caviar-phones.ru` и их `www`-адреса. UTM-метки и идентификаторы рекламных кликов из короткой ссылки добавляются к адресу назначения. Метка, заданная в `links.json`, имеет приоритет. Ответ 302 позволяет менять адрес назначения у уже разосланных ссылок. Клики отслеживаются на посадочной странице через её аналитику.

## Первое подключение

В [Cloudflare Workers & Pages](https://dash.cloudflare.com/) создайте Worker из GitHub-репозитория `stoliarovd-mitrey/black_edition` в аккаунте, который управляет зоной `caviar.global`. На экране настройки сборки задайте имя `caviar-links`, ветку `main` и корневой каталог `caviar-links`. Команда проверки `node --test worker.test.mjs`, команда публикации `npx wrangler deploy`. Используйте Node.js 22 или новее. Права для подключения репозитория и домена выдаются в Cloudflare.

При деплое `wrangler.jsonc` зарегистрирует `go.caviar.global` как Custom Domain. Cloudflare создаст запись DNS и сертификат. После публикации проверьте заголовки перехода командой `curl -I 'https://go.caviar.global/most-wanted?utm_source=whatsapp'`.
