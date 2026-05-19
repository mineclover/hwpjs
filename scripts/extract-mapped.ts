import { toJson, toHtml } from '../packages/hwpjs/dist/index.js';
import { extract } from '../packages/hwpjs-adapter/src/extract/index.js';
import type { ImageMap } from '../packages/hwpjs-adapter/src/table-schema.js';
import * as fs from 'fs';
import * as path from 'path';

const hwpDir = 'D:/woo-work/hwp-pipe';
const outDir = 'D:/woo-work/hwp-pipe-output/mapped';
const csvPath = 'D:/woo-work/hwp-pipe-output/cdms-hwp-mapping.csv';

fs.mkdirSync(outDir, { recursive: true });

function buildImageMap(html: string): ImageMap {
  const map: ImageMap = new Map();
  const matches = html.match(/data:image\/([^;]+);base64,[A-Za-z0-9+/=]+/g) ?? [];
  matches.forEach((d, i) => {
    const fmt = d.match(/data:image\/([^;]+)/)?.[1] ?? 'jpeg';
    map.set(i + 1, { dataUrl: d, format: fmt });
  });
  return map;
}

// CSV 파싱: 쉼표 포함 필드 대응
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '',
    inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuote = !inQuote;
    } else if (c === ',' && !inQuote) {
      fields.push(cur);
      cur = '';
    } else cur += c;
  }
  fields.push(cur);
  return fields.map((f) => f.trim().replace(/^"|"$/g, ''));
}

const csvLines = fs.readFileSync(csvPath, 'utf-8').split('\n').slice(1).filter(Boolean);

let ok = 0,
  fail = 0;
const index: object[] = [];

for (const line of csvLines) {
  const cols = parseCsvLine(line);
  const cdms = cols[0];
  const file = cols[1];
  const title = cols[2] ?? '';
  const hwpPath = path.join(hwpDir, file);

  process.stdout.write(`[${cdms}] ${file.slice(0, 45).padEnd(45)} ... `);

  if (!fs.existsSync(hwpPath)) {
    console.log('SKIP (파일 없음)');
    fail++;
    continue;
  }

  try {
    const buf = fs.readFileSync(hwpPath);
    const hwpJson = JSON.parse(toJson(buf));
    const imageMap = buildImageMap(toHtml(buf));
    const jsonOut = path.join(outDir, `${cdms}.json`);

    const result = extract(hwpJson, {
      apis: ['content', 'style'],
      imageMap,
      sourcePaths: {
        hwp: hwpPath.replace(/\\/g, '/'),
        json: jsonOut.replace(/\\/g, '/'),
      },
    });

    (result.meta as any).cdms_code = cdms;
    (result.meta as any).title = title;

    fs.writeFileSync(path.join(outDir, `${cdms}.extract.json`), JSON.stringify(result, null, 2));

    const tables = result.records.filter((r) => r.kind === 'table').length;
    const texts = result.records.filter((r) => r.kind === 'text').length;
    console.log(`✓  text:${texts} table:${tables}`);

    index.push({ cdms_code: cdms, file, title, records: result.records.length, tables, texts });
    ok++;
  } catch (e: any) {
    console.log(`✗  ${String(e?.message ?? e).slice(0, 60)}`);
    index.push({ cdms_code: cdms, file, title, error: String(e?.message ?? e) });
    fail++;
  }
}

fs.writeFileSync(
  path.join(outDir, 'index.json'),
  JSON.stringify(
    { generated_at: new Date().toISOString(), total: ok + fail, ok, fail, files: index },
    null,
    2
  )
);

console.log(`\n✅ ${ok}개 성공 / ${fail}개 실패`);
console.log(`   출력: ${outDir}`);
