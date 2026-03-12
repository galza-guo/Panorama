import type { AlternativeAssetHolding, JsonObject, JsonValue } from "./types";

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
  provider?: string;
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
  principal?: number | string;
  start_date?: string;
  maturity_date?: string;
  quoted_annual_rate?: number | string;
  guaranteed_maturity_value?: number | string;
  valuation_mode?: string;
  current_value_override?: number | string;
  status?: string;
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

export interface MpfMetadataInput {
  owner?: string;
  trustee?: string;
  mpf_scheme?: string;
  valuation_date?: string;
  mpf_subfunds?: PanoramaMpfSubfund[];
}

export interface TimeDepositMetadataInput {
  owner?: string;
  provider?: string;
  principal?: number;
  start_date?: string;
  maturity_date?: string;
  quoted_annual_rate?: number;
  guaranteed_maturity_value?: number;
  valuation_mode?: "derived" | "manual";
  current_value_override?: number;
  valuation_date?: string;
  status?: "active" | "matured" | "closed";
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

function hasTimeDepositMarker(attrs: PanoramaAssetAttributes): boolean {
  const category = normalizeText(attrs.panorama_category);
  const subtype = normalizeText(attrs.sub_type);

  return category === "time_deposit" || subtype === "time_deposit";
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

function hasTimeDepositSpecificAttributes(attrs: PanoramaAssetAttributes): boolean {
  const hasTermDates =
    typeof attrs.start_date === "string" &&
    attrs.start_date.trim().length > 0 &&
    typeof attrs.maturity_date === "string" &&
    attrs.maturity_date.trim().length > 0;

  const hasPrincipal = asFiniteNumber(attrs.principal) !== undefined;
  const hasReturnSignal =
    asFiniteNumber(attrs.quoted_annual_rate) !== undefined ||
    asFiniteNumber(attrs.guaranteed_maturity_value) !== undefined ||
    asFiniteNumber(attrs.current_value_override) !== undefined;

  return hasTermDates && hasPrincipal && hasReturnSignal;
}

export function parsePanoramaAssetAttributes(
  metadata?: AlternativeAssetHolding["metadata"] | null,
): PanoramaAssetAttributes {
  return (asObject(metadata) ?? {}) as PanoramaAssetAttributes;
}

export function isInsuranceAsset(holding: AlternativeAssetHolding): boolean {
  const attrs = parsePanoramaAssetAttributes(holding.metadata);
  const hasMpfSignals = hasMpfMarker(attrs) || hasMpfSpecificAttributes(attrs);
  const hasTimeDepositSignals = hasTimeDepositMarker(attrs) || hasTimeDepositSpecificAttributes(attrs);
  const hasInsuranceSignals = hasInsuranceMarker(attrs) || hasInsuranceSpecificAttributes(attrs);

  if (hasMpfSignals || hasTimeDepositSignals) {
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
  const hasTimeDepositSignals = hasTimeDepositMarker(attrs) || hasTimeDepositSpecificAttributes(attrs);
  const hasMpfSignals = hasMpfMarker(attrs) || hasMpfSpecificAttributes(attrs);

  if (hasMpfSignals) {
    return true;
  }

  if (hasInsuranceSignals || hasTimeDepositSignals) {
    return false;
  }

  return false;
}

export function isTimeDepositAsset(holding: AlternativeAssetHolding): boolean {
  const attrs = parsePanoramaAssetAttributes(holding.metadata);
  const hasInsuranceSignals = hasInsuranceMarker(attrs) || hasInsuranceSpecificAttributes(attrs);
  const hasMpfSignals = hasMpfMarker(attrs) || hasMpfSpecificAttributes(attrs);
  const hasTimeDepositSignals = hasTimeDepositMarker(attrs) || hasTimeDepositSpecificAttributes(attrs);

  if (hasInsuranceSignals || hasMpfSignals) {
    return false;
  }

  return hasTimeDepositSignals;
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

export function buildTimeDepositMetadata(input: TimeDepositMetadataInput): JsonObject {
  const metadata: JsonObject = {
    panorama_category: "time_deposit",
    sub_type: "time_deposit",
  };

  if (input.owner?.trim()) {
    metadata.owner = input.owner.trim();
  }

  if (input.provider?.trim()) {
    metadata.provider = input.provider.trim();
  }

  if (input.principal !== undefined) {
    metadata.principal = input.principal;
  }

  if (input.start_date?.trim()) {
    metadata.start_date = input.start_date.trim();
  }

  if (input.maturity_date?.trim()) {
    metadata.maturity_date = input.maturity_date.trim();
  }

  if (input.quoted_annual_rate !== undefined) {
    metadata.quoted_annual_rate = input.quoted_annual_rate;
  }

  if (input.guaranteed_maturity_value !== undefined) {
    metadata.guaranteed_maturity_value = input.guaranteed_maturity_value;
  }

  if (input.valuation_mode) {
    metadata.valuation_mode = input.valuation_mode;
  }

  if (input.current_value_override !== undefined) {
    metadata.current_value_override = input.current_value_override;
  }

  if (input.valuation_date?.trim()) {
    metadata.valuation_date = input.valuation_date.trim();
  }

  if (input.status) {
    metadata.status = input.status;
  }

  return metadata;
}

export function buildTimeDepositMetadataPatch(input: TimeDepositMetadataInput): JsonObject {
  return {
    panorama_category: "time_deposit",
    sub_type: "time_deposit",
    owner: input.owner?.trim() ? input.owner.trim() : null,
    provider: input.provider?.trim() ? input.provider.trim() : null,
    principal: input.principal ?? null,
    start_date: input.start_date?.trim() ? input.start_date.trim() : null,
    maturity_date: input.maturity_date?.trim() ? input.maturity_date.trim() : null,
    quoted_annual_rate: input.quoted_annual_rate ?? null,
    guaranteed_maturity_value: input.guaranteed_maturity_value ?? null,
    valuation_mode: input.valuation_mode ?? null,
    current_value_override: input.current_value_override ?? null,
    valuation_date: input.valuation_date?.trim() ? input.valuation_date.trim() : null,
    status: input.status ?? null,
  };
}

function toJsonSubfunds(subfunds: PanoramaMpfSubfund[]): JsonValue[] {
  return subfunds.map((subfund) => ({
    name: subfund.name,
    ...(subfund.code ? { code: subfund.code } : {}),
    ...(subfund.units !== undefined ? { units: subfund.units } : {}),
    ...(subfund.nav !== undefined ? { nav: subfund.nav } : {}),
    ...(subfund.market_value !== undefined ? { market_value: subfund.market_value } : {}),
    ...(subfund.allocation_pct !== undefined ? { allocation_pct: subfund.allocation_pct } : {}),
  }));
}

export function buildMpfMetadata(input: MpfMetadataInput): JsonObject {
  const normalizedSubfunds = normalizeMpfSubfunds(input.mpf_subfunds ?? []);
  const fundAllocation = buildFundAllocationFromSubfunds(normalizedSubfunds);

  const metadata: JsonObject = {
    panorama_category: "mpf",
    sub_type: "mpf",
  };

  if (input.owner?.trim()) {
    metadata.owner = input.owner.trim();
  }

  if (input.trustee?.trim()) {
    metadata.trustee = input.trustee.trim();
  }

  if (input.mpf_scheme?.trim()) {
    metadata.mpf_scheme = input.mpf_scheme.trim();
  }

  if (input.valuation_date?.trim()) {
    metadata.valuation_date = input.valuation_date.trim();
  }

  if (normalizedSubfunds.length > 0) {
    metadata.mpf_subfunds = toJsonSubfunds(normalizedSubfunds);
  }

  if (Object.keys(fundAllocation).length > 0) {
    metadata.fund_allocation = fundAllocation;
  }

  return metadata;
}

export function buildMpfMetadataPatch(input: MpfMetadataInput): JsonObject {
  const normalizedSubfunds = normalizeMpfSubfunds(input.mpf_subfunds ?? []);
  const fundAllocation = buildFundAllocationFromSubfunds(normalizedSubfunds);

  return {
    panorama_category: "mpf",
    sub_type: "mpf",
    owner: input.owner?.trim() ? input.owner.trim() : null,
    trustee: input.trustee?.trim() ? input.trustee.trim() : null,
    mpf_scheme: input.mpf_scheme?.trim() ? input.mpf_scheme.trim() : null,
    valuation_date: input.valuation_date?.trim() ? input.valuation_date.trim() : null,
    mpf_subfunds: normalizedSubfunds.length > 0 ? toJsonSubfunds(normalizedSubfunds) : null,
    fund_allocation: Object.keys(fundAllocation).length > 0 ? fundAllocation : null,
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
