#!/usr/bin/env node
/**
 * Staging derlemesi — platformdan bağımsız.
 *
 * `PUBLIC_DEPLOY_ENV=staging astro build` yazmak yeterli olurdu ama bu sözdizimi
 * yalnızca POSIX kabuklarında çalışır; Windows'ta npm komutları cmd.exe ile
 * koşar ve satır başındaki atama hata verir. cross-env gibi bir bağımlılık
 * eklemek yerine değişkeni burada ayarlayıp derlemeyi başlatıyoruz.
 */
import { spawnSync } from 'node:child_process';

const result = spawnSync('npx', ['astro', 'build'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, PUBLIC_DEPLOY_ENV: 'staging' },
});

process.exit(result.status ?? 1);
