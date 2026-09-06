'use strict';

const assert = require('assert');
const nip82 = require('../gittr-nip82-software');

const SHA_APK = 'a'.repeat(64);
const SHA_MSI = 'b'.repeat(64);
const SHA_ZIP = 'c'.repeat(64);
const SHA_TGZ = 'e'.repeat(64);

function asset(name, downloadUrl, sha256, size = 10) {
  return {
    name,
    size,
    contentType: 'application/octet-stream',
    downloadUrl,
    ...(sha256 ? { sha256 } : {}),
  };
}

function sampleForge(opts = {}) {
  const includeMsi = opts.includeMsi !== false;
  const includeApk = opts.apk !== false;
  const assets = [];
  if (includeApk) {
    assets.push(asset('app-release.apk', 'https://example.com/app-release.apk', SHA_APK));
  }
  if (opts.includeSecondApk) {
    assets.push(
      asset('app-debug.apk', 'https://example.com/app-debug.apk', 'd'.repeat(64), 11)
    );
  }
  if (includeMsi) {
    assets.push(
      asset(
        'App.msi',
        'https://example.com/App.msi',
        opts.msiHashed === false ? undefined : SHA_MSI,
        20
      )
    );
  }
  if (opts.includeZip) {
    assets.push(asset('source.zip', 'https://example.com/source.zip', SHA_ZIP, 30));
  }
  if (opts.includeTarball) {
    assets.push(
      asset(
        'ngit-grasp-3.0.1-x86_64-unknown-linux-musl.tar.gz',
        'https://example.com/ngit-grasp.tar.gz',
        SHA_TGZ,
        40
      )
    );
  }
  return {
    ok: true,
    forge: 'github',
    owner: 'acme',
    repo: 'demo',
    repositoryUrl: 'https://github.com/acme/demo',
    release: {
      tag: 'v1.2.3',
      name: '1.2.3',
      body: 'notes',
      draft: false,
      prerelease: false,
      assets,
      apkAssets: assets.filter((a) => a.name.endsWith('.apk')),
    },
  };
}

function mimeOf(ev) {
  return ev.tags.find((t) => t[0] === 'm')?.[1];
}

{
  const forge = sampleForge({ includeZip: true, includeSecondApk: true });
  const apk = forge.release.apkAssets[0];
  const siblings = nip82.pickSiblingNip82Assets(forge, apk);
  assert.deepStrictEqual(
    siblings.map((s) => s.name),
    ['App.msi'],
    'siblings include hashed MSI and skip zip + other APKs'
  );
  console.log('✓ pickSiblingNip82Assets skips zip + extra APKs');
}

{
  const forge = sampleForge({ msiHashed: false });
  const apk = forge.release.apkAssets[0];
  assert.deepStrictEqual(
    nip82.pickSiblingNip82Assets(forge, apk),
    [],
    'omits siblings without sha256'
  );
  console.log('✓ pickSiblingNip82Assets omits unhashed siblings');
}

{
  const forge = sampleForge({ includeTarball: true });
  assert.strictEqual(
    nip82.pickAnnouncePrimaryAsset(forge).name,
    'app-release.apk',
    'prefers APK when APK and tarball both exist'
  );
  console.log('✓ pickAnnouncePrimaryAsset prefers APK');
}

{
  const forge = sampleForge({ apk: false, includeMsi: false, includeTarball: true });
  assert.ok(
    nip82.pickAnnouncePrimaryAsset(forge).name.includes('linux-musl.tar.gz'),
    'picks linux tarball when there is no APK'
  );
  console.log('✓ pickAnnouncePrimaryAsset falls back to tarball');
}

{
  const forge = sampleForge({ includeTarball: true });
  const tgz = forge.release.assets.find((a) => a.name.endsWith('.tar.gz'));
  assert.strictEqual(
    nip82.pickAnnouncePrimaryAsset(forge, tgz.downloadUrl).name,
    tgz.name,
    'honors selectedAssetUrl'
  );
  console.log('✓ pickAnnouncePrimaryAsset honors selectedAssetUrl');
}

