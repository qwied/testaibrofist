// На Hostim контейнер со старой версией и контейнер с новой коротко
// работают одновременно на одном и том же постоянном диске (несколько
// секунд во время деплоя) — прямой writeFileSync может застать читателя
// на середине записи и отдать ему обрезанный JSON. rename() в пределах
// одной файловой системы атомарен: читатель всегда видит либо старое,
// либо новое содержимое целиком, никогда половину.
const fs = require('fs');
const path = require('path');

function atomicWriteFileSync(filePath, data) {
  const tmp = path.join(path.dirname(filePath),
    '.' + path.basename(filePath) + '.' + process.pid + '.tmp');
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, filePath);
}

module.exports = { atomicWriteFileSync };
