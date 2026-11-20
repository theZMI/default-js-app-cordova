// after_prepare хук: cordova-plugin-background-mode объявляет свой ForegroundService без
// android:foregroundServiceType, а с Android 14 (targetSdk 34, который ставит cordova-android 13)
// запуск foreground-сервиса без объявленного типа падает с MissingForegroundServiceTypeException.
// Добавить тип через config.xml (config-file/edit-config) не получилось: Cordova не мерджит узлы,
// добавленные другим плагином, по android:name — оба способа просто дублируют <service> и валят
// манифест-мерджер ("Element ... duplicated with element declared at ..."). Поэтому правим уже
// сгенерированный AndroidManifest.xml текстом, как и остальные build-скрипты этого проекта.
//
// Типа два: mediaPlayback (фоновое аудио) и location — без него Android 10+ перестаёт отдавать
// GPS-координаты свёрнутому приложению. Но заявить location только в манифесте мало: плагин вызывает
// startForeground(id, notification) без явных типов, а в этом случае Android 14 берёт ВСЕ типы
// из манифеста и требует выполнения условий каждого — старт сервиса без выданного разрешения
// на геолокацию (например, ради фонового звука) падал бы с SecurityException. Поэтому ниже
// патчим ещё и ForegroundService.java: типы передаются явно, location — только когда разрешение
// на геолокацию реально выдано.
//
// Третья правка там же: уведомление сервиса по тапу открывает приложение через PendingIntent,
// который плагин создаёт без FLAG_IMMUTABLE/FLAG_MUTABLE. С targetSdk 31+ это
// IllegalArgumentException прямо в onCreate сервиса — приложение падало в момент сворачивания
// (как только включён фоновый режим), и ни звук, ни GPS в фоне не работали.
//
// Не нужен фоновый GPS — уберите location из SERVICE_TYPES (Java-правка подстроится сама)
// и FOREGROUND_SERVICE_LOCATION из config.xml, затем `cordova platform rm android && cordova platform add android`
// (правка Java уже применённая в platforms/ не откатывается); не нужен фоновый режим вовсе — удалите плагин, хук станет no-op.
const fs = require('fs');
const path = require('path');

const SERVICE_NAME = 'de.appplant.cordova.plugin.background.ForegroundService';
const SERVICE_TYPES = 'mediaPlayback|location';

function fixManifest(projectRoot) {
    const manifestPath = path.join(
        projectRoot,
        'platforms/android/app/src/main/AndroidManifest.xml'
    );
    if (!fs.existsSync(manifestPath)) return;

    let xml = fs.readFileSync(manifestPath, 'utf8');

    const serviceTagRegex = new RegExp(
        `\\s*<service[^>]*android:name="${SERVICE_NAME.replace(/\./g, '\\.')}"[^>]*/>`,
        'g'
    );
    if (!serviceTagRegex.test(xml)) return;

    xml = xml.replace(serviceTagRegex, '');
    xml = xml.replace(
        '</application>',
        `    <service android:name="${SERVICE_NAME}" android:foregroundServiceType="${SERVICE_TYPES}" />\n</application>`
    );

    fs.writeFileSync(manifestPath, xml, 'utf8');
}

function fixForegroundService(projectRoot) {
    const javaPath = path.join(
        projectRoot,
        'platforms/android/app/src/main/java/de/appplant/cordova/plugin/background/ForegroundService.java'
    );
    if (!fs.existsSync(javaPath)) return;

    let java = fs.readFileSync(javaPath, 'utf8');
    // Каждая правка проверяет, не применена ли уже: файл в platforms переживает prepare,
    // но пересоздаётся при platform add
    java = patchForegroundTypes(java);
    java = patchPendingIntentFlags(java);
    fs.writeFileSync(javaPath, java, 'utf8');
}

function patchForegroundTypes(java) {
    if (java.includes('FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK')) return java;

    const original = 'startForeground(NOTIFICATION_ID, makeNotification());';
    if (!java.includes(original)) {
        console.warn('fix-background-service-type: не нашёл вызов startForeground в ForegroundService.java — плагин обновился, хук нужно перепроверить');
        return java;
    }

    // location передаётся, только если он заявлен в SERVICE_TYPES (иначе Android отвергнет
    // тип, которого нет в манифесте) и разрешение на геолокацию реально выдано
    const locationBlock = SERVICE_TYPES.includes('location') ? `
                boolean hasLocationPermission =
                        checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION)
                                == android.content.pm.PackageManager.PERMISSION_GRANTED
                        || checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION)
                                == android.content.pm.PackageManager.PERMISSION_GRANTED;
                if (hasLocationPermission) {
                    types |= android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION;
                }` : '';
    const replacement = `if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                int types = android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;${locationBlock}
                startForeground(NOTIFICATION_ID, makeNotification(), types);
            } else {
                startForeground(NOTIFICATION_ID, makeNotification());
            }`;

    return java.replace(original, replacement);
}

function patchPendingIntentFlags(java) {
    if (java.includes('FLAG_IMMUTABLE')) return java;

    const original = 'PendingIntent.FLAG_UPDATE_CURRENT);';
    if (!java.includes(original)) {
        console.warn('fix-background-service-type: не нашёл флаги PendingIntent в ForegroundService.java — плагин обновился, хук нужно перепроверить');
        return java;
    }
    return java.replace(original, 'PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);');
}

module.exports = function (context) {
    fixManifest(context.opts.projectRoot);
    fixForegroundService(context.opts.projectRoot);
};
