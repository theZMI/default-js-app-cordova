// after_prepare хук: чинит phonegap-nfc 1.2.0 (последняя версия, 2022) под современный Android.
// Каждая правка проверяет, не применена ли уже (повторный prepare — no-op).
//
// 1) Android Beam. Плагин вызывает методы передачи NDEF между телефонами
//    (setNdefPushMessage, setBeamPushUris, isNdefPushEnabled…), удалённые из Android SDK 34, —
//    сборка падает с "cannot find symbol". Чтение меток Beam не использует, вызовы вырезаем;
//    nfc.share()/handover() после этого вернут ошибку — Beam на новых Android всё равно не работает.
// 2) PendingIntent без флага изменяемости. На targetSdk 31+ это IllegalArgumentException
//    в onResume — приложение ПАДАЕТ ПРИ ЗАПУСКЕ на любом телефоне с NFC (на телефонах без NFC
//    ветка не выполняется, поэтому ошибку легко пропустить). Для foreground dispatch нужен
//    именно FLAG_MUTABLE: система дописывает в этот Intent данные приложенной метки.
const fs = require('fs');
const path = require('path');

const FILE = 'platforms/android/app/src/main/java/com/chariotsolutions/nfc/plugin/NfcPlugin.java';
const BEAM_MARK = '/* Android Beam удалён в SDK 34 (hooks/fix-phonegap-nfc.js) */';

function patchBeam(java) {
    if (java.includes(BEAM_MARK)) return java;
    const patched = java
        .replace(/nfcAdapter\.(setNdefPushMessage|setOnNdefPushCompleteCallback|setBeamPushUris)\([^;]*\);/g, BEAM_MARK)
        .replace(/!nfcAdapter\.isNdefPushEnabled\(\)/g, 'true');
    if (patched === java) console.warn('fix-phonegap-nfc: вызовы Beam не найдены — плагин обновился, хук нужно перепроверить');
    return patched;
}

function patchPendingIntent(java) {
    if (java.includes('PendingIntent.FLAG_MUTABLE')) return java;
    const original = 'PendingIntent.getActivity(activity, 0, intent, 0)';
    if (!java.includes(original)) {
        console.warn('fix-phonegap-nfc: не нашёл создание PendingIntent — плагин обновился, хук нужно перепроверить');
        return java;
    }
    return java.replace(original,
        'PendingIntent.getActivity(activity, 0, intent, android.os.Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0)');
}

module.exports = function (context) {
    const file = path.join(context.opts.projectRoot, FILE);
    if (!fs.existsSync(file)) return;
    const java = fs.readFileSync(file, 'utf8');
    const patched = patchPendingIntent(patchBeam(java));
    if (patched !== java) fs.writeFileSync(file, patched, 'utf8');
};
