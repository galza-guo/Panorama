import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getAiProviders,
  updateAiProviderSettings,
  setDefaultAiProvider,
  listAiModels,
  setSecret,
  getSecret,
  deleteSecret,
} from "@/adapters";
import type {
  AiProvidersResponse,
  UpdateProviderSettingsRequest,
  SetDefaultProviderRequest,
} from "@/lib/types";
import { QueryKeys } from "@/lib/query-keys";

const AI_PROVIDERS_KEY = [QueryKeys.AI_PROVIDERS] as const;

function patchProviderCache(
  previous: AiProvidersResponse | undefined,
  request: UpdateProviderSettingsRequest,
) {
  if (!previous) return previous;

  return {
    ...previous,
    providers: previous.providers.map((provider) => {
      if (provider.id !== request.providerId) {
        return provider;
      }

      const next = { ...provider };

      if (request.enabled !== undefined) {
        next.enabled = request.enabled;
      }
      if (request.favorite !== undefined) {
        next.favorite = request.favorite;
      }
      if (request.selectedModel !== undefined) {
        next.selectedModel = request.selectedModel;
      }
      if (request.customUrl !== undefined) {
        next.customUrl = request.customUrl.trim() === "" ? undefined : request.customUrl;
      }
      if (request.priority !== undefined) {
        next.priority = request.priority;
      }
      if (request.favoriteModels !== undefined) {
        next.favoriteModels = request.favoriteModels;
      }
      if (request.toolsAllowlist !== undefined) {
        next.toolsAllowlist = request.toolsAllowlist;
      }
      if (request.modelCapabilityOverride) {
        const { modelId, overrides } = request.modelCapabilityOverride;
        const overridesMap = { ...next.modelCapabilityOverrides };
        if (overrides) {
          overridesMap[modelId] = overrides;
        } else {
          delete overridesMap[modelId];
        }
        next.modelCapabilityOverrides = overridesMap;
      }

      return next;
    }),
  };
}

function patchDefaultProviderCache(
  previous: AiProvidersResponse | undefined,
  request: SetDefaultProviderRequest,
) {
  if (!previous) return previous;

  return {
    ...previous,
    defaultProvider: request.providerId,
    providers: previous.providers.map((provider) => ({
      ...provider,
      isDefault: provider.id === request.providerId,
    })),
  };
}

/**
 * Hook to fetch all AI providers with merged settings.
 */
export function useAiProviders() {
  return useQuery({
    queryKey: AI_PROVIDERS_KEY,
    queryFn: getAiProviders,
  });
}

/**
 * Hook to update a provider's settings.
 */
export function useUpdateAiProviderSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: UpdateProviderSettingsRequest) => updateAiProviderSettings(request),
    onSuccess: (_result, request) => {
      queryClient.setQueryData<AiProvidersResponse>(AI_PROVIDERS_KEY, (previous) =>
        patchProviderCache(previous, request),
      );
    },
    onError: (error) => {
      toast.error("Failed to update provider settings", {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });
}

/**
 * Hook to set the default AI provider.
 */
export function useSetDefaultAiProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: SetDefaultProviderRequest) => setDefaultAiProvider(request),
    onSuccess: (_result, request) => {
      queryClient.setQueryData<AiProvidersResponse>(AI_PROVIDERS_KEY, (previous) =>
        patchDefaultProviderCache(previous, request),
      );
    },
    onError: (error) => {
      toast.error("Failed to update default provider", {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });
}

/**
 * Hook to manage API keys for AI providers.
 * Uses the ai_{providerId} key format in the secret store.
 */
export function useAiProviderApiKey(providerId: string) {
  const queryClient = useQueryClient();
  const secretKey = `ai_${providerId}`;

  const setApiKey = useMutation({
    mutationFn: async (apiKey: string) => {
      await setSecret(secretKey, apiKey);
    },
    onSuccess: () => {
      queryClient.setQueryData<AiProvidersResponse>(AI_PROVIDERS_KEY, (previous) => {
        if (!previous) return previous;
        return {
          ...previous,
          providers: previous.providers.map((provider) =>
            provider.id === providerId ? { ...provider, hasApiKey: true } : provider,
          ),
        };
      });
    },
    onError: (error) => {
      toast.error("Failed to save API key", {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const deleteApiKey = useMutation({
    mutationFn: async () => {
      await deleteSecret(secretKey);
    },
    onSuccess: () => {
      queryClient.setQueryData<AiProvidersResponse>(AI_PROVIDERS_KEY, (previous) => {
        if (!previous) return previous;
        return {
          ...previous,
          providers: previous.providers.map((provider) =>
            provider.id === providerId ? { ...provider, hasApiKey: false } : provider,
          ),
        };
      });
    },
    onError: (error) => {
      toast.error("Failed to delete API key", {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const revealApiKey = async (): Promise<string | null> => {
    return getSecret(secretKey);
  };

  return {
    setApiKey,
    deleteApiKey,
    revealApiKey,
  };
}

/**
 * Hook to list available models from a provider.
 * Fetches models on demand; disabled by default until enabled explicitly.
 */
export function useListAiModels(providerId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: QueryKeys.aiProviderModels(providerId),
    queryFn: () => listAiModels(providerId),
    enabled: options?.enabled ?? false,
  });
}
