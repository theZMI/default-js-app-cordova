// after_prepare хук: чинит cordova-plugin-music-controls2 3.0.7 (последняя версия, 2022)
// под Android 13/14 (targetSdk 34). Без правок плагин не может стартовать, и кнопок
// плеера в шторке нет (пример «Плеер в шторке»). Правки идемпотентны.
//
// 1) registerReceiver без флага экспорта. С Android 14 для динамических приёмников
//    обязателен RECEIVER_EXPORTED / RECEIVER_NOT_EXPORTED, иначе SecurityException.
//    Ставим NOT_EXPORTED: сообщения кнопок приходят от нашего же приложения (PendingIntent)
//    и от системы — а чужие приложения больше не смогут «нажимать» кнопки плеера.
// 2) Неявные Intent в изменяемых PendingIntent. Android 14 запрещает FLAG_MUTABLE с неявным
//    Intent (IllegalArgumentException при создании уведомления). Делаем Intent кнопок явными —
//    адресованными нашему пакету (setPackage); тогда FLAG_MUTABLE разрешён (системе он нужен,
//    чтобы дописать событие кнопки гарнитуры).
const fs = require('fs');
const path = require('path');

const DIR = 'platforms/android/app/src/main/java/com/homerours/musiccontrols';
const MARK = '/* fix-music-controls */';

function patchReceivers(java) {
    if (java.includes('RECEIVER_NOT_EXPORTED')) return java;
    const re = /context\.registerReceiver\(\(BroadcastReceiver\)mMessageReceiver, (new IntentFilter\([^)]*\))\);/g;
    if (!re.test(java)) return java;
    return java
        .replace(re, 'registerReceiverCompat(context, mMessageReceiver, $1);')
        .replace(/(private void registerBroadcaster\()/, `${MARK}
	private static void registerReceiverCompat(Context context, BroadcastReceiver receiver, IntentFilter filter) {
		if (Build.VERSION.SDK_INT >= 33) {
			context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
		} else {
			context.registerReceiver(receiver, filter);
		}
	}

	$1`);
}

function patchExplicitIntents(java) {
    return java.replace(/new Intent\("(music-controls-[a-z-]+)"\)(?!\.setPackage)/g, 'new Intent("$1").setPackage(context.getPackageName())');
}

module.exports = function (context) {
    const dir = path.join(context.opts.projectRoot, DIR);
    if (!fs.existsSync(dir)) return;
    let touched = false;
    for (const name of ['MusicControls.java', 'MusicControlsNotification.java']) {
        const file = path.join(dir, name);
        if (!fs.existsSync(file)) continue;
        const java = fs.readFileSync(file, 'utf8');
        const patched = patchExplicitIntents(patchReceivers(java));
        if (patched !== java) {
            fs.writeFileSync(file, patched, 'utf8');
            touched = true;
        }
    }
    if (!touched && !fs.readFileSync(path.join(dir, 'MusicControls.java'), 'utf8').includes('RECEIVER_NOT_EXPORTED')) {
        console.warn('fix-music-controls: ничего не исправлено — плагин обновился, хук нужно перепроверить');
    }
};
