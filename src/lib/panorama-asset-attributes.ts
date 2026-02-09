import { Asset } from "@/lib/types";

export interface PanoramaAssetAttributes {
  owner?: string;
  policy_type?: string;
  guaranteed_value?: number;
  trustee?: string;
  fund_allocation?: Record<string, number>;
  [key: string]: unknown;
}

function normalizeText(value?: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function parsePanoramaAssetAttributes(attributes?: string | null): PanoramaAssetAttributes {
  if (!attributes) {
    return {};
  }

  try {
    const parsed = JSON.parse(attributes);
    const object = asObject(parsed);
    if (!object) {
      return {};
    }
    return object as PanoramaAssetAttributes;
  } catch {
    return {};
  }
}

export function isInsuranceAsset(asset: Asset): boolean {
  const attrs = parsePanoramaAssetAttributes(asset.attributes);
  const classText = normalizeText(asset.assetClass);
  const subClassText = normalizeText(asset.assetSubClass);
  const typeText = normalizeText(asset.assetType);

  if (classText.includes("insurance") || subClassText.includes("insurance")) {
    return true;
  }

  if (typeText.includes("insurance")) {
    return true;
  }

  return Boolean(attrs.policy_type || attrs.guaranteed_value !== undefined);
}

export function isMpfAsset(asset: Asset): boolean {
  const attrs = parsePanoramaAssetAttributes(asset.attributes);
  const classText = normalizeText(asset.assetClass);
  const subClassText = normalizeText(asset.assetSubClass);
  const typeText = normalizeText(asset.assetType);

  if (classText.includes("mpf") || subClassText.includes("mpf")) {
    return true;
  }

  if (typeText.includes("mpf")) {
    return true;
  }

  return Boolean(attrs.trustee || attrs.fund_allocation);
}

export function getAssetOwner(asset: Asset): string | undefined {
  const attrs = parsePanoramaAssetAttributes(asset.attributes);
  const owner = attrs.owner?.trim();
  return owner ? owner : undefined;
}
