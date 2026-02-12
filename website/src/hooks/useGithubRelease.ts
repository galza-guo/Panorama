import { useEffect, useState } from "react";

export interface GithubReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

export interface GithubRelease {
  tag_name: string;
  html_url: string;
  assets: GithubReleaseAsset[];
}

export function useGithubRelease() {
  const [release, setRelease] = useState<GithubRelease | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRelease = async () => {
      try {
        const response = await fetch(
          "https://api.github.com/repos/galza-guo/Panorama/releases/latest",
        );
        if (!response.ok) {
          throw new Error("Failed to fetch GitHub release");
        }
        const data = await response.json();
        setRelease(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchRelease();
  }, []);

  return { release, loading, error };
}
