import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const huskyDir = join(repoRoot, '.husky');

function run(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8' });
}

function tryRun(cmd, args, cwd) {
  try {
    run(cmd, args, cwd);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err };
  }
}

// packages/配下の変更を含むコミットを想定した一時リポジトリを構築し、
// pre-commit/commit-msgフックが正しく検証を行うかをサンドボックスで確認する。
function setupTempRepo({ scriptsAllPass }) {
  const dir = mkdtempSync(join(tmpdir(), 'hooks-test-'));

  run('git', ['init', '-q'], dir);
  run('git', ['config', 'user.email', 'test@example.com'], dir);
  run('git', ['config', 'user.name', 'Test'], dir);
  run('git', ['config', 'core.hooksPath', '.husky'], dir);

  mkdirSync(join(dir, '.husky'), { recursive: true });
  cpSync(join(huskyDir, 'pre-commit'), join(dir, '.husky', 'pre-commit'));
  cpSync(join(huskyDir, 'commit-msg'), join(dir, '.husky', 'commit-msg'));
  chmodSync(join(dir, '.husky', 'pre-commit'), 0o755);
  chmodSync(join(dir, '.husky', 'commit-msg'), 0o755);

  const scriptResult = scriptsAllPass ? 'exit 0' : 'exit 1';
  const pkg = {
    name: 'hooks-test-fixture',
    private: true,
    scripts: {
      'format:check': scriptResult,
      lint: scriptResult,
      typecheck: scriptResult,
      test: scriptResult,
    },
  };
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  mkdirSync(join(dir, 'packages', 'engine', 'src'), { recursive: true });
  mkdirSync(join(dir, 'doc'), { recursive: true });

  run('git', ['add', 'package.json'], dir);
  run('git', ['commit', '-q', '-m', 'chore: initial commit'], dir);

  return dir;
}

test('packages/配下の変更でformat/lint/typecheck/testのいずれかが失敗する場合、コミットが拒否される', () => {
  const dir = setupTempRepo({ scriptsAllPass: false });
  try {
    writeFileSync(join(dir, 'packages', 'engine', 'src', 'foo.ts'), 'export const foo = 1;\n');
    run('git', ['add', 'packages/engine/src/foo.ts'], dir);
    const result = tryRun(
      'git',
      ['commit', '-m', 'feat: [T99] test\n\nSelf-Review: sonnet, TODO=T99, findings=0'],
      dir,
    );
    assert.equal(result.ok, false, 'チェック失敗時はコミットが拒否されるはず');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('packages/配下の変更で全チェックが成功しtrailerも正しい場合、コミットが成功する', () => {
  const dir = setupTempRepo({ scriptsAllPass: true });
  try {
    writeFileSync(join(dir, 'packages', 'engine', 'src', 'foo.ts'), 'export const foo = 1;\n');
    run('git', ['add', 'packages/engine/src/foo.ts'], dir);
    const result = tryRun(
      'git',
      ['commit', '-m', 'feat: [T99] test\n\nSelf-Review: sonnet, TODO=T99, findings=0'],
      dir,
    );
    assert.equal(result.ok, true, '全チェック成功・trailer正常時はコミットが成功するはず');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('packages/配下の変更でtrailerが無い場合、コミットが拒否される', () => {
  const dir = setupTempRepo({ scriptsAllPass: true });
  try {
    writeFileSync(join(dir, 'packages', 'engine', 'src', 'foo.ts'), 'export const foo = 1;\n');
    run('git', ['add', 'packages/engine/src/foo.ts'], dir);
    const result = tryRun('git', ['commit', '-m', 'feat: [T99] test without trailer'], dir);
    assert.equal(result.ok, false, 'trailerが無い場合はコミットが拒否されるはず');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('doc/のみの変更ではformat/lint/typecheck/test・trailerともにチェックされずコミットが成功する', () => {
  const dir = setupTempRepo({ scriptsAllPass: false });
  try {
    writeFileSync(join(dir, 'doc', 'note.md'), '# note\n');
    run('git', ['add', 'doc/note.md'], dir);
    const result = tryRun('git', ['commit', '-m', 'docs: update note'], dir);
    assert.equal(result.ok, true, 'doc/のみの変更はチェック対象外でコミットが成功するはず');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
