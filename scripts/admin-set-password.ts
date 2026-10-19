/**
 * Trusted operator recovery tool for the local administrator account.
 *
 * Run from frontent/ (stop the API server first, or restart it afterwards):
 *
 *   npm run admin:set-password
 *
 * The password is read from the terminal without echo and written to the
 * datastore as a salted scrypt hash. It is never printed, logged, passed as a
 * command-line argument, or sent over the network. This script is the recovery
 * path when the local administrator password is unknown; it cannot be reached
 * through the public API.
 */
import fs from 'node:fs';
import readline from 'node:readline';
import { db } from '../server/db.ts';
import { validatePasswordStrength } from '../src/utils/passwordPolicy.ts';

let pipedLines: string[] | null = null;

async function askHidden(question: string): Promise<string> {
  process.stdout.write(question);

  if (!process.stdin.isTTY) {
    // Read all piped lines once so a pipe can supply both prompts reliably.
    if (!pipedLines) pipedLines = fs.readFileSync(0, 'utf8').split(/\r?\n/);
    return pipedLines.shift() ?? '';
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
  });
  // Suppress echo of everything typed, including the newline.
  (rl as unknown as { _writeToOutput: () => void })._writeToOutput = () => undefined;
  const answer = await new Promise<string>((resolve) => rl.question('', resolve));
  rl.close();
  process.stdout.write('\n');
  return answer;
}

async function main() {
  const usernameArg = process.argv.find((arg) => arg.startsWith('--username='))?.split('=')[1];
  const state = db.getAdminAuthState();
  const username = state.username || usernameArg || 'admin';

  console.log(`Zamzam local administrator: ${username}`);
  if (state.configured) {
    console.log('A new password replaces the existing local password and revokes all sessions.');
  } else {
    console.log('No local administrator exists yet; one will be created.');
  }

  const first = await askHidden('New administrator password: ');
  const second = await askHidden('Confirm new password: ');
  if (first !== second) {
    console.error('Passwords do not match. Nothing was changed.');
    process.exitCode = 1;
    return;
  }

  const policy = validatePasswordStrength(first, { identifier: username });
  if (!policy.ok) {
    console.error(policy.errors.join('\n'));
    console.error('Nothing was changed.');
    process.exitCode = 1;
    return;
  }

  const result = db.setAdminPassword(first, username);
  if (!result.success) {
    console.error(result.error || 'The password could not be set.');
    process.exitCode = 1;
    return;
  }

  console.log('Administrator password updated. Existing administrator sessions were revoked.');
  console.log('Restart the API server if it is currently running so it reloads the datastore.');
}

main().catch((error) => {
  console.error(`Password update failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
