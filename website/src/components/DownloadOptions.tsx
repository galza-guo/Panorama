import { Apple, Command, Download, ExternalLink, Github, Monitor } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGithubRelease } from "../hooks/useGithubRelease";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

interface DownloadOptionsProps {
  visible: boolean;
}

interface AssetMatchRule {
  archTokens: string[];
  extensionPattern: RegExp;
}

const DOWNLOAD_PROXY_PATHS = {
  macAppleSiliconDmg: "/api/download/macos-apple-silicon.dmg",
  macIntelDmg: "/api/download/macos-intel.dmg",
  windowsX64Exe: "/api/download/windows-x64-setup.exe",
  windowsX64Msi: "/api/download/windows-x64-installer.msi",
  linuxX64AppImage: "/api/download/linux-x64.appimage",
  linuxX64Deb: "/api/download/linux-x64-deb",
} as const;

export function DownloadOptions({ visible }: DownloadOptionsProps) {
  const { i18n } = useTranslation();
  const { release, loading, error } = useGithubRelease();

  const hasArchToken = (assetName: string, token: string) => {
    const archTokenPattern = new RegExp(`(?:^|[_-])${token}(?=[_.-])`, "i");
    return archTokenPattern.test(assetName);
  };

  // Match release assets by exact format + architecture tokens from the release matrix.
  const findAsset = ({ archTokens, extensionPattern }: AssetMatchRule) => {
    return release?.assets.find((asset) => {
      if (asset.name.endsWith(".sig")) {
        return false;
      }
      if (!extensionPattern.test(asset.name)) {
        return false;
      }
      return archTokens.some((token) => hasArchToken(asset.name, token));
    });
  };

  const macAppleSiliconDmg = findAsset({
    archTokens: ["aarch64", "arm64"],
    extensionPattern: /\.dmg$/i,
  });
  const macIntelDmg = findAsset({
    archTokens: ["x64", "x86_64"],
    extensionPattern: /\.dmg$/i,
  });
  const windowsX64Exe = findAsset({
    archTokens: ["x64", "x86_64"],
    extensionPattern: /\.exe$/i,
  });
  const windowsX64Msi = findAsset({
    archTokens: ["x64", "x86_64"],
    extensionPattern: /\.msi$/i,
  });
  const linuxX64AppImage = findAsset({
    archTokens: ["amd64", "x64", "x86_64"],
    extensionPattern: /\.AppImage$/i,
  });
  const linuxX64Deb = findAsset({
    archTokens: ["amd64", "x64", "x86_64"],
    extensionPattern: /\.deb$/i,
  });

  const toOption = (
    label: string,
    proxyUrl: string,
    fallbackFileName: string,
    asset?: { browser_download_url: string; size: number; name: string },
  ) => {
    return {
      label,
      proxyUrl,
      fallbackFileName,
      url: asset?.browser_download_url,
      size: asset?.size,
      fileName: asset?.name,
    };
  };

  const platforms = [
    {
      id: "macos",
      name: "macOS",
      subtext: "macOS 10.15+",
      icon: <Apple className="h-5 w-5" />,
      options: [
        toOption(
          "Apple Silicon (.dmg)",
          DOWNLOAD_PROXY_PATHS.macAppleSiliconDmg,
          "Panorama-macos-apple-silicon.dmg",
          macAppleSiliconDmg,
        ),
        toOption(
          "Intel (.dmg)",
          DOWNLOAD_PROXY_PATHS.macIntelDmg,
          "Panorama-macos-intel.dmg",
          macIntelDmg,
        ),
      ],
    },
    {
      id: "windows",
      name: "Windows",
      subtext: "Windows 10+ (x64)",
      icon: <Monitor className="h-5 w-5" />,
      options: [
        toOption(
          "Installer (.exe)",
          DOWNLOAD_PROXY_PATHS.windowsX64Exe,
          "Panorama-windows-x64-setup.exe",
          windowsX64Exe,
        ),
        toOption(
          "Installer (.msi)",
          DOWNLOAD_PROXY_PATHS.windowsX64Msi,
          "Panorama-windows-x64-installer.msi",
          windowsX64Msi,
        ),
      ],
    },
    {
      id: "linux",
      name: "Linux",
      subtext: "Linux (x64)",
      icon: <Command className="h-5 w-5" />, // Using Command icon as a placeholder/generic for Linux terminal
      options: [
        toOption(
          "AppImage",
          DOWNLOAD_PROXY_PATHS.linuxX64AppImage,
          "Panorama-linux-x64.AppImage",
          linuxX64AppImage,
        ),
        toOption(
          ".deb",
          DOWNLOAD_PROXY_PATHS.linuxX64Deb,
          "Panorama-linux-x64.deb",
          linuxX64Deb,
        ),
      ],
    },
  ];

  const formatSize = (bytes?: number) => {
    if (!bytes) return "";
    return `~${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  };

  return (
    <div
      className={cn(
        "grid overflow-hidden transition-all duration-300 ease-in-out",
        visible ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="min-h-0">
        <div className="animate-in slide-in-from-top-4 fade-in mx-auto w-full max-w-4xl pt-8 pb-4 duration-500">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {platforms.map((platform) => (
              <div
                key={platform.id}
                className="bg-card/50 text-card-foreground border-border hover:bg-card/80 flex flex-col rounded-xl border shadow-sm backdrop-blur-sm transition-all hover:shadow-md"
              >
                <div className="border-border flex items-center gap-3 border-b p-3">
                  <div className="bg-primary/10 text-primary rounded-lg p-1.5">{platform.icon}</div>
                  <div>
                    <h3 className="text-sm font-semibold">{platform.name}</h3>
                    <p className="text-muted-foreground text-[10px] font-medium">
                      {platform.subtext}
                    </p>
                  </div>
                </div>

                <div className="flex flex-1 flex-col gap-1 p-2">
                  {platform.options.map((option, idx) => {
                    const href = option.proxyUrl;

                    return (
                      <div key={idx} className="relative">
                        <Button
                          variant="ghost"
                          className="hover:bg-muted/50 flex h-auto w-full items-center justify-between px-3 py-2"
                          asChild
                          disabled={!href}
                        >
                          <a
                            href={href || "#"}
                            download={option.fileName || option.fallbackFileName}
                            rel="noopener"
                            className={!href ? "pointer-events-none opacity-50" : ""}
                          >
                            <div className="flex flex-col items-start gap-0.5 text-left">
                              <span className="text-xs font-medium">{option.label}</span>
                              {option.size && (
                                <span className="text-muted-foreground text-[10px]">
                                  {formatSize(option.size)}
                                </span>
                              )}
                            </div>
                            <Download className="text-muted-foreground h-3.5 w-3.5" />
                          </a>
                        </Button>
                      </div>
                    );
                  })}
                  {platform.options.every((o) => !o.url) && !loading && (
                    <div className="text-muted-foreground p-2 text-center text-xs">
                      {i18n.language === "zh" ? "暂无下载" : "No downloads available"}
                    </div>
                  )}
                  {loading && (
                    <div className="text-muted-foreground animate-pulse p-2 text-center text-xs">
                      {i18n.language === "zh" ? "加载中..." : "Loading..."}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-center">
            <a
              href="https://github.com/galza-guo/Panorama/releases/latest"
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-xs transition-colors"
            >
              <Github className="h-3.5 w-3.5" />
              {i18n.language === "zh"
                ? "查看 GitHub 上的所有下载格式"
                : "View all download formats on GitHub"}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          {error && <p className="text-destructive mt-2 text-center text-xs">{error}</p>}
        </div>
      </div>
    </div>
  );
}
