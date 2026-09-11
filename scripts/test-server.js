// A disposable database keeps browser tests away from the user's health data.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../backend/app.js';
import { createDemoState } from '../backend/services/demo-state.js';
const directory = mkdtempSync(join(tmpdir(), 'help-family-browser-'));
const { db, service } = createApp(directory);
service.importState(createDemoState());
db.close();
process.env.HELP_FAMILY_DATA_DIR = directory;
process.env.HELP_FAMILY_PORT = '3011';
process.on('exit', () => rmSync(directory, { recursive: true, force: true }));
await import('../backend/server.js');
