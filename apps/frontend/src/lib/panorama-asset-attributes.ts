import type { AlternativeAssetHolding, JsonObject } from "./types";

export interface PanoramaMpfSubfund {
  name: string;
  code?: string;
  units?: number;
  nav?: number;
  market_value?: number;
  allocation_pct?: number;
}

export interface PanoramaAssetAttributes {
  panorama_category?: string;
  owner?: string;
  policy_type?: string;
  valuation_date?: string;
  expected_withdrawal_date?: string;
  total_paid_to_date?: number | string;
  withdrawable_value?: number | string;
  estimated_value?: number | string;
  market_value?: number | string;
  guaranteed_value?: number | string;
  insurance_provider?: string;
  trustee?: string;
  mpf_scheme?: string;
  mpf_subfunds?: PanoramaMpfSubfund[];
  fund_allocation?: Record<string, number>;
  sub_type?: string;
}

export interface InsuranceMetadataInput {
  owner?: string;
  policy_type?: string;
  insurance_provider?: string;
  valuation_date?: string;
  total_paid_to_date?: number;
  withdrawable_value?: number;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as JsonObject;
}

export function asFiniteNumber(value: unknown): number | undefined {
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

function hasInsuranceMarker(attrs: PanoramaAssetAttributes): boolean {
  const category = normalizeText(attrs.panorama_category);
  const subtype = normalizeText(attrs.sub_type);

  return (
    category === "insurance" ||
    subtype === "insurance" ||
    subtype === "insurance_policy" ||
    normalizeText(attrs.policy_type).includes("insurance")
  );
}

function hasMpfMarker(attrs: PanoramaAssetAttributes): boolean {
  const category = normalizeText(attrs.panorama_category);
  const subtype = normalizeText(attrs.sub_type);

  return category === "mpf" || subtype === "mpf";
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

export function parsePanoramaAssetAttributes(
  metadata?: AlternativeAssetHolding["metadata"] | null,
): PanoramaAssetAttributes {
  return (asObject(metadata) ?? {}) as PanoramaAssetAttributes;
}

export function isInsuranceAsset(holding: AlternativeAssetHolding): boolean {
  const attrs = parsePanoramaAssetAttributes(holding.metadata);
  const hasMpfSignals = hasMpfMarker(attrs) || hasMpfSpecificAttributes(attrs);
  const hasInsuranceSignals = hasInsuranceMarker(attrs) || hasInsuranceSpecificAttributes(attrs);

  if (hasMpfSignals) {
    return false;
  }

  if (hasInsuranceSignals) {
    return true;
  }

  return (
    asFiniteNumber(attrs.total_paid_to_date) !== undefined ||
    asFiniteNumber(attrs.withdrawable_value) !== undefined
  );
}

export function isMpfAsset(holding: AlternativeAssetHolding): boolean {
  const attrs = parsePanoramaAssetAttributes(holding.metadata);
  const hasInsuranceSignals = hasInsuranceMarker(attrs) || hasInsuranceSpecificAttributes(attrs);
  const hasMpfSignals = hasMpfMarker(attrs) || hasMpfSpecificAttributes(attrs);

  if (hasMpfSignals) {
    return true;
  }

  if (hasInsuranceSignals) {
    return false;
  }

  return false;
}

export function getAssetOwner(holding: AlternativeAssetHolding): string | undefined {
  const attrs = parsePanoramaAssetAttributes(holding.metadata);
  const owner = attrs.owner?.trim();

  return owner ? owner : undefined;
}

export function buildInsuranceMetadata(input: InsuranceMetadataInput): JsonObject {
  const metadata: JsonObject = {
    panorama_category: "insurance",
    sub_type: "insurance",
  };

  if (input.owner?.trim()) {
    metadata.owner = input.owner.trim();
  }

  if (input.policy_type?.trim()) {
    metadata.policy_type = input.policy_type.trim();
  }

  if (input.insurance_provider?.trim()) {
    metadata.insurance_provider = input.insurance_provider.trim();
  }

  if (input.valuation_date?.trim()) {
    metadata.valuation_date = input.valuation_date.trim();
  }

  if (input.total_paid_to_date !== undefined) {
    metadata.total_paid_to_date = input.total_paid_to_date;
  }

  if (input.withdrawable_value !== undefined) {
    metadata.withdrawable_value = input.withdrawable_value;
  }

  return metadata;
}

export function buildInsuranceMetadataPatch(input: InsuranceMetadataInput): JsonObject {
  return {
    panorama_category: "insurance",
    sub_type: "insurance",
    owner: input.owner?.trim() ? input.owner.trim() : null,
    policy_type: input.policy_type?.trim() ? input.policy_type.trim() : null,
    insurance_provider: input.insurance_provider?.trim() ? input.insurance_provider.trim() : null,
    valuation_date: input.valuation_date?.trim() ? input.valuation_date.trim() : null,
    total_paid_to_date: input.total_paid_to_date ?? null,
    withdrawable_value: input.withdrawable_value ?? null,
  };
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
  if (subfunds.length === 0) {
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
