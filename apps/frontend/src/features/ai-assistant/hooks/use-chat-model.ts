import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getAiProviders } from "@/adapters";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { QueryKeys } from "@/lib/query-keys";
import type { AiProvidersResponse, MergedProvider, MergedModel } from "@/lib/types";

export const CHAT_MODEL_STORAGE_KEY = "chat_selected_model";

export interface StoredModelSelection {
  providerId: string;
  modelId: string;
}

export interface ChatModelState {
  isLoading: boolean;
  settings: AiProvidersResponse | undefined;
  enabledProviders: MergedProvider[];
  currentProviderId: string | undefined;
  currentModelId: string | undefined;
  currentProvider: MergedProvider | undefined;
  currentModel: MergedModel | undefined;
  selectModel: (providerId: string, modelId: string) => Promise<void>;
  /** Whether the current model supports thinking */
  supportsThinking: boolean;
  /** Whether thinking is enabled for this session (can be toggled by user) */
  thinkingEnabled: boolean;
  /** Toggle thinking on/off */
  toggleThinking: () => void;
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

export function useChatModel(): ChatModelState {
  const { data: settings, isLoading } = useQuery({
    queryKey: [QueryKeys.AI_PROVIDERS],
    queryFn: getAiProviders,
  });

  const [storedSelection, setStoredSelection] = usePersistentState<StoredModelSelection | null>(
    CHAT_MODEL_STORAGE_KEY,
    null,
  );

  // Show all enabled providers.
  // API providers without keys remain visible and will return actionable errors when used.
  const enabledProviders = useMemo(() => {
    return settings?.providers.filter((p) => p.enabled) ?? [];
  }, [settings?.providers]);

  // Determine current provider and model
  const { currentProviderId, currentModelId } = useMemo(() => {
    // Use the stored selection if it matches an enabled provider.
    if (storedSelection) {
      const provider = enabledProviders.find((p) => p.id === storedSelection.providerId);
      if (provider) {
        return {
          currentProviderId: provider.id,
          currentModelId: resolveProviderModelId(provider, storedSelection.modelId),
        };
      }
    }

    // Fall back to default provider from settings
    if (settings?.defaultProvider) {
      const provider = enabledProviders.find((p) => p.id === settings.defaultProvider);
      if (provider) {
        return {
          currentProviderId: provider.id,
          currentModelId: resolveProviderModelId(provider),
        };
      }
    }

    // Fall back to first ready provider.
    const firstReadyProvider = enabledProviders.find((p) => p.type === "local" || p.hasApiKey);
    const firstProvider = firstReadyProvider ?? enabledProviders[0];
    if (firstProvider) {
      return {
        currentProviderId: firstProvider.id,
        currentModelId: resolveProviderModelId(firstProvider),
      };
    }

    return { currentProviderId: undefined, currentModelId: undefined };
  }, [enabledProviders, settings?.defaultProvider, storedSelection]);

  // Keep local storage in sync with resolved provider/model to avoid stale selections.
  useEffect(() => {
    if (!currentProviderId || !currentModelId) return;

    if (
      storedSelection?.providerId === currentProviderId &&
      storedSelection.modelId === currentModelId
    ) {
      return;
    }

    setStoredSelection({ providerId: currentProviderId, modelId: currentModelId });
  }, [currentProviderId, currentModelId, setStoredSelection, storedSelection]);

  // Get current provider object
  const currentProvider = useMemo(() => {
    return enabledProviders.find((p) => p.id === currentProviderId);
  }, [enabledProviders, currentProviderId]);

  // Get current model object
  const currentModel = useMemo(() => {
    if (!currentProvider || !currentModelId) return undefined;
    return currentProvider.models.find((m) => m.id === currentModelId);
  }, [currentProvider, currentModelId]);

  // Check if current model supports thinking
  const supportsThinking = useMemo(() => {
    return currentModel?.capabilities?.thinking ?? false;
  }, [currentModel]);

  // Thinking enabled state - defaults to model's capability, but can be toggled
  // Reset to model default when model changes
  const [thinkingEnabled, setThinkingEnabled] = useState(supportsThinking);

  // Sync thinking state when model changes
  useEffect(() => {
    setThinkingEnabled(supportsThinking);
  }, [supportsThinking]);

  const toggleThinking = useCallback(() => {
    if (supportsThinking) {
      setThinkingEnabled((prev) => !prev);
    }
  }, [supportsThinking]);

  // Select a model
  const selectModel = useCallback(
    async (providerId: string, modelId: string) => {
      const provider = enabledProviders.find((p) => p.id === providerId);
      if (!provider) return;

      const selectedModel = resolveProviderModelId(provider, modelId);
      if (!selectedModel) return;
      setStoredSelection({ providerId, modelId: selectedModel });
    },
    [enabledProviders, setStoredSelection],
  );

  return {
    isLoading,
    settings,
    enabledProviders,
    currentProviderId,
    currentModelId,
    currentProvider,
    currentModel,
    selectModel,
    supportsThinking,
    thinkingEnabled,
    toggleThinking,
  };
}
