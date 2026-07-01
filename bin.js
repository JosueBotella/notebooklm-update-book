#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');

// Localizar el ejecutable local de tsx
// En instalaciones de npm/pnpm, el binario está en node_modules/.bin/tsx
const tsxBin = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';
const tsxPath = path.join(__dirname, 'node_modules', '.bin', tsxBin);
const indexPath = path.join(__dirname, 'index.ts');

const args = process.argv.slice(2);

const result = spawnSync(tsxPath, [indexPath, ...args], {
    stdio: 'inherit',
    shell: true
});

process.exit(result.status !== null ? result.status : 0);
