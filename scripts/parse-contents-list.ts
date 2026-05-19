#!/usr/bin/env bun
/**
 * contents_list.js → contents-list.json
 *
 * JS 파일의 contents_list 배열을 파싱하여 JSON으로 저장합니다.
 *
 * Usage:
 *   bun scripts/parse-contents-list.ts <js-file> [output.json]
 */

import { readFileSync, writeFileSync } from 'fs';

const [, , jsPath, outPath = 'pipeline/contents-list.json'] = process.argv;

if (!jsPath) {
  console.error('Usage: bun scripts/parse-contents-list.ts <js-file> [output.json]');
  process.exit(1);
}

// JS 파일을 더미 변수로 eval
const src = readFileSync(jsPath, 'utf8');
// JS 파일이 var cont_w 등을 자체 선언하므로 래퍼에서는 선언하지 않음
const fn = new Function(`
  var cont_w = 0, cont_h = 0, url_path = '';
  var contents_list = {};
  ${src}
  return contents_list;
`);

const raw = fn() as Record<string, unknown[]>;

export interface Chapter {
  index: number;
  title: string;
  enabled: boolean;
  url: string;
  date: string;
}

export interface CourseEntry {
  index: number;
  title: string;
  type: string;
  field: string;
  number: string;
  chapter_count: number;
  chapters: Chapter[];
}

const courses: CourseEntry[] = [];

for (const [key, arr] of Object.entries(raw)) {
  const idx = parseInt(key, 10);
  if (!Array.isArray(arr) || arr.length === 0) continue;

  const meta = arr[0] as unknown[];
  if (!Array.isArray(meta) || !meta[0]) continue;

  const title = meta[0] as string;
  const type = (meta[2] as string) ?? '';
  const field = (meta[6] as string) ?? '';
  const number = (meta[7] as string) ?? '';

  const chapters: Chapter[] = [];
  for (let i = 1; i < arr.length; i++) {
    const ch = arr[i] as unknown[];
    if (!Array.isArray(ch)) continue;
    chapters.push({
      index: i,
      title: (ch[0] as string) ?? '',
      enabled: ch[1] === true,
      url: (ch[2] as string) ?? '',
      date: (ch[6] as string) ?? '',
    });
  }

  courses.push({
    index: idx,
    title,
    type,
    field,
    number,
    chapter_count: chapters.length,
    chapters,
  });
}

courses.sort((a, b) => a.index - b.index);

writeFileSync(outPath, JSON.stringify(courses, null, 2), 'utf8');
console.log(`Parsed ${courses.length} courses → ${outPath}`);
