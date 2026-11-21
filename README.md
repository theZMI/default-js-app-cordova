# Default JS App — Cordova-оболочка

Сборщик Android/iOS-приложения для js-приложения из соседней папки
[`default-js-app`](https://github.com/theZMI/default-js-app). Кода приложения здесь нет — только
`config.xml`, иконки, хуки и список плагинов. Имя папки = имя папки приложения + `-cordova`.

> Заготовка: при создании нового приложения поменяйте `id`, `name`, `description` в `config.xml`
> и `name` в `package.json`; пути `file:../default-js-app/native-plugins/...` в `package.json` —
> на папку своего приложения.

## Как собирается

Сборка запускается **из js-приложения**, не отсюда:

```bash
cd ../default-js-app
make install         # npm install там и здесь
make build-android   # → ../default-js-app/dist-apps/<version>.apk
```

Что происходит: `npm run build` → подготовка `dist/` под Cordova → `dist/` копируется в `www/`
(папка предварительно очищается) → на свежем клоне `cordova prepare android` (ставит платформу
и все плагины по `package.json`) → `cordova build android` → APK копируется в `dist-apps/` приложения.

- `www/`, `platforms/`, `plugins/` (кроме `plugins/android.json`, `plugins/fetch.json`) — генерируются, в git их нет.
- Версия APK берётся из `package.json` js-приложения.
- Сборка debug (подписывается `~/.android/debug.keystore`).
- iOS: `cordova platform add ios` (нужен Xcode), затем `make build-ios` / `make prepare-ios` в приложении.

## Файлы

- `config.xml` — идентификатор, имя и версия (версию проставляет сборка из `package.json` приложения); Android: разрешения (медиа, геолокация, установка APK,
  вибрация, уведомления, foreground-сервис с типами `mediaPlayback` и `location`), файловые настройки
  (`AndroidInsecureFileModeEnabled` — приложение работает с `file://`), иконки, сплэш, адаптивная иконка;
  iOS: схема `app://localhost`, фоновый звук, тексты запросов разрешений, иконка 1024.
- `hooks/fix-background-service-type.js` (`after_prepare`) — чинит `cordova-plugin-background-mode`
  под современный Android: `foregroundServiceType` в манифесте, явные типы в `startForeground`
  (location — только при выданном разрешении), `FLAG_IMMUTABLE` у `PendingIntent`. Без него фоновый режим
  падает на Android 12+/14+.
- `res/android/adaptive/` — адаптивная иконка (фон + передний план), `res/ios/icon-1024.png`.
  Передний план и iOS-иконку генерирует `make icons` в js-приложении.
- `package.json` — платформа, плагины и их параметры.

## Плагины

| Плагин | Для чего (флаг в `src/config/features.js` приложения) |
|---|---|
| `cordova-plugin-geolocation` | геолокация (`geolocation`) |
| `cordova-plugin-android-permissions` | запрос разрешений заранее |
| `cordova-plugin-camera` | фото/галерея (`camera`) |
| `@red-mobile/cordova-plugin-barcodescanner` | сканер QR/штрихкодов (`scanner`) |
| `phonegap-nfc` + хук `fix-phonegap-nfc.js` | NFC-метки (`nfc`) |
| `cordova-plugin-background-mode` + хук `fix-background-service-type.js` | работа в фоне (`backgroundMode`) |
| `cordova-plugin-local-notification` | напоминания (`notifications`) |
| `cordova-plugin-music-controls2` | кнопки плеера в шторке (`mediaSession`) |
| `cordova-plugin-x-socialsharing` | «Поделиться» (`share`) |
| `cordova-plugin-insomnia` | не гасить экран (`wakeLock`) |
| `cordova-plugin-fingerprint-aio` | отпечаток/лицо (`biometric`) |
| `cordova-plugin-file`, `-file-transfer`, `-file-opener2` | файлы, самообновление (`files`, `appUpdates`) |
| `cordova-plugin-inappbrowser` | внешние ссылки (`externalLinks`) |
| `cordova-plugin-device` | информация об устройстве (`deviceInfo`) |
| `cordova-plugin-audio-output` (свой, из `native-plugins/` приложения) | аудиовыходы (`audioOutput`) |

Не установлен: `cordova-plugin-firebasex` (push) — ему нужен `google-services.json` вашего Firebase-проекта,
см. README приложения, «Push-уведомления».

Не нужен плагин — `cordova plugin rm <имя> --save` и выключить флаг в приложении.
Свой плагин после правки: `cordova plugin rm <имя> && cordova plugin add ../default-js-app/native-plugins/<имя>`.

## Хуки (`hooks/`, after_prepare)

- `fix-background-service-type.js` — чинит `cordova-plugin-background-mode` под Android 12+/14+:
  `foregroundServiceType`, явные типы в `startForeground` (location — только при выданном разрешении),
  `FLAG_IMMUTABLE` у `PendingIntent`.
- `fix-phonegap-nfc.js` — чинит `phonegap-nfc`: вырезает вызовы Android Beam, удалённого из SDK 34
  (без этого сборка падает), и добавляет `FLAG_MUTABLE` к `PendingIntent` (без него приложение
  падает при запуске на телефонах с NFC). Чтение меток не затрагивается.

## Подпись release-сборок (`signing/`)

Ключ (`release.keystore`) и пароли (`release.json`) — только здесь и **не в git** (`.gitignore`).
Создать: `make keystore` в приложении, пароли — по образцу `signing/release.example.json`.
Сборка: `make build-android-release` в приложении. Подробно — README приложения, «Release-сборка».

## Проверка

Нативную часть можно проверить только на устройстве/эмуляторе. Из кода — собрать APK и посмотреть манифест:
`aapt dump xmltree <apk> AndroidManifest.xml`.
