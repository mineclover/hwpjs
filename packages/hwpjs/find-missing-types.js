const { toJson } = require('./dist/index.js');
const fs = require('fs');

const hwp = fs.readFileSync('../../crates/hwp-core/tests/fixtures/shaperect.hwp');
const json = JSON.parse(toJson(hwp));

// 모든 record type 수집
const allTypes = new Set();
function collectTypes(obj) {
  if (!obj || typeof obj !== 'object') return;
  if (obj.type && typeof obj.type === 'string') {
    allTypes.add(obj.type);
  }
  if (Array.isArray(obj)) {
    obj.forEach(collectTypes);
  } else {
    Object.values(obj).forEach(collectTypes);
  }
}
collectTypes(json);

console.log('=== All Record Types Found ===');
console.log([...allTypes].sort());

// shape_component_rectangle 샘플 추출
function findType(obj, targetType) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.type === targetType) return obj;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findType(item, targetType);
      if (found) return found;
    }
  } else {
    for (const v of Object.values(obj)) {
      const found = findType(v, targetType);
      if (found) return found;
    }
  }
  return null;
}

console.log('\n=== shape_component_rectangle Sample ===');
const rect = findType(json, 'shape_component_rectangle');
if (rect) {
  console.log(JSON.stringify(rect, null, 2));
}

// shape_component_line도 확인
const hwp2 = fs.readFileSync('../../crates/hwp-core/tests/fixtures/shapeline.hwp');
const json2 = JSON.parse(toJson(hwp2));
console.log('\n=== shape_component_line Sample ===');
const line = findType(json2, 'shape_component_line');
if (line) {
  console.log(JSON.stringify(line, null, 2));
}
