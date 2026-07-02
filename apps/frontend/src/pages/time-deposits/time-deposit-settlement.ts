import { ActivityType, AssetKind, QuoteMode } from "@/lib/constants";
import {
  asFiniteNumber,
  buildTimeDepositMetadata,
  parsePanoramaAssetAttributes,
} from "@/lib/panorama-asset-attributes";
import { deriveTimeDepositMaturityValue } from "@/lib/time-deposit-calculations";

export interface TimeDepositSettlementSource {
  id: string;
  name: string;
  currency: string;
  metadata?: Record<string, unknown>;
  purchasePrice?: string | null;
}

export interface TimeDepositSettlementState {
  canSettle: boolean;
  principal?: number;
  maturityValue?: number;
  maturityDate?: string;
  linkedAccountId?: string;
  isClosed: boolean;
}

export function getTodayIsoDate(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
    .toISOString()
    .slice(0, 10);
}

export function getTimeDepositSettlementState(
  source: TimeDepositSettlementSource,
  asOfDate = getTodayIsoDate(),
): TimeDepositSettlementState {
  const attributes = parsePanoramaAssetAttributes(
    source.metadata as Parameters<typeof parsePanoramaAssetAttributes>[0],
  );
  const principal = asFiniteNumber(attributes.principal ?? source.purchasePrice);
  const quotedAnnualRate = asFiniteNumber(attributes.quoted_annual_rate);
  const guaranteedMaturityValue = asFiniteNumber(attributes.guaranteed_maturity_value);
  const startDate =
    typeof attributes.start_date === "string" ? attributes.start_date : undefined;
  const maturityDate =
    typeof attributes.maturity_date === "string" ? attributes.maturity_date : undefined;
  const linkedAccountId =
    typeof attributes.linked_account_id === "string" && attributes.linked_account_id.trim()
      ? attributes.linked_account_id.trim()
      : undefined;
  const maturityValue =
    guaranteedMaturityValue ??
    (principal !== undefined &&
    startDate !== undefined &&
    maturityDate !== undefined &&
    quotedAnnualRate !== undefined
      ? deriveTimeDepositMaturityValue({
          principal,
          startDate,
          maturityDate,
          quotedAnnualRatePct: quotedAnnualRate,
        })
      : undefined);
  const isClosed = attributes.status === "closed";

  return {
    canSettle:
      !isClosed &&
      linkedAccountId !== undefined &&
      principal !== undefined &&
      maturityValue !== undefined &&
      maturityDate !== undefined &&
      maturityDate <= asOfDate,
    principal,
    maturityValue,
    maturityDate,
    linkedAccountId,
    isClosed,
  };
}

export function buildTimeDepositSettlementActivities(
  source: TimeDepositSettlementSource,
  settlement: TimeDepositSettlementState,
) {
  if (
    !settlement.canSettle ||
    !settlement.linkedAccountId ||
    !settlement.maturityDate ||
    settlement.principal === undefined
  ) {
    return [];
  }

  const maturityValue = settlement.maturityValue ?? settlement.principal;
  const settledInterest = Math.max(maturityValue - settlement.principal, 0);
  const sourceGroupId = `time-deposit-settlement-${source.id}-${settlement.maturityDate}`;
  const activityDate = new Date(`${settlement.maturityDate}T00:00:00Z`).toISOString();

  return [
    {
      accountId: settlement.linkedAccountId,
      activityType: ActivityType.SELL,
      activityDate,
      sourceGroupId,
      symbol: {
        id: source.id,
        kind: AssetKind.TIME_DEPOSIT,
        name: source.name,
        quoteMode: QuoteMode.MANUAL,
      },
      quantity: "1",
      unitPrice: formatSettlementAmount(settlement.principal),
      currency: source.currency,
      metadata: {
        panorama_time_deposit_role: "settlement_principal",
        asset_id: source.id,
      },
    },
    ...(settledInterest > 0
      ? [
          {
            accountId: settlement.linkedAccountId,
            activityType: ActivityType.INTEREST,
            activityDate,
            sourceGroupId,
            amount: formatSettlementAmount(settledInterest),
            currency: source.currency,
            metadata: {
              panorama_time_deposit_role: "settlement_interest",
              asset_id: source.id,
            },
          },
        ]
      : []),
  ];
}

export function buildTimeDepositSettlementMetadata(
  settlement: TimeDepositSettlementState,
  settlementActivityIds: string[],
) {
  if (
    !settlement.linkedAccountId ||
    !settlement.maturityDate ||
    settlement.principal === undefined
  ) {
    return buildTimeDepositMetadata({});
  }

  const maturityValue = settlement.maturityValue ?? settlement.principal;

  return buildTimeDepositMetadata({
    status: "closed",
    settlement_date: settlement.maturityDate,
    settlement_account_id: settlement.linkedAccountId,
    settlement_activity_ids: settlementActivityIds,
    settled_principal: settlement.principal,
    settled_interest: Math.max(maturityValue - settlement.principal, 0),
    actual_maturity_value: maturityValue,
  });
}

function formatSettlementAmount(value: number): string {
  return String(Number(value.toFixed(2)));
}