{
  const built = nip82.buildSoftwareAnnounceEvents({
    forge: sampleForge({ includeZip: true }),
    appId: 'space.gittr.demo',
    appName: 'Demo',
  });
  assert.strictEqual(built.version, '1.2.3');
  assert.strictEqual(built.primary.name, 'app-release.apk');
  assert.strictEqual(built.apk, built.primary);
  assert.strictEqual(built.asset.kind, nip82.KIND_SOFTWARE_ASSET);
  assert.strictEqual(mimeOf(built.asset), 'application/vnd.android.package-archive');
  assert.strictEqual(built.extraAssets.length, 1);
  assert.strictEqual(mimeOf(built.extraAssets[0]), 'application/vnd.microsoft.portable-executable');
  assert.deepStrictEqual(built.extraAssetFiles.map((f) => f.name), ['App.msi']);
  const appTs = built.app.tags.filter((t) => t[0] === 't').map((t) => t[1]);
  assert.ok(appTs.includes('android'));
  const appFs = built.app.tags.filter((t) => t[0] === 'f').map((t) => t[1]);
  assert.ok(appFs.includes('android-arm64-v8a'));
  assert.ok(appFs.includes('windows-amd64'));
  console.log('✓ buildSoftwareAnnounceEvents primary APK + extra MSI');
}

{
  const built = nip82.buildSoftwareAnnounceEvents({
    forge: sampleForge(),
    appId: 'space.gittr.demo',
    appName: 'Demo',
    includeSiblingAssets: false,
  });
  assert.strictEqual(built.extraAssets.length, 0);
  console.log('✓ includeSiblingAssets:false skips extras');
}

{
  const built = nip82.buildSoftwareAnnounceEvents({
    forge: sampleForge({ apk: false, includeMsi: false, includeTarball: true }),
    appId: 'space.gittr.ngit',
    appName: 'ngit-grasp',
  });
  assert.ok(built.primary.name.includes('linux-musl.tar.gz'));
  assert.strictEqual(mimeOf(built.asset), 'application/gzip');
  assert.strictEqual(built.asset.tags.find((t) => t[0] === 'f')?.[1], 'linux-amd64');
  const appTs = built.app.tags.filter((t) => t[0] === 't').map((t) => t[1]);
  assert.ok(!appTs.includes('android'));
  console.log('✓ linux tarball announce has no android tags');
}

{
  const forge = sampleForge({ apk: false, includeMsi: false, includeTarball: true });
  const tgz = forge.release.assets.find((a) => a.name.endsWith('.tar.gz'));
  const blossom = `https://blossom.primal.net/${SHA_TGZ}`;
  const built = nip82.buildSoftwareAnnounceEvents({
    forge,
    appId: 'space.gittr.ngit',
    appName: 'ngit-grasp',
    assetUrlOverrides: { [tgz.downloadUrl]: blossom },
  });
  assert.strictEqual(built.asset.tags.find((t) => t[0] === 'url')?.[1], blossom);
  console.log('✓ public Blossom override on kind 3063 url');
}

{
  const forge = sampleForge({ apk: false, includeMsi: false, includeTarball: true });
  const tgz = forge.release.assets.find((a) => a.name.endsWith('.tar.gz'));
  const built = nip82.buildSoftwareAnnounceEvents({
    forge,
    appId: 'space.gittr.ngit',
    appName: 'ngit-grasp',
    assetUrlOverrides: {
      [tgz.downloadUrl]: `https://blossom.gittr.space/${SHA_TGZ}`,
    },
  });
  assert.strictEqual(
    built.asset.tags.find((t) => t[0] === 'url')?.[1],
    tgz.downloadUrl,
    'ignores gittr Pages Blossom for Apps'
  );
  console.log('✓ ignores blossom.gittr.space override');
}

assert.strictEqual(nip82.nip82MimeForAssetName('app.apk').mime, nip82.MIME_ANDROID_APK);
assert.strictEqual(nip82.nip82MimeForAssetName('App.dmg').f, 'darwin-amd64');
assert.strictEqual(nip82.nip82MimeForAssetName('setup.exe').f, 'windows-amd64');
assert.strictEqual(nip82.nip82MimeForAssetName('source.zip'), null);
console.log('✓ nip82MimeForAssetName MIME set');

assert.strictEqual(
  nip82.allowedNip82BlossomAssetUrl(`https://blossom.primal.net/${SHA_TGZ}`),
  `https://blossom.primal.net/${SHA_TGZ}`
);
assert.strictEqual(
  nip82.allowedNip82BlossomAssetUrl(`https://blossom.gittr.space/${SHA_TGZ}`),
  null
);
console.log('✓ allowedNip82BlossomAssetUrl allowlist');

console.log('\n✓ nip82-software tests passed');
