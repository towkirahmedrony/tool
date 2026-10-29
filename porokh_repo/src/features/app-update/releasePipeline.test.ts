import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { OFFLINE_SCHEMA_VERSION } from '../exam/offline/schemaVersion.ts';

/**
 * Static assertions about the release pipeline.
 *
 * These are not a substitute for running it, but they lock in the properties the
 * audit found missing: a signed upload, a credential that is not on the command
 * line, a fail-closed path when the key material is absent, and no manual
 * version override that would re-break native compatibility.
 */
const root = process.cwd();
const read = (file: string): string =>
  fs.readFileSync(path.join(root, file), 'utf8');

/** Strip comments so documentation about a flag is not mistaken for its use. */
const instructions = (body: string): string =>
  body
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');

const otaRelease = instructions(read('.github/workflows/ota-release.yml'));
const android = instructions(read('.github/workflows/android.yml'));
const capacitorConfig = read('capacitor.config.ts');
const otaConfig = JSON.parse(read('ota.config.json')) as {
  minNativeVersion?: string;
  schemaVersion?: number;
};

/**
 * The Android application id is the Capgo app id, the deep-link scheme and the
 * Gradle namespace. It is read from capacitor.config.ts so a rename cannot leave
 * one of those copies behind.
 */
const appId = /appId:\s*'([^']+)'/.exec(capacitorConfig)?.[1] ?? '';
const escape = (value: string): string => value.replace(/\./g, '\\.');

test('the upload signs the bundle with a key-v2 private key', () => {
  assert.match(otaRelease, /--key-v2 "\$CAPGO_PRIVATE_KEY_PATH"/);
  assert.doesNotMatch(
    otaRelease,
    /--no-key/,
    'a clear (unsigned) upload must never be configured'
  );
});

test('the private key is provisioned from a secret and removed afterwards', () => {
  assert.match(otaRelease, /secrets\.CAPGO_PRIVATE_KEY/);
  assert.match(otaRelease, /chmod 600/);
  assert.match(otaRelease, /if: always\(\)/);
  assert.match(otaRelease, /rm -f "\$RUNNER_TEMP\/capgo_key_v2"/);
  // The key must never be echoed or written into an artifact.
  assert.doesNotMatch(otaRelease, /echo\s+"?\$CAPGO_PRIVATE_KEY/);
  assert.doesNotMatch(otaRelease, /printf '%s\\n' "\$CAPGO_PRIVATE_KEY"/);
});

test('the API credential travels through the environment, not argv', () => {
  assert.match(otaRelease, /CAPGO_TOKEN: \$\{\{ secrets\.CAPGO_API_KEY \}\}/);
  assert.doesNotMatch(
    otaRelease,
    /--apikey/,
    'an --apikey value is visible in the process list'
  );
});

test('publishing fails closed when signing material is missing', () => {
  assert.match(otaRelease, /CAPGO_PRIVATE_KEY is not configured/);
  assert.match(otaRelease, /Refusing to publish an unsigned/);
  assert.match(otaRelease, /CAPGO_PUBLIC_KEY is not configured/);
});

test('the release is validated and then verified after publication', () => {
  assert.match(otaRelease, /scripts\/check-release\.ts/);
  assert.match(otaRelease, /--publish --registry/);
  assert.match(otaRelease, /Verify the published bundle is retrievable/);
  assert.match(otaRelease, new RegExp(`bundle list ${escape(appId)}`));
});

test('the Android package matches the Capacitor app id everywhere', () => {
  assert.match(appId, /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, 'appId must be a valid application id');

  const gradle = read('android/app/build.gradle');
  assert.match(gradle, new RegExp(`applicationId "${escape(appId)}"`));
  assert.match(gradle, new RegExp(`namespace = "${escape(appId)}"`));
  assert.match(
    read('android/app/src/main/res/values/strings.xml'),
    new RegExp(`name="package_name">${escape(appId)}<`)
  );
  assert.match(
    read('android/app/src/main/res/values/strings.xml'),
    new RegExp(`name="custom_url_scheme">${escape(appId)}<`)
  );
  assert.match(
    read('scripts/check-release.ts'),
    new RegExp(`'${escape(appId)}'`),
    'the registry check must query the same Capgo app'
  );
  assert.ok(
    fs.existsSync(
      path.join(root, 'android/app/src/main/java', ...appId.split('.'), 'MainActivity.java')
    ),
    `MainActivity must live in ${appId.split('.').join('/')}`
  );
});

test('publishing is opt-in and a validation-only run is possible', () => {
  assert.match(otaRelease, /workflow_dispatch:/);
  const publishInput = /publish:\s*\n(?:.*\n)*?\s+default: false/.test(otaRelease);
  assert.equal(publishInput, true, 'dispatch must default to a dry run');
});

test('no manual version override can re-break native compatibility', () => {
  assert.doesNotMatch(otaRelease, /base_version/);
  assert.doesNotMatch(otaRelease, /min_native_version:/);
  assert.match(otaRelease, /scripts\/check-release\.ts/);
});

test('the Android build embeds the public key and enforces signatures', () => {
  assert.match(android, /CAPGO_PUBLIC_KEY: \$\{\{ vars\.CAPGO_PUBLIC_KEY \}\}/);
  assert.match(android, /POROKH_OTA_REQUIRE_SIGNATURE: 'true'/);
  assert.match(android, /VITE_OTA_REQUIRE_SIGNATURE: 'true'/);
  assert.match(android, /capgo\.config|CAPGO_PUBLIC_KEY is not configured/);
  assert.match(android, /capacitor\.config\.json/);
  assert.match(android, /packaged config has no publicKey/);
});

test('the native config keeps a rollback bundle and cannot auto-activate', () => {
  assert.match(capacitorConfig, /autoDeletePrevious: false/);
  assert.match(capacitorConfig, /autoUpdate: 'off'/);
  assert.match(capacitorConfig, /publicKey/);
  assert.match(capacitorConfig, /POROKH_OTA_REQUIRE_SIGNATURE/);
});

test('the compatibility policy is committed and consistent', () => {
  assert.match(
    String(otaConfig.minNativeVersion),
    /^\d+\.\d+\.\d+$/,
    'minNativeVersion must be a plain version'
  );
  assert.equal(
    otaConfig.schemaVersion,
    OFFLINE_SCHEMA_VERSION,
    'ota.config.json must mirror the compiled schema constant'
  );
});

test('no workflow file contains a real credential', () => {
  for (const file of ['.github/workflows/ota-release.yml', '.github/workflows/android.yml', '.github/workflows/ci.yml']) {
    const body = read(file);
    assert.doesNotMatch(body, /ghp_[A-Za-z0-9]{20,}/, `${file} contains a GitHub token`);
    assert.doesNotMatch(
      body,
      /-----BEGIN (RSA )?PRIVATE KEY-----/,
      `${file} contains a private key`
    );
  }
});

test('the workflow files parse as YAML', () => {
  // A hand-written check: every file starts with a name and has no tabs in
  // indentation, which is the failure mode that silently voids a workflow.
  for (const file of ['.github/workflows/ota-release.yml', '.github/workflows/android.yml']) {
    const body = read(file);
    assert.match(body, /^name: /, `${file} must start with a name`);
    for (const [index, line] of body.split('\n').entries()) {
      if (line.startsWith('\t')) {
        assert.fail(`${file}:${index + 1} uses a tab for indentation`);
      }
    }
    assert.match(body, /on:\n/, `${file} must declare triggers`);
    assert.match(body, /jobs:\n/, `${file} must declare jobs`);
  }
});
