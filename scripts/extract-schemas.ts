/**
 * Stage 1: HWP 파일 → TableSchema JSON 추출
 *
 * Usage: bun scripts/extract-schemas.ts <hwp-folder> [output-folder]
 *
 * 출력 구조:
 *   <output>/
 *     schemas/
 *       001. 강의계획서_....json   ← TableSchema[]
 *       ...
 *     images/
 *       001-img-1.jpeg             ← 이미지 파일 (파일 prefix-id.ext)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as hwpjs from '../packages/hwpjs/dist/index.js';
import {
  transformHwpTablesWithSchema,
  extractAllTableSchemas,
  type TableSchema,
  type ImageMap,
} from '../packages/hwpjs-adapter/src/table-schema';

interface SchemaFile {
  file: string;           // 원본 HWP 파일명
  extractedAt: string;    // ISO timestamp
  schemas: TableSchema[]; // image src = 상대경로 "images/<prefix>-img-N.ext"
}

async function extractFromHwp(
  filePath: string,
  prefix: string,        // 이미지 파일명 prefix (e.g. "001")
  imageDir: string,      // 이미지를 저장할 절대 경로
): Promise<TableSchema[]> {
  const data = fs.readFileSync(filePath);
  const uint8Data = new Uint8Array(data);

  // HTML에서 data URL 추출
  const htmlResult = hwpjs.toHtml(uint8Data, { includeVersion: false, includePageInfo: false });
  const imageMap: ImageMap = new Map();
  const dataUrlMatches = htmlResult.match(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/g);
  if (dataUrlMatches) {
    dataUrlMatches.forEach((dataUrl, i) => {
      const format = dataUrl.match(/data:image\/([^;]+)/)?.[1] ?? 'unknown';
      imageMap.set(i + 1, { dataUrl, format });
    });
  }

  const jsonString = hwpjs.toJson(uint8Data);
  const parsed = JSON.parse(jsonString);
  if (!parsed.body_text) return [];

  const transformed = transformHwpTablesWithSchema(parsed.body_text, { imageMap });
  const schemas = extractAllTableSchemas(transformed);

  // 이미지 파일 저장 + src를 상대경로로 교체
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir(imageDir, { recursive: true });

  const saved = new Map<string, string>();

  for (const schema of schemas) {
    for (const row of schema.rows) {
      for (const cell of row.cells) {
        for (const img of cell.images ?? []) {
          if (!img.src.startsWith('data:') || saved.has(img.id)) continue;
          const base64 = img.src.split(',')[1] ?? '';
          const fname = `${prefix}-${img.id}.${img.format}`;
          await writeFile(path.join(imageDir, fname), Buffer.from(base64, 'base64'));
          saved.set(img.id, `images/${fname}`); // 상대경로로 저장
        }
      }
    }
  }

  // src 교체 (절대경로 → 상대경로)
  return schemas.map(schema => ({
    ...schema,
    rows: schema.rows.map(row => ({
      ...row,
      cells: row.cells.map(cell => ({
        ...cell,
        images: cell.images?.map(img => ({
          ...img,
          src: saved.get(img.id) ?? img.src,
        })),
      })),
    })),
  }));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: bun scripts/extract-schemas.ts <hwp-folder> [output-folder]');
    process.exit(1);
  }

  const hwpFolder = args[0];
  const outputDir = args[1] || path.join(hwpFolder, '..', 'output');
  const schemasDir = path.join(outputDir, 'schemas');
  const imageDir = path.join(outputDir, 'images');

  fs.mkdirSync(schemasDir, { recursive: true });
  fs.mkdirSync(imageDir, { recursive: true });

  const hwpFiles = fs.readdirSync(hwpFolder)
    .filter(f => f.toLowerCase().endsWith('.hwp'))
    .sort()
    .map(f => ({ name: f, full: path.join(hwpFolder, f) }));

  console.log(`Found ${hwpFiles.length} HWP files → ${outputDir}`);

  let totalSchemas = 0;

  for (const file of hwpFiles) {
    // 파일명에서 prefix 추출 (앞 3자리 숫자 or 파일명 그대로)
    const numMatch = file.name.match(/^(\d+)/);
    const prefix = numMatch ? numMatch[1].padStart(3, '0') : file.name.slice(0, 8);
    const baseName = file.name.replace(/\.hwp\.hwp$/i, '').replace(/\.hwp$/i, '');
    const jsonPath = path.join(schemasDir, `${baseName}.json`);

    console.log(`Extracting: ${file.name}`);

    try {
      const schemas = await extractFromHwp(file.full, prefix, imageDir);
      totalSchemas += schemas.length;

      const schemaFile: SchemaFile = {
        file: file.name,
        extractedAt: new Date().toISOString(),
        schemas,
      };
      fs.writeFileSync(jsonPath, JSON.stringify(schemaFile, null, 2), 'utf-8');
      console.log(`  -> ${schemas.length} schemas saved to ${path.basename(jsonPath)}`);
    } catch (err) {
      console.error(`  -> Error: ${err}`);
    }
  }

  console.log(`\nDone! ${hwpFiles.length} files, ${totalSchemas} schemas total`);
  console.log(`Schemas: ${schemasDir}`);
  console.log(`Images:  ${imageDir}`);
}

main();
