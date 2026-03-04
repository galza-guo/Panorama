import { getDynamicNavItems, subscribeToNavigationUpdates } from "@/addons/addons-runtime-context";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useSettingsContext } from "@/lib/settings-provider";
import { useEffect, useState } from "react";

export interface NavLink {
  title: string;
  href: string;
  icon?: React.ReactNode;
  keywords?: string[];
  label?: string; // Optional descriptive label for launcher/search
}

export interface NavigationProps {
  primary: NavLink[];
  secondary?: NavLink[];
  addons?: NavLink[];
}

interface ComponentVisibilitySettings {
  insuranceVisible?: boolean;
  mpfVisible?: boolean;
}

const staticNavigation: NavigationProps = {
  primary: [
    {
      icon: <Icons.Dashboard className="size-6" />,
      title: "Dashboard",
      href: "/dashboard",
      keywords: ["home", "overview", "summary"],
      label: "View Dashboard",
    },
    {
      icon: <Icons.Insight className="size-6" />,
      title: "Insights",
      href: "/insights",
      keywords: ["insights", "Analytics"],
      label: "View Insights",
    },
    {
      icon: <Icons.Holdings className="size-6" />,
      title: "Holdings",
      href: "/holdings",
      keywords: ["Holdings", "portfolio", "assets", "positions", "stocks"],
      label: "View Holdings",
    },
    {
      icon: <Icons.ShieldCheck className="size-6" />,
      title: "Insurance",
      href: "/insurance",
      keywords: ["insurance", "policy", "protection", "cash value"],
      label: "View Insurance",
    },
    {
      icon: <Icons.Briefcase className="size-6" />,
      title: "MPF",
      href: "/mpf",
      keywords: ["mpf", "mandatory provident fund", "retirement", "subfund"],
      label: "View MPF",
    },
    {
      icon: <Icons.Activity className="size-6" />,
      title: "Activities",
      href: "/activities",
      keywords: ["transactions", "trades", "history"],
      label: "View Activities",
    },
    {
      icon: <Icons.Sparkles className="size-6" />,
      title: "Assistant",
      href: "/assistant",
      keywords: ["ai", "assistant", "chat", "help", "ask"],
      label: "AI Assistant",
    },
  ],
  secondary: [
    {
      icon: <Icons.Settings className="size-6" />,
      title: "Settings",
      href: "/settings",
      keywords: ["preferences", "config", "configuration"],
    },
  ],
};

function normalizePath(value: string): string {
  if (!value) {
    return "/";
  }

  if (!value.startsWith("/")) {
    return `/${value}`;
  }

  if (value.length > 1 && value.endsWith("/")) {
    return value.slice(0, -1);
  }

  return value;
}

function isInsuranceRoute(pathname: string): boolean {
  const normalizedPath = normalizePath(pathname);
  return normalizedPath === "/insurance" || normalizedPath.startsWith("/insurance/");
}

function isMpfRoute(pathname: string): boolean {
  const normalizedPath = normalizePath(pathname);
  return normalizedPath === "/mpf" || normalizedPath.startsWith("/mpf/");
}

function isComponentRouteEnabled(
  pathname: string,
  settings: ComponentVisibilitySettings | null | undefined,
): boolean {
  if (isInsuranceRoute(pathname)) {
    return settings?.insuranceVisible ?? true;
  }

  if (isMpfRoute(pathname)) {
    return settings?.mpfVisible ?? true;
  }

  return true;
}

export function useNavigation() {
  const [dynamicItems, setDynamicItems] = useState<NavigationProps["addons"]>([]);
  const { settings } = useSettingsContext();

  // Subscribe to navigation updates from addons
  useEffect(() => {
    const updateDynamicItems = () => {
      const itemsFromRuntime = getDynamicNavItems();
      setDynamicItems(itemsFromRuntime);
    };

    // Initial load
    updateDynamicItems();

    // Subscribe to updates
    const unsubscribe = subscribeToNavigationUpdates(updateDynamicItems);

    return () => {
      unsubscribe();
    };
  }, []);

  const filteredPrimary = staticNavigation.primary.filter((item) =>
    isComponentRouteEnabled(item.href, settings),
  );

  // Combine static navigation items with addons grouped separately
  const navigation: NavigationProps = {
    primary: filteredPrimary,
    secondary: staticNavigation.secondary,
    addons: dynamicItems,
  };

  return navigation;
}

export function isPathActive(pathname: string, href: string): boolean {
  if (!href) {
    return false;
  }

  const ensureLeadingSlash = href.startsWith("/") ? href : `/${href}`;
  const normalize = (value: string) => {
    if (value.length > 1 && value.endsWith("/")) {
      return value.slice(0, -1);
    }
    return value;
  };

  const normalizedHref = normalize(ensureLeadingSlash);
  const normalizedPath = normalize(pathname);

  if (normalizedHref === "/") {
    return normalizedPath === "/";
  }

  // Dashboard and Net Worth are grouped together
  if (normalizedHref === "/dashboard") {
    return (
      normalizedPath === "/" || normalizedPath === "/dashboard" || normalizedPath === "/net-worth"
    );
  }

  return normalizedPath === normalizedHref || normalizedPath.startsWith(`${normalizedHref}/`);
}
