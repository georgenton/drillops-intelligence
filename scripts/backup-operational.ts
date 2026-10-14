/** Private staging recovery drill. Never restores into an existing database.
 * DRILLOPS_BACKUP_DIR must point outside the repository to private local storage.
 * Prerequisites: existing SSH tunnel 55448, staging secret JSON, R2 object-scoped
 * secret JSON, and disposable local container drillops-execution-test-20261014.
 */
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import pg from 'pg';

async function main() {
const secretRoot = path.join(homedir(), '.config/syntavera/secrets');
const provision = JSON.parse(await readFile(path.join(secretRoot, 'drillops-staging-provision.json'), 'utf8'));
const r2 = JSON.parse(await readFile(path.join(secretRoot, 'drillops-staging-r2.json'), 'utf8'));
if (r2.bucket !== 'drillops-staging-backups-20261014') throw new Error('Unexpected bucket');
const directory = path.resolve(process.env.DRILLOPS_BACKUP_DIR ?? path.join(homedir(), '.config/syntavera/backups/drillops'));
const repo = process.cwd();
if (directory === repo || directory.startsWith(repo + path.sep)) throw new Error('Backups must stay outside repository');
await mkdir(directory, { recursive: true, mode: 0o700 });
await chmod(directory, 0o700);
const stamp = new Date().toISOString().replace(/[^0-9]/g, '');
const backup = path.join(directory, `staging-${stamp}.dump`);
const downloaded = path.join(directory, `staging-${stamp}.restored-download.dump`);
const restoreDatabase = `drillops_restore_${stamp}`;
const client = new pg.Client({ host: '127.0.0.1', port: 55448, database: 'drillops', user: 'drillops_admin', password: provision.admin_password });
const s3 = new S3Client({ region: 'auto', endpoint: r2.endpoint, credentials: { accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey } });
const key = `staging/recovery-drill/${stamp}.dump`;
const dockerContainer = 'drillops-execution-test-20261014';

function command(executable: string, args: string[], input?: string, output?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let error = '';
    child.stderr.on('data', chunk => { error += chunk.toString(); });
    child.once('error', reject);
    const streams: Promise<void>[] = [];
    if (input) streams.push(pipeline(createReadStream(input), child.stdin)); else child.stdin.end();
    if (output) streams.push(pipeline(child.stdout, createWriteStream(output, { mode: 0o600, flags: 'wx' }))); else child.stdout.resume();
    child.once('close', code => {
      Promise.all(streams).then(() => code === 0 ? resolve() : reject(new Error(`${executable} failed (${code}): ${error.slice(0, 200)}`)), reject);
    });
  });
}
async function hash(file: string) {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(file)) h.update(chunk);
  return h.digest('hex');
}
async function counts(connection: pg.Client) {
  const tables = (await connection.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','drizzle') ORDER BY schemaname,tablename")).rows;
  const result: Record<string, number> = {};
  for (const row of tables) {
    if (!/^[a-z_][a-z_0-9]*$/.test(row.tablename)) throw new Error('Unexpected identifier');
    const schema = row.schemaname;
    result[`${schema}.${row.tablename}`] = Number((await connection.query(`SELECT count(*) AS n FROM "${schema}"."${row.tablename}"`)).rows[0].n);
  }
  return result;
}
await client.connect();
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const snapshot = (await client.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot as string;
  if (!/^[0-9A-F-]+$/i.test(snapshot)) throw new Error('Unexpected snapshot identifier');
  const expected = await counts(client);
  await command('ssh', ['-o', 'BatchMode=yes', 'syntavera-vps', `sudo -n docker exec a2ui1b8eijeqsbwl3i7e4urs pg_dump -U drillops_admin --format=custom --no-owner --no-acl --snapshot=${snapshot} drillops`], undefined, backup);
  await client.query('COMMIT');
  const digest = await hash(backup);
  await s3.send(new PutObjectCommand({ Bucket: r2.bucket, Key: key, Body: createReadStream(backup), Metadata: { sha256: digest } }));
  const response = await s3.send(new GetObjectCommand({ Bucket: r2.bucket, Key: key }));
  if (!response.Body) throw new Error('Empty download');
  await writeFile(downloaded, await response.Body.transformToByteArray(), { mode: 0o600, flag: 'wx' });
  if (await hash(downloaded) !== digest || response.Metadata?.sha256 !== digest) throw new Error('Backup hash mismatch');
  await command('docker', ['exec', dockerContainer, 'createdb', '-U', 'drillops_test', restoreDatabase]);
  await command('docker', ['exec', '-i', dockerContainer, 'pg_restore', '-U', 'drillops_test', '-d', restoreDatabase, '--no-owner', '--no-acl', '--exit-on-error'], downloaded);
  const restored = new pg.Client({ host: '127.0.0.1', port: 5448, database: restoreDatabase, user: 'drillops_test', password: 'local-disposable-only' });
  await restored.connect();
  let actual: Record<string, number>;
  try { actual = await counts(restored); } finally { await restored.end(); }
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('Restored counts differ');
  let isolationDenied = false;
  try { await s3.send(new ListObjectsV2Command({ Bucket: 'drillops-demo-backups-20261014', MaxKeys: 1 })); }
  catch (error) { isolationDenied = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 403; }
  if (!isolationDenied) throw new Error('Cross-bucket isolation not confirmed');
  const report = { createdAt: new Date().toISOString(), bucket: r2.bucket, key, sha256: digest, restoredDatabase: restoreDatabase, counts: actual, crossBucketDenied: isolationDenied, note: 'Disposable restored DB retained; no active DB modified.' };
  await writeFile(path.join(directory, `recovery-${stamp}.json`), JSON.stringify(report, null, 2), { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify(report, null, 2));
} finally { await client.end(); s3.destroy(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Recovery drill failed'); process.exitCode = 1; });
