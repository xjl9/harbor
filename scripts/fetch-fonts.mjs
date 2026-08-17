import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE =
  process.env.HARBOR_FONTS_BASE ??
  "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/SubsetOTF/JP";

const OFL =
  process.env.HARBOR_OFL_BASE ??
  "https://raw.githubusercontent.com/google/fonts/2796410152d4f9524b68ed46e69c1b60f8e0f7c3/ofl";

const FONTS = [
  {
    file: "NotoSansJP-Regular.otf",
    url: `${BASE}/NotoSansJP-Regular.otf`,
    sha256: "dff723ba59d57d136764a04b9b2d03205544f7cd785a711442d6d2d085ac5073",
  },
  {
    file: "NotoSansJP-Bold.otf",
    url: `${BASE}/NotoSansJP-Bold.otf`,
    sha256: "1b0edfb500b73a4fa8a4fcaae1bbbd403994e08e73e3e0da37e70d3853f42c5f",
  },
  {
    file: "Inter-Variable.ttf",
    url: `${OFL}/inter/Inter%5Bopsz,wght%5D.ttf`,
    sha256: "29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031",
  },
  {
    file: "Fredoka-Variable.ttf",
    url: `${OFL}/fredoka/Fredoka%5Bwdth,wght%5D.ttf`,
    sha256: "2ba02e68b152868aef9ba28e24b3648c7d457fe6f25c761f2c2c53fb61a73fc8",
  },
  {
    file: "Vazirmatn-Variable.ttf",
    url: `${OFL}/vazirmatn/Vazirmatn%5Bwght%5D.ttf`,
    sha256: "696249a2c74b39ffdef55de4df2809c5b639d3ff80d618d8160a095d2fd49dca",
  },
];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dest = join(root, "src-tauri", "fonts");
const digest = (buf) => createHash("sha256").update(buf).digest("hex");

mkdirSync(dest, { recursive: true });
for (const f of FONTS) {
  const out = join(dest, f.file);
  if (existsSync(out) && digest(readFileSync(out)) === f.sha256) {
    console.log(`[fonts] ${f.file} already present and verified`);
    continue;
  }
  console.log(`[fonts] fetching ${f.url}`);
  // One unlucky response used to fail the whole build before a line was
  // compiled. A 429 from the font host took out an iOS CI run, and rate limits
  // and blips are exactly the failures that pass on their own a moment later,
  // so transient statuses and network errors get a few tries with a widening
  // gap. A 404 or a checksum mismatch is not transient and still stops here.
  const TRANSIENT = new Set([408, 425, 429, 500, 502, 503, 504]);
  let res = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      res = await fetch(f.url, { redirect: "follow" });
      if (res.ok || !TRANSIENT.has(res.status)) break;
      console.warn(`[fonts] ${res.status} on ${f.file}, attempt ${attempt} of 4`);
    } catch (err) {
      console.warn(`[fonts] network error on ${f.file} (${err.message}), attempt ${attempt} of 4`);
      res = null;
    }
    if (attempt < 4) await new Promise((r) => setTimeout(r, attempt * 3000));
  }
  if (!res || !res.ok) {
    const why = res ? `${res.status} ${res.statusText}` : "network error";
    console.error(`[fonts] download failed (${why}) for ${f.file} after 4 attempts`);
    console.error("[fonts] set HARBOR_FONTS_BASE to a mirror, or drop the .otf into src-tauri/fonts/ by hand");
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const got = digest(buf);
  if (got !== f.sha256) {
    console.error(`[fonts] checksum mismatch for ${f.file} (expected ${f.sha256}, got ${got})`);
    process.exit(1);
  }
  writeFileSync(out, buf);
  console.log(`[fonts] wrote ${out} (${(buf.length / 1048576).toFixed(1)} MB)`);
}
