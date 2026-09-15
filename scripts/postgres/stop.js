/** Encerra somente o cluster deste projeto, preservando seus dados e credenciais. */
import { directory, postgresBin, runPostgres } from './local.js';
const bin = await postgresBin();
const cluster = `${directory}/cluster`;
const running = await runPostgres(`${bin}/pg_ctl`, ['-D', cluster, 'status']).then(
  () => true,
  () => false,
);
if (running) await runPostgres(`${bin}/pg_ctl`, ['-D', cluster, '-m', 'fast', '-w', 'stop']);
console.log('Cluster local do help-family parado. Os dados foram preservados.');
