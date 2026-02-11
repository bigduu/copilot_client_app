import { useCallback, useEffect, useState } from "react";
import { serviceFactory } from "../../../../services/common/ServiceFactory";

interface AnthropicModelMapping {
  mappings: Record<string, string>;
}

interface UseAnthropicModelMappingProps {
  msgApi: {
    success: (content: string) => void;
    error: (content: string) => void;
  };
}

export const useAnthropicModelMapping = ({
  msgApi,
}: UseAnthropicModelMappingProps) => {
  const [mapping, setMapping] = useState<AnthropicModelMapping>({ mappings: {} });
  const [isLoading, setIsLoading] = useState(false);

  const loadMapping = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await serviceFactory.getAnthropicModelMapping();
      setMapping(result || { mappings: {} });
    } catch (error) {
      console.error("Failed to load Anthropic model mapping:", error);
      setMapping({ mappings: {} });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveMapping = useCallback(
    async (newMapping: AnthropicModelMapping) => {
      try {
        await serviceFactory.setAnthropicModelMapping(newMapping);
        setMapping(newMapping);
        msgApi.success("Anthropic model mapping saved");
      } catch (error) {
        msgApi.error(
          error instanceof Error
            ? error.message
            : "Failed to save Anthropic model mapping"
        );
        throw error;
      }
    },
    [msgApi]
  );

  useEffect(() => {
    loadMapping();
  }, [loadMapping]);

  return {
    mapping,
    setMapping,
    isLoading,
    loadMapping,
    saveMapping,
  };
};
