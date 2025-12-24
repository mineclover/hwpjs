/**
 * JSON 출력에서 TypeScript 타입 자동 생성
 *
 * 사용법: bun run scripts/generate-types.ts
 *
 * 기존 코드 수정 없이 실제 JSON 출력에서 타입을 생성합니다.
 */
import { InputData, jsonInputForTargetLanguage, quicktype } from 'quicktype-core';
import { toJson } from '../dist/index.js';
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

async function generateTypes() {
  console.log('=== Generating TypeScript types from JSON samples ===\n');

  // 샘플 HWP 파일들에서 JSON 수집
  const fixturesPath = join(__dirname, '../../../crates/hwp-core/tests/fixtures');
  const jsonSamples: string[] = [];

  const files = readdirSync(fixturesPath).filter(f => f.endsWith('.hwp'));
  console.log(`Found ${files.length} HWP files\n`);

  for (const file of files) {
    try {
      const hwpData = readFileSync(join(fixturesPath, file));
      const json = toJson(hwpData);
      jsonSamples.push(json);
      console.log(`✓ ${file}`);
    } catch (e: any) {
      console.log(`✗ ${file} - ${e.message.slice(0, 50)}`);
    }
  }

  console.log(`\nCollected ${jsonSamples.length} JSON samples\n`);

  if (jsonSamples.length === 0) {
    console.error('No valid JSON samples found');
    process.exit(1);
  }

  // quicktype으로 TypeScript 타입 생성
  const jsonInput = jsonInputForTargetLanguage('typescript');

  await jsonInput.addSource({
    name: 'HwpDocument',
    samples: jsonSamples,
  });

  const inputData = new InputData();
  inputData.addInput(jsonInput);

  const result = await quicktype({
    inputData,
    lang: 'typescript',
    rendererOptions: {
      'just-types': 'true',
      'prefer-unions': 'true',
      'prefer-const-values': 'true',
    },
  });

  // 파일 저장
  const outputPath = join(__dirname, '../types/hwp-document.generated.d.ts');
  const header = `/**
 * HWP Document Type Definitions
 *
 * AUTO-GENERATED from JSON output samples
 * DO NOT EDIT MANUALLY
 *
 * Generated: ${new Date().toISOString()}
 * Samples: ${jsonSamples.length} HWP files
 *
 * Usage:
 *   import type { HwpDocument } from './types/hwp-document.generated';
 *   const doc: HwpDocument = JSON.parse(toJson(hwpBuffer));
 */

`;

  writeFileSync(outputPath, header + result.lines.join('\n'));
  console.log(`\n✓ Generated: ${outputPath}`);
  console.log(`  Size: ${result.lines.length} lines`);
}

generateTypes().catch(console.error);
