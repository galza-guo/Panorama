import { useQuery } from "@tanstack/react-query";

import { getAssets } from "@/adapters";
import { isAlternativeAssetKind } from "@/lib/constants";
import { QueryKeys } from "@/lib/query-keys";
import { Asset } from "@/lib/types";
import { getPanoramaAssetCategory } from "../asset-utils";

export function useAssets() {
  const {
    data: assets = [],
    isLoading,
    isError,
    error,
  } = useQuery<Asset[], Error>({
    queryKey: [QueryKeys.ASSETS],
    queryFn: getAssets,
  });

  const filteredAssets = assets.filter((asset) => {
    // Filter out FX kinds
    if (asset.kind === "FX") {
      return false;
    }

    // Filter out alternative assets (property, vehicle, collectible, etc.)
    if (isAlternativeAssetKind(asset.kind)) {
      // Keep Panorama MPF assets visible in the main Assets list.
      if (
        asset.kind === "MPF" ||
        (asset.kind === "OTHER" && getPanoramaAssetCategory(asset) === "MPF")
      ) {
        return true;
      }

      return false;
    }

    return true;
  });

  return { assets: filteredAssets, isLoading, isError, error };
}
