import { asFiniteNumber } from "@/lib/panorama-asset-attributes";
import { getTimeDepositDerivedMetrics } from "@/lib/time-deposit-calculations";
import { Asset, LatestQuoteSnapshot } from "@/lib/types";

export interface WeightedBreakdown {
  name: string;
  weight: number;
}

export interface ParsedAsset extends Asset {
  sectorsList: WeightedBreakdown[];
  countriesList: WeightedBreakdown[];
}

export interface TimeDepositDisplayState {
  daysLeft?: number;
  isEstimatedValue: boolean;
}

export type PanoramaAssetCategory = "MPF" | "Time Deposit";
export type DisplayAssetKind = Asset["kind"] | PanoramaAssetCategory;

function getMetadataObject(metadata: Asset["metadata"]): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  return metadata as Record<string, unknown>;
}

function normalizedMetadataText(
  metadata: Record<string, unknown>,
  key: "panorama_category" | "sub_type",
): string {
  const value = metadata[key];
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function getPanoramaAssetCategory(
  asset: Pick<Asset, "kind" | "metadata">,
): PanoramaAssetCategory | undefined {
  if (asset.kind === "MPF") {
    return "MPF";
  }

  if (asset.kind !== "OTHER") {
    return undefined;
  }

  const metadata = getMetadataObject(asset.metadata);
  if (!metadata) {
    return undefined;
  }

  const panoramaCategory = normalizedMetadataText(metadata, "panorama_category");
  const subType = normalizedMetadataText(metadata, "sub_type");
  const hasMpfSubfunds = Array.isArray(metadata.mpf_subfunds) && metadata.mpf_subfunds.length > 0;
  const hasTimeDepositFields =
    typeof metadata.start_date === "string" &&
    typeof metadata.maturity_date === "string" &&
    metadata.principal !== undefined &&
    (metadata.quoted_annual_rate !== undefined || metadata.guaranteed_maturity_value !== undefined);

  if (panoramaCategory === "mpf" || subType === "mpf" || hasMpfSubfunds) {
    return "MPF";
  }

  if (panoramaCategory === "time_deposit" || subType === "time_deposit" || hasTimeDepositFields) {
    return "Time Deposit";
  }

  return undefined;
}

export function getAssetKindForDisplay(asset: Pick<Asset, "kind" | "metadata">): DisplayAssetKind {
  const category = getPanoramaAssetCategory(asset);
  if (category === "MPF" || category === "Time Deposit") {
    return category;
  }

  return asset.kind;
}

export function getPanoramaAssetEditLabel(asset: Pick<Asset, "kind" | "metadata">): string {
  const category = getPanoramaAssetCategory(asset);

  if (category === "MPF") {
    return "Edit MPF";
  }

  if (category === "Time Deposit") {
    return "Edit Time Deposit";
  }

  return "Edit";
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getTodayIsoDate(): string {
  const now = new Date();
  return toIsoDate(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

export function getTimeDepositDisplayState(
  asset: Pick<Asset, "kind" | "metadata">,
  asOfDate = getTodayIsoDate(),
): TimeDepositDisplayState | undefined {
  if (getPanoramaAssetCategory(asset) !== "Time Deposit") {
    return undefined;
  }

  const metadata = getMetadataObject(asset.metadata);
  const principal = asFiniteNumber(metadata?.principal);
  const quotedAnnualRate = asFiniteNumber(metadata?.quoted_annual_rate);
  const guaranteedMaturityValue = asFiniteNumber(metadata?.guaranteed_maturity_value);
  const startDate = typeof metadata?.start_date === "string" ? metadata.start_date : undefined;
  const maturityDate =
    typeof metadata?.maturity_date === "string" ? metadata.maturity_date : undefined;
  const canDeriveDaysLeft =
    principal !== undefined &&
    startDate !== undefined &&
    maturityDate !== undefined &&
    (quotedAnnualRate !== undefined || guaranteedMaturityValue !== undefined);

  return {
    daysLeft: canDeriveDaysLeft
      ? getTimeDepositDerivedMetrics({
          principal,
          startDate,
          maturityDate,
          asOfDate,
          quotedAnnualRatePct: quotedAnnualRate,
          guaranteedMaturityValue,
        }).daysLeft
      : undefined,
    isEstimatedValue: canDeriveDaysLeft && metadata?.valuation_mode !== "manual",
  };
}

export const isStaleQuote = (snapshot?: LatestQuoteSnapshot, asset?: ParsedAsset): boolean => {
  if (!snapshot || asset?.isActive === false) {
    return true;
  }

  return snapshot.isStale;
};

const normalizeWeight = (weight: unknown): number => {
  if (weight === null || weight === undefined) {
    return 0;
  }
  if (typeof weight === "number") {
    return Number.isNaN(weight) ? 0 : weight;
  }
  if (typeof weight !== "string") {
    return 0;
  }
  const parsed = parseFloat(weight.replace("%", ""));
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return parsed;
};

const parseJsonBreakdown = (value?: string | null): WeightedBreakdown[] => {
  // Handle null, undefined, empty string, or non-string values
  if (!value || typeof value !== "string" || value.trim() === "" || value === "null") {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    // Ensure parsed is an array
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => ({ name: item.name?.trim() ?? "", weight: normalizeWeight(item.weight) }))
      .filter((item) => item.name);
  } catch {
    // Silently return empty array for invalid JSON
    return [];
  }
};

export const formatBreakdownTags = (items: WeightedBreakdown[]): string[] =>
  items.map(
    (item) => `${item.name}:${item.weight <= 1 ? (item.weight * 100).toFixed(0) : item.weight}%`,
  );

export const tagsToBreakdown = (values: string[]): WeightedBreakdown[] =>
  values
    .map((value) => {
      const [rawName, rawWeight] = value.split(":");
      const name = rawName?.trim();
      if (!name) return null;
      const cleanedWeight = rawWeight?.replace("%", "").trim();
      const weight = cleanedWeight ? parseFloat(cleanedWeight) : 0;
      return {
        name,
        weight: Number.isFinite(weight) ? weight : 0,
      };
    })
    .filter(Boolean) as WeightedBreakdown[];

export const toParsedAsset = (asset: Asset): ParsedAsset => {
  // Legacy data is in metadata.legacy (for migration purposes)
  // New data should come from taxonomies
  const legacy = asset.metadata?.legacy as
    | {
        sectors?: string | null;
        countries?: string | null;
      }
    | undefined;

  return {
    ...asset,
    sectorsList: parseJsonBreakdown(legacy?.sectors ?? null),
    countriesList: parseJsonBreakdown(legacy?.countries ?? null),
  };
};
