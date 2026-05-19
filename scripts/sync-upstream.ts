#!/usr/bin/env bun
/**
 * Upstream Sync Script
 *
 * 최신 upstream(ohah/hwpjs)을 받아 table-schema 어댑터가 정상 동작하는지 확인합니다.
 *
 * Usage:
 *   bun scripts/sync-upstream.ts
 *   bun scripts/sync-upstream.ts --dry-run   # fetch + test만, rebase 없음
 *   bun scripts/sync-upstream.ts --tag        # origin/main 대신 최신 태그 기준
 */

import { $ } from 'bun';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const USE_TAG = args.includes('--tag');

// ─── ANSI colors ─────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};
const ok = (msg: string) => console.log(`${c.green}✓${c.reset} ${msg}`);
const info = (msg: string) => console.log(`${c.cyan}→${c.reset} ${msg}`);
const warn = (msg: string) => console.log(`${c.yellow}⚠${c.reset}  ${msg}`);
const fail = (msg: string) => console.error(`${c.red}✗${c.reset} ${msg}`);

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function run(cmd: string, opts?: { cwd?: string; noThrow?: boolean }) {
  try {
    const result = await $`bash -c ${cmd}`.cwd(opts?.cwd ?? '.').quiet();
    return {
      ok: true,
      stdout: result.stdout.toString().trim(),
      stderr: result.stderr.toString().trim(),
    };
  } catch (e: any) {
    if (opts?.noThrow) return { ok: false, stdout: '', stderr: e.message ?? '' };
    throw e;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log(`\n${c.bold}hwpjs upstream sync${c.reset}\n`);

// 1. 현재 브랜치 확인
const branchResult = await run('git rev-parse --abbrev-ref HEAD');
const currentBranch = branchResult.stdout;
info(`현재 브랜치: ${currentBranch}`);

// 2. 작업 중인 변경사항 체크
const statusResult = await run('git status --porcelain');
// untracked(??) 파일은 무시 — staged/unstaged 변경사항만 체크
const dirtyLines = statusResult.stdout.split('\n').filter((l) => l && !l.startsWith('??'));
if (dirtyLines.length > 0) {
  fail('커밋되지 않은 변경사항이 있습니다. 먼저 커밋하세요.');
  console.log(dirtyLines.join('\n'));
  process.exit(1);
}

// 3. upstream fetch
info('origin fetch 중...');
await run('git fetch origin');
ok('fetch 완료');

// 4. upstream 기준 커밋 결정
let upstreamRef: string;
if (USE_TAG) {
  const tagResult = await run("git tag -l '@ohah/hwpjs@*' | sort -V | tail -1");
  upstreamRef = tagResult.stdout || 'origin/main';
  info(`기준: ${upstreamRef} (최신 태그)`);
} else {
  upstreamRef = 'origin/main';
  info(`기준: ${upstreamRef}`);
}

// 5. 업스트림 커밋 표시
const upstreamLog = await run(`git log --oneline -3 ${upstreamRef}`);
console.log(
  `\n  upstream 최신:\n${upstreamLog.stdout
    .split('\n')
    .map((l) => `    ${l}`)
    .join('\n')}\n`
);

// 6. rebase (dry-run이 아닐 때)
if (DRY_RUN) {
  warn('--dry-run: rebase 생략');
} else {
  info(`${upstreamRef} 위로 rebase 중...`);

  const rebaseResult = await run(`git rebase ${upstreamRef}`, { noThrow: true });

  if (!rebaseResult.ok) {
    // 충돌 발생 시 자동 해결 시도
    warn('충돌 감지 — 자동 해결 시도 중...');

    // 바이너리 .node 파일 → upstream 버전 유지
    await run("git checkout --theirs 'packages/hwpjs/dist/*.node' 2>/dev/null || true", {
      noThrow: true,
    });

    const unmerged = await run('git ls-files --unmerged --name-only');
    if (unmerged.stdout) {
      fail('자동 해결 불가 충돌 파일:');
      console.log(unmerged.stdout);
      console.log('\n수동으로 해결 후 다음 명령을 실행하세요:');
      console.log('  git add <resolved files>');
      console.log('  git rebase --continue');
      console.log('  bun scripts/sync-upstream.ts --dry-run  # 테스트만 재실행');
      process.exit(1);
    }

    await run('git add -A');
    await run('git rebase --continue --no-edit');
  }

  const newHead = await run('git rev-parse --short HEAD');
  ok(`rebase 완료 → HEAD: ${newHead.stdout}`);
}

// 7. 어댑터 테스트
console.log(`\n${c.bold}어댑터 테스트 실행...${c.reset}`);
info('bun test packages/hwpjs-adapter/__test__/table-schema.spec.ts');

const testResult = await run('bun test packages/hwpjs-adapter/__test__/table-schema.spec.ts', {
  noThrow: true,
});

console.log(testResult.stdout || testResult.stderr);

if (!testResult.ok) {
  fail('테스트 실패 — 어댑터가 upstream 변경에 영향을 받았습니다.');
  console.log('\n확인이 필요한 항목:');
  console.log('  - packages/hwpjs-adapter/src/table-schema.ts');
  console.log('  - HWP JSON 구조 변경 여부 (HwpTable, HwpCell 인터페이스)');
  process.exit(1);
}

ok('테스트 통과');

// 8. 요약
const finalLog = await run(`git log --oneline ${upstreamRef}..HEAD`);
const adapterCommits = finalLog.stdout ? finalLog.stdout.split('\n') : [];

console.log(`\n${c.bold}완료${c.reset}`);
if (adapterCommits.length > 0) {
  console.log(`  어댑터 커밋 ${adapterCommits.length}개가 upstream 위에 있습니다:`);
  adapterCommits.forEach((l) => console.log(`    ${l}`));
} else {
  console.log('  upstream과 동일합니다.');
}
console.log('');
