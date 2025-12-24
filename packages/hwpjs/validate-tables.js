const fs = require('fs');
const json = JSON.parse(fs.readFileSync('test-output.json'));

// 테이블 찾기
let tableCount = 0;
function findTables(obj) {
  if (!obj || typeof obj !== 'object') return;
  if (obj.type === 'table' && obj.table) {
    tableCount++;
    const t = obj.table;
    console.log('--- Table', tableCount, '---');
    console.log('rows:', t.attributes.row_count, 'cols:', t.attributes.col_count);
    console.log('cells:', t.cells.length);
    if (t.cells[0]) {
      const c = t.cells[0];
      console.log('  cell[0]: row=' + c.cell_attributes.row_address,
                  'col=' + c.cell_attributes.col_address,
                  'span=' + c.cell_attributes.row_span + 'x' + c.cell_attributes.col_span);
      console.log('  paragraphs:', c.paragraphs.length);
    }
  }
  if (Array.isArray(obj)) {
    obj.forEach(findTables);
  } else {
    Object.values(obj).forEach(findTables);
  }
}
findTables(json);
console.log('\nTotal tables:', tableCount);
