/**
 * Google Apps Script для приёма результатов теста и записи в таблицу.
 *
 * Установка:
 *  1. Создайте Google-таблицу (Google Sheets).
 *  2. Меню: Расширения → Apps Script.
 *  3. Удалите шаблонный код, вставьте этот файл целиком, сохраните.
 *  4. Деплой → Новое развёртывание → тип «Веб-приложение».
 *       - «Выполнять от имени»: Я (ваш аккаунт)
 *       - «У кого есть доступ»: Все
 *  5. Скопируйте URL веб-приложения и вставьте его в app.js → SHEET_ENDPOINT.
 *
 * При первом запуске Google попросит подтвердить разрешения — согласитесь.
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000); // защита от одновременной записи
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Результаты') || ss.getSheets()[0];

    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        'Дата', 'ФИО',
        'Дофамин (из 50)', 'Ацетилхолин (из 50)', 'ГАМК (из 50)', 'Серотонин (из 50)',
        'Доминирующий тип', 'Активная доля мозга'
      ]);
    }

    sheet.appendRow([
      new Date(),
      data.name || '',
      data.dopamine, data.acetylcholine, data.gaba, data.serotonin,
      data.dominant || '', data.lobe || ''
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ result: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ result: 'error', error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// Необязательно: открыв URL в браузере (GET), увидите, что сервис жив.
function doGet() {
  return ContentService
    .createTextOutput('Сервис теста Бравермана работает.')
    .setMimeType(ContentService.MimeType.TEXT);
}
