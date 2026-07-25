"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const outputPath = path.resolve(process.argv[2] || path.join(root, "dist", "fdv-bouldering-timer-standalone.html"));

function read(relativePath, encoding = "utf8") {
  return fs.readFileSync(path.join(root, relativePath), encoding);
}

function scriptTag(contents) {
  return `<script>\n${contents.replace(/<\/script/gi, "<\\/script")}\n</script>`;
}

function dataUri(mime, contents) {
  return `data:${mime},${encodeURIComponent(contents)}`;
}

function mimeType(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".woff2") return "font/woff2";
  if (extension === ".woff") return "font/woff";
  if (extension === ".otf") return "font/otf";
  return "font/ttf";
}

function embedTimerFont(offlineAudio) {
  const match = offlineAudio.match(/window\.FDV_OFFLINE_BUNDLE = (.*);\s*$/s);
  if (!match) throw new Error("Could not parse lib/offline-audio.js");
  const bundle = JSON.parse(match[1]);
  const fontFile = String(bundle.config?.timerFontFile || "").trim();
  if (!fontFile) return offlineAudio;
  if (/[\\/\0]/.test(fontFile)) throw new Error(`Unexpected font file name: ${fontFile}`);
  const fontPath = path.join(root, "fonts", fontFile);
  if (!fs.existsSync(fontPath)) return offlineAudio;
  const fontData = fs.readFileSync(fontPath).toString("base64");
  bundle.config.timerFontUrl = `data:${mimeType(fontFile)};base64,${fontData}`;
  return `/* Generated automatically from params.txt, beeps, and fonts. */\nwindow.FDV_OFFLINE_BUNDLE = ${JSON.stringify(bundle)};\n`;
}

function build() {
  let html = read("index.html");
  const offlineAudio = embedTimerFont(read("lib/offline-audio.js"));
  const clientActionTransport = read("lib/client-action-transport.js");
  const manifest = JSON.parse(read("manifest.webmanifest"));
  const appIcon = read("app-icon.svg");
  manifest.icons = [{
    src: dataUri("image/svg+xml", appIcon),
    sizes: "any",
    type: "image/svg+xml",
    purpose: "any maskable"
  }];

  const manifestJson = JSON.stringify(manifest);
  const manifestBootstrap = `(() => {
    const manifest = ${manifestJson};
    manifest.start_url = window.location.href;
    manifest.scope = new URL(".", window.location.href).href;
    document.getElementById("fdvAppManifest").href =
      "data:application/manifest+json," + encodeURIComponent(JSON.stringify(manifest));
  })();`;

  html = html.replace(
    '<link rel="manifest" href="manifest.webmanifest">',
    `<link id="fdvAppManifest" rel="manifest" href="${dataUri("application/manifest+json", manifestJson)}">\n  ${scriptTag(manifestBootstrap)}`
  );
  html = html.replace(
    /\s*<script>\s*if \(window\.location\.protocol === "file:"\) \{\s*document\.write\('<script src="lib\/offline-audio\.js"><\\\/script>'\);\s*\}\s*<\/script>/,
    `\n  ${scriptTag(`window.FDV_SINGLE_FILE_STANDALONE = true;\n${offlineAudio}`)}`
  );
  html = html.replace(
    /\s*<script src="lib\/client-action-transport\.js"><\/script>/,
    `\n  ${scriptTag(clientActionTransport)}`
  );

  if (html.includes('src="lib/') || html.includes("src='lib/")) {
    throw new Error("Standalone HTML still contains a lib/ script reference");
  }
  if (!html.includes("window.FDV_OFFLINE_BUNDLE")) {
    throw new Error("Standalone HTML does not contain the offline bundle");
  }
  if (!html.includes("window.FDVClientActionTransport")) {
    throw new Error("Standalone HTML does not contain the client action transport");
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html, "utf8");
  console.log(`Standalone HTML created: ${outputPath}`);
}

build();
