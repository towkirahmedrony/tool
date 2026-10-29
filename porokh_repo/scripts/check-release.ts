/**
 * Pre-flight validation for an OTA release.
 *
 * Runs before anything is uploaded and refuses to continue when the release
 * cannot be delivered safely. It never prints secret material: key checks report
 * only whether a value is present and well-formed.
 *
 * Usage:
 *   npx tsx scripts/check-release.ts                 # offline validation
 *   npx tsx scripts/check-release.ts --publish       # also require signing keys
 *   npx tsx scripts/check-release.ts --publish --registry
 *                                                    # also ask Capgo for duplicates
 *
 * Exit 0 prints a `key=value` summary on stdout for $GITHUB_OUTPUT; exit 1
 * prints one `[check-release] problem: …` line per failure on stderr.
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { collectRelease } from './lib/release.ts';
import {
  isValidCapgoPrivateKey,
  isValidCapgoPublicKey,
} from '../src/features/app-update/signingConfig.ts';

const args = new Set(process.argv.slice(2));
const publishing = args.has('--publish');
const checkRegistry = args.has('--registry');
const skipRegistry = args.has('--no-registry');

const problems: string[] = [];
const notes: string[] = [];

const collection = collectRelease(process.cwd());
if (!collection.ok) {
  for (const problem of collection.problems) {
    problems.push(problem);
  }
  fail();
}

const plan = collection.plan;
notes.push(...collection.warnings);

/* ----------------------------- signing policy ---------------------------- */

const requireSignature =
  (process.env.POROKH_OTA_REQUIRE_SIGNATURE ??
    process.env.OTA_REQUIRE_SIGNATURE ??
    (publishing ? 'true' : 'false')) !== 'false';

if (requireSignature) {
  const publicKey = process.env.CAPGO_PUBLIC_KEY;
  if (!publicKey) {
    problems.push(
      'CAPGO_PUBLIC_KEY is not set; bundles would be unpublishable to APKs built with signature enforcement'
    );
  } else if (!isValidCapgoPublicKey(publicKey)) {
    problems.push(
      'CAPGO_PUBLIC_KEY is not a PKCS#1 RSA public key (expected -----BEGIN RSA PUBLIC KEY-----)'
    );
  }
} else if (publishing) {
  problems.push(
    'refusing to publish with POROKH_OTA_REQUIRE_SIGNATURE=false; unsigned bundles are not accepted in production'
  );
}

if (publishing) {
  const keyPath = process.env.CAPGO_PRIVATE_KEY_PATH;
  if (!keyPath) {
    problems.push(
      'CAPGO_PRIVATE_KEY_PATH is not set; the upload would fall back to an unsigned (clear) bundle'
    );
  } else if (!fs.existsSync(keyPath)) {
    problems.push(`signing key file not found at CAPGO_PRIVATE_KEY_PATH`);
  } else {
    const material = fs.readFileSync(keyPath, 'utf8');
    if (!isValidCapgoPrivateKey(material)) {
      problems.push(
        'CAPGO_PRIVATE_KEY_PATH does not contain an RSA private key (PKCS#1/PKCS#8 PEM)'
      );
    } else {
      // Presence and shape only — never the value, never its length in bits.
      notes.push('signing key loaded from CAPGO_PRIVATE_KEY_PATH');
    }
  }

  if (!process.env.CAPGO_TOKEN && !process.env.CAPGO_API_KEY) {
    problems.push(
      'no Capgo credential in the environment (set CAPGO_TOKEN from the CI secret)'
    );
  }
}

if (problems.length > 0) fail();

/* --------------------------- registry duplicate -------------------------- */

if (publishing && checkRegistry && !skipRegistry) {
  const token = process.env.CAPGO_TOKEN;
  if (!token) {
    problems.push('registry check requested but CAPGO_TOKEN is not available');
    fail();
  }

  try {
    const output = execFileSync(
      process.execPath,
      [
        'node_modules/@capgo/cli/dist/index.js',
        'bundle',
        'list',
        'net.porokh.app',
        '--api-host',
        process.env.CAPGO_API_HOST || 'https://api.capgo.app',
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, CAPGO_TOKEN: token },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60_000,
      }
    );

    if (output.includes(plan.version)) {
      problems.push(`version ${plan.version} already exists in Capgo`);
      fail();
    }
    notes.push('registry check: version is not already published');
  } catch (error) {
    // A failed lookup must not be reported as "version is free". Publishing is
    // the only step that can create it, and the service rejects duplicates too.
    const detail =
      error instanceof Error ? error.message.split('\n')[0] : String(error);
    problems.push(`registry check failed: ${detail}`);
    fail();
  }
}

process.stdout.write(
  [
    `version=${plan.version}`,
    `base_version=${plan.baseVersion}`,
    `channel=${plan.channel}`,
    `revision=${plan.revision}`,
    `min_native_version=${plan.minNativeVersion}`,
    `native_version_name=${plan.nativeVersionName}`,
    `schema_version=${plan.schemaVersion}`,
    `signature_required=${requireSignature}`,
  ].join('\n') + '\n'
);

for (const note of notes) {
  console.error(`[check-release] note: ${note}`);
}

function fail(): never {
  for (const problem of problems) {
    console.error(`[check-release] problem: ${problem}`);
  }
  process.exit(1);
}
