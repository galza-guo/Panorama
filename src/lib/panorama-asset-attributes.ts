import { Asset } from "@/lib/types";

export interface PanoramaMpfSubfund {
  name: string;
  code?: string;
  units?: number;
  nav?: number;
  market_value?: number;
  allocation_pct?: number;
}

export interface PanoramaAssetAttributes {
  owner?: string;
  policy_type?: string;
  valuation_date?: string;
  expected_withdrawal_date?: string;
  total_paid_to_date?: number;
  withdrawable_value?: number;
  estimated_value?: number;
  market_value?: number;
  guaranteed_value?: number;
  insurance_provider?: string;
  trustee?: string;
  mpf_scheme?: string;
  mpf_subfunds?: PanoramaMpfSubfund[];
  fund_allocation?: Record<string, number>;
  [key: string]: unknown;
}

function normalizeText(value?: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}

function isInsuranceClassification(classText: string, subClassText: string, typeText: string): boolean {
  return (
    classText.includes("insurance") ||
    subClassText.includes("insurance") ||
    typeText.includes("insurance")
  );
}

function isMpfClassification(classText: string, subClassText: string, typeText: string): boolean {
  return classText.includes("mpf") || subClassText.includes("mpf") || typeText.includes("mpf");
}

function hasInsuranceSpecificAttributes(attrs: PanoramaAssetAttributes): boolean {
  return (
    attrs.policy_type !== undefined ||
    attrs.insurance_provider !== undefined ||
    attrs.guaranteed_value !== undefined ||
    attrs.estimated_value !== undefined ||
    attrs.expected_withdrawal_date !== undefined
  );
}

function hasMpfSpecificAttributes(attrs: PanoramaAssetAttributes): boolean {
  return (
    attrs.mpf_scheme !== undefined ||
    attrs.trustee !== undefined ||
    attrs.fund_allocation !== undefined ||
    (Array.isArray(attrs.mpf_subfunds) && attrs.mpf_subfunds.length > 0)
  );
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
    const parsed: unknown = JSON.parse(attributes);
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
  const hasMpfClassMarker = isMpfClassification(classText, subClassText, typeText);
  const hasInsuranceClassMarker = isInsuranceClassification(classText, subClassText, typeText);
  const hasInsuranceAttrs = hasInsuranceSpecificAttributes(attrs);
  const hasMpfAttrs = hasMpfSpecificAttributes(attrs);

  // Keep MPF and Insurance buckets mutually exclusive.
  if (hasMpfClassMarker || hasMpfAttrs) {
    return false;
  }

  if (hasInsuranceClassMarker || hasInsuranceAttrs) {
    return true;
  }

  return (
    // Backward compatibility for older insurance records that only kept cash-flow fields.
    attrs.total_paid_to_date !== undefined ||
    attrs.withdrawable_value !== undefined
  );
}

export function isMpfAsset(asset: Asset): boolean {
  const attrs = parsePanoramaAssetAttributes(asset.attributes);
  const classText = normalizeText(asset.assetClass);
  const subClassText = normalizeText(asset.assetSubClass);
  const typeText = normalizeText(asset.assetType);
  const hasMpfClassMarker = isMpfClassification(classText, subClassText, typeText);
  const hasInsuranceClassMarker = isInsuranceClassification(classText, subClassText, typeText);
  const hasInsuranceAttrs = hasInsuranceSpecificAttributes(attrs);
  const hasMpfAttrs = hasMpfSpecificAttributes(attrs);

  // Keep MPF and Insurance buckets mutually exclusive.
  if (hasInsuranceClassMarker || hasInsuranceAttrs) {
    return false;
  }

  if (hasMpfClassMarker) {
    return true;
  }

  return hasMpfAttrs;
}

export function getAssetOwner(asset: Asset): string | undefined {
  const attrs = parsePanoramaAssetAttributes(asset.attributes);
  const owner = attrs.owner?.trim();
  if (!owner) {
    return undefined;
  }
  return owner;
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

export function normalizeMpfSubfunds(raw: unknown): PanoramaMpfSubfund[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      const value = entry as Record<string, unknown>;
      const name = typeof value.name === "string" ? value.name.trim() : "";
      if (!name) {
        return null;
      }

      const code = typeof value.code === "string" ? value.code.trim() : "";
      const units = asFiniteNumber(value.units);
      const nav = asFiniteNumber(value.nav);
      const marketValue = asFiniteNumber(value.market_value);
      const allocationPct = asFiniteNumber(value.allocation_pct);

      return {
        name,
        ...(code ? { code } : {}),
        ...(units !== undefined ? { units } : {}),
        ...(nav !== undefined ? { nav } : {}),
        ...(marketValue !== undefined ? { market_value: marketValue } : {}),
        ...(allocationPct !== undefined ? { allocation_pct: allocationPct } : {}),
      } satisfies PanoramaMpfSubfund;
    })
    .filter((entry): entry is PanoramaMpfSubfund => Boolean(entry));
}

export function buildFundAllocationFromSubfunds(
  subfunds: PanoramaMpfSubfund[],
): Record<string, number> {
  if (!subfunds.length) {
    return {};
  }

  const byExplicitAllocation = subfunds
    .map((subfund) => ({
      name: subfund.name.trim(),
      value: asFiniteNumber(subfund.allocation_pct),
    }))
    .filter(
      (entry): entry is { name: string; value: number } =>
        Boolean(entry.name) && entry.value !== undefined && entry.value >= 0,
    );

  if (byExplicitAllocation.length > 0) {
    return Object.fromEntries(byExplicitAllocation.map((entry) => [entry.name, entry.value]));
  }

  const byMarketValue = subfunds
    .map((subfund) => ({
      name: subfund.name.trim(),
      value: asFiniteNumber(subfund.market_value),
    }))
    .filter(
      (entry): entry is { name: string; value: number } =>
        Boolean(entry.name) && entry.value !== undefined && entry.value > 0,
    );

  const total = byMarketValue.reduce((sum, entry) => sum + entry.value, 0);
  if (total <= 0) {
    return {};
  }

  return Object.fromEntries(
    byMarketValue.map((entry) => [entry.name, Number(((entry.value / total) * 100).toFixed(4))]),
  );
}
