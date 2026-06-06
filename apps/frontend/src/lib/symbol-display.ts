export interface SymbolPresentationInput {
  symbol?: string | null;
  instrumentType?: string | null;
  preferredProvider?: string | null;
  providerConfig?: Record<string, unknown> | null;
}

export interface SymbolPresentation {
  symbol: string;
  hint?: string;
}

function isSixDigitCode(value: string): boolean {
  return /^\d{6}$/.test(value);
}

function getPreferredProvider(input: SymbolPresentationInput): string | undefined {
  if (input.preferredProvider) {
    return input.preferredProvider.trim().toUpperCase();
  }

  const configuredProvider = input.providerConfig?.preferred_provider;
  return typeof configuredProvider === "string"
    ? configuredProvider.trim().toUpperCase()
    : undefined;
}

function isFundType(instrumentType?: string | null): boolean {
  const normalized = instrumentType?.trim().toUpperCase();
  return (
    normalized === "FUND" ||
    normalized === "MUTUALFUND" ||
    normalized === "MUTUAL_FUND" ||
    normalized === "MUTUAL FUND"
  );
}

function stripLegacyCnExchangeSuffix(symbol: string): string {
  const match = /^(\d{6})\.(SH|SS|SZ)$/i.exec(symbol);
  return match ? match[1] : symbol;
}

export function getSymbolPresentation(input: SymbolPresentationInput): SymbolPresentation {
  const symbol = input.symbol?.trim() ?? "";
  const normalized = symbol.toUpperCase();
  const preferredProvider = getPreferredProvider(input);
  const fundCode = normalized.replace(/\.FUND$/, "");
  const hasFundSuffix = normalized.endsWith(".FUND") && isSixDigitCode(fundCode);
  const isTiantianFund = preferredProvider === "TIANTIAN_FUND" || hasFundSuffix;
  const isFund =
    preferredProvider === "TIANTIAN_FUND" || isFundType(input.instrumentType) || hasFundSuffix;

  if (isFund && isSixDigitCode(fundCode)) {
    return {
      symbol: fundCode,
      hint: isTiantianFund ? "Fund / Tiantian" : "Fund",
    };
  }

  return {
    symbol: stripLegacyCnExchangeSuffix(symbol),
  };
}

export function getDisplaySymbol(input: SymbolPresentationInput): string {
  return getSymbolPresentation(input).symbol;
}
