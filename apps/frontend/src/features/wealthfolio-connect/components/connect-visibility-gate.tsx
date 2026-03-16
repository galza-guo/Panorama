import { useSettingsContext } from "@/lib/settings-provider";
import { ReactNode } from "react";
import { Navigate } from "react-router-dom";

interface ConnectVisibilityGateProps {
  children: ReactNode;
  redirectTo: string;
}

export function ConnectVisibilityGate({
  children,
  redirectTo,
}: ConnectVisibilityGateProps) {
  const { settings, isLoading } = useSettingsContext();

  if (isLoading) {
    return null;
  }

  if (settings && !settings.wealthfolioConnectVisible) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
