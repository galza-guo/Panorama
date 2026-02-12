import { Readable } from "node:stream";

const GITHUB_REPO = "galza-guo/Panorama";
const GITHUB_RELEASE_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const USER_AGENT = "Panorama-Website-Download-Proxy";

const PRESETS = {
  "macos-apple-silicon-dmg": {
    archTokens: ["aarch64", "arm64"],
    extensionPattern: /\.dmg$/i,
  },
  "macos-apple-silicon.dmg": {
    archTokens: ["aarch64", "arm64"],
    extensionPattern: /\.dmg$/i,
  },
  "macos-intel-dmg": {
    archTokens: ["x64", "x86_64"],
    extensionPattern: /\.dmg$/i,
  },
  "macos-intel.dmg": {
    archTokens: ["x64", "x86_64"],
    extensionPattern: /\.dmg$/i,
  },
  "windows-x64-exe": {
    archTokens: ["x64", "x86_64"],
    extensionPattern: /\.exe$/i,
  },
  "windows-x64-setup.exe": {
    archTokens: ["x64", "x86_64"],
    extensionPattern: /\.exe$/i,
  },
  "windows-x64-msi": {
    archTokens: ["x64", "x86_64"],
    extensionPattern: /\.msi$/i,
  },
  "windows-x64-installer.msi": {
    archTokens: ["x64", "x86_64"],
    extensionPattern: /\.msi$/i,
  },
  "linux-x64-appimage": {
    archTokens: ["amd64", "x64", "x86_64"],
    extensionPattern: /\.AppImage$/i,
  },
  "linux-x64.appimage": {
    archTokens: ["amd64", "x64", "x86_64"],
    extensionPattern: /\.AppImage$/i,
  },
  "linux-x64-deb": {
    archTokens: ["amd64", "x64", "x86_64"],
    extensionPattern: /\.deb$/i,
  },
};

function hasArchToken(assetName, token) {
  const archTokenPattern = new RegExp(`(?:^|[_-])${token}(?=[_.-])`, "i");
  return archTokenPattern.test(assetName);
}

function findAsset(assets, preset) {
  return assets.find((asset) => {
    if (asset.name.endsWith(".sig")) {
      return false;
    }
    if (!preset.extensionPattern.test(asset.name)) {
      return false;
    }
    return preset.archTokens.some((token) => hasArchToken(asset.name, token));
  });
}

function sanitizeFileName(fileName) {
  return String(fileName || "download.bin").replace(/[\r\n"]/g, "");
}

function getSingleQueryParam(value) {
  if (Array.isArray(value)) {
    return value[0];
  }
  if (typeof value === "string") {
    return value;
  }
  return "";
}

function githubHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return headers;
}

function setProxyHeaders(res, upstreamResponse, fileName) {
  const contentType = upstreamResponse.headers.get("content-type") || "application/octet-stream";
  const contentLength = upstreamResponse.headers.get("content-length");
  const contentRange = upstreamResponse.headers.get("content-range");
  const acceptRanges = upstreamResponse.headers.get("accept-ranges");
  const etag = upstreamResponse.headers.get("etag");
  const lastModified = upstreamResponse.headers.get("last-modified");

  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename=\"${sanitizeFileName(fileName)}\"`);
  res.setHeader("Cache-Control", "public, max-age=300");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (contentLength) {
    res.setHeader("Content-Length", contentLength);
  }
  if (contentRange) {
    res.setHeader("Content-Range", contentRange);
  }
  if (acceptRanges) {
    res.setHeader("Accept-Ranges", acceptRanges);
  }
  if (etag) {
    res.setHeader("ETag", etag);
  }
  if (lastModified) {
    res.setHeader("Last-Modified", lastModified);
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const key = getSingleQueryParam(req.query?.key);
  const preset = PRESETS[key];
  if (!preset) {
    res.status(404).json({ error: "Unknown download target" });
    return;
  }

  try {
    const releaseResponse = await fetch(GITHUB_RELEASE_API, { headers: githubHeaders() });
    if (!releaseResponse.ok) {
      res.status(502).json({
        error: "Failed to load release metadata from GitHub",
        status: releaseResponse.status,
      });
      return;
    }

    const release = await releaseResponse.json();
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const asset = findAsset(assets, preset);

    if (!asset?.browser_download_url || !asset?.name) {
      res.status(404).json({ error: "Requested artifact is not available in latest release" });
      return;
    }

    const upstreamHeaders = { "User-Agent": USER_AGENT };
    if (typeof req.headers.range === "string" && req.headers.range.length > 0) {
      upstreamHeaders.Range = req.headers.range;
    }

    const upstreamResponse = await fetch(asset.browser_download_url, {
      headers: upstreamHeaders,
      redirect: "follow",
    });

    if (!upstreamResponse.ok && upstreamResponse.status !== 206) {
      res.status(502).json({
        error: "Failed to stream release artifact from GitHub",
        status: upstreamResponse.status,
      });
      return;
    }

    res.statusCode = upstreamResponse.status;
    setProxyHeaders(res, upstreamResponse, asset.name);

    if (!upstreamResponse.body) {
      res.end();
      return;
    }

    Readable.fromWeb(upstreamResponse.body).pipe(res);
  } catch (error) {
    res.status(500).json({
      error: "Download proxy failed",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
