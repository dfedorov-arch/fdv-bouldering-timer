"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"..");
test("macOS preview publication is explicit, develop-only and gated by successful release artifacts",()=>{
  const workflow=fs.readFileSync(path.join(root,".github/workflows/release.yml"),"utf8");
  const preview=workflow.slice(workflow.indexOf("  macos-preview:"));
  assert.match(workflow,/publish_macos_preview:[\s\S]*?default: false/);
  assert.match(preview,/github.event_name == 'workflow_dispatch'.*inputs.publish_macos_preview.*github.ref == 'refs\/heads\/develop'/);
  assert.match(preview,/needs: release/);assert.match(preview,/release-packages-\$\{\{ github.run_id \}\}/);
  assert.match(preview,/--draft --prerelease --latest=false/);assert.match(preview,/asset.digest!==digest/);
  assert.ok(preview.indexOf("asset.digest!==digest")<preview.indexOf('gh release edit "$tag" --draft=false'));
  assert.match(preview,/releases\/latest.*latest_before/s);
});
test("macOS preview repackager preserves source and installed/portable separation",()=>{
  const source=fs.readFileSync(path.join(root,"scripts/build-macos-preview.sh"),"utf8");
  assert.match(source,/cmp "\$ROOT\/\$file" "\$payload\/\$file"/);
  assert.match(source,/codesign --verify --deep --strict/);
  assert.match(source,/fdv-installed.marker/);assert.match(source,/count\(\/pkg-info\/relocate\/bundle\)/);
  assert.match(source,/shasum -a 256 -c SHA256SUMS.txt/);
  assert.doesNotMatch(source,/installer -pkg|git push|gh release|\/Applications\/FDV Bouldering Timer\/runtime-state/);
});
