import { getDynamicNavItems, subscribeToNavigationUpdates } from "@/addons/addons-runtime-context";
import { Icons } from "@/components/ui/icons";
import { useSettingsContext } from "@/lib/settings-provider";
import { useEffect, useMemo, useState } from "react";

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

export interface ComponentVisibilitySettings {
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
      keywords: ["portfolio", "assets", "positions", "stocks"],
      label: "View Holdings",
    },
    {
      icon: <Icons.Activity className="size-6" />,
      title: "Activities",
      href: "/activities",
      keywords: ["transactions", "trades", "history"],
      label: "View Activities",
    },
    {
      icon: <Icons.Shield className="size-6" />,
      title: "Insurance",
      href: "/insurance",
      keywords: ["policy", "protection", "coverage"],
      label: "View Insurance",
    },
    {
      icon: <Icons.PieChart className="size-6" />,
      title: "MPF",
      href: "/mpf",
      keywords: ["retirement", "allocation", "fund"],
      label: "View MPF",
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

export function isComponentRouteEnabled(
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
  const [dynamicItems, setDynamicItems] = useState<NavigationProps["primary"]>([]);
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

  const filteredPrimary = useMemo(
    () =>
      staticNavigation.primary.filter((item) => isComponentRouteEnabled(item.href, settings)),
    [settings?.insuranceVisible, settings?.mpfVisible],
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

  return normalizedPath === normalizedHref || normalizedPath.startsWith(`${normalizedHref}/`);
}
