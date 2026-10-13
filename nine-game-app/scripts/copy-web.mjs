// Copies the web game (../nine-game) into www/, which Capacitor bundles into the app.
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
rmSync(root + 'www', { recursive: true, force: true });
cpSync(root + '../nine-game', root + 'www', { recursive: true });
console.log('Copied ../nine-game -> www');
