import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { getAiProviders } from "@/adapters";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { QueryKeys } from "@/lib/query-keys";
import type { MergedProvider } from "@/lib/types";
import { CHAT_MODEL_STORAGE_KEY, type StoredModelSelection } from "./use-chat-model";

export interface UseProviderPickerResult {
  isLoading: boolean;
  activeProviders: MergedProvider[];
  currentProviderId: string | undefined;
  currentProvider: MergedProvider | undefined;
  selectProvider: (providerId: string) => Promise<void>;
}

function resolveProviderModelId(
  provider: MergedProvider,
  preferredModelId?: string,
): string | undefined {
  const favoriteIds = provider.favoriteModels ?? [];
  if (favoriteIds.length === 0) {
    return undefined;
  }

  if (preferredModelId && favoriteIds.includes(preferredModelId)) {
    return preferredModelId;
  }

  if (provider.selectedModel && favoriteIds.includes(provider.selectedModel)) {
    return provider.selectedModel;
  }

  if (favoriteIds.includes(provider.defaultModel)) {
    return provider.defaultModel;
  }

  return favoriteIds[0];
}

export function useProviderPicker(): UseProviderPickerResult {
  const { data: settings, isLoading } = useQuery({
    queryKey: [QueryKeys.AI_PROVIDERS],
    queryFn: getAiProviders,
  });

  const [storedSelection, setStoredSelection] = usePersistentState<StoredModelSelection | null>(
    CHAT_MODEL_STORAGE_KEY,
    null,
  );

  // Show all enabled providers in picker.
  // API providers without keys are still selectable, but requests will prompt for configuration.
  const activeProviders = useMemo(() => {
    return settings?.providers.filter((p) => p.enabled) ?? [];
  }, [settings?.providers]);

  // Determine current provider
  const currentProviderId = useMemo(() => {
    // First check localStorage for user's selection
    if (storedSelection) {
      const provider = activeProviders.find((p) => p.id === storedSelection.providerId);
      if (provider) {
        return storedSelection.providerId;
      }
    }

    // Fall back to default provider from settings
    if (settings?.defaultProvider) {
      const provider = activeProviders.find((p) => p.id === settings.defaultProvider);
      if (provider) {
        return settings.defaultProvider;
      }
    }

    // Fall back to first ready provider (has key or local), otherwise first enabled provider
    const firstReady = activeProviders.find((p) => p.type === "local" || p.hasApiKey);
    return firstReady?.id ?? activeProviders[0]?.id;
  }, [activeProviders, settings?.defaultProvider, storedSelection]);

  const currentProvider = useMemo(() => {
    return activeProviders.find((p) => p.id === currentProviderId);
  }, [activeProviders, currentProviderId]);

  const selectProvider = useCallback(
    async (providerId: string) => {
      const provider = activeProviders.find((p) => p.id === providerId);
      if (!provider) return;

      const preferredModel =
        storedSelection?.providerId === providerId ? storedSelection.modelId : undefined;
      const modelId =
        resolveProviderModelId(provider, preferredModel) ??
        provider.selectedModel ??
        provider.defaultModel;

      // Store locally
      setStoredSelection({ providerId, modelId });
    },
    [activeProviders, setStoredSelection, storedSelection],
  );

  return {
    isLoading,
    activeProviders,
    currentProviderId,
    currentProvider,
    selectProvider,
  };
}
