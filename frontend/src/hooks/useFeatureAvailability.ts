import { FEATURE_FLAGS, FeatureKey } from "../config/features";

export const useFeatureAvailability = (corpusId?: string) => {
  const isFeatureAvailable = (feature: FeatureKey): boolean => {
    const config = FEATURE_FLAGS[feature];
    return !config.requiresCorpus || Boolean(corpusId);
  };

  const getFeatureStatus = (feature: FeatureKey) => {
    const config = FEATURE_FLAGS[feature];
    const available = isFeatureAvailable(feature);

    return {
      available,
      config,
      message:
        !available && "disabledMessage" in config
          ? config.disabledMessage
          : undefined,
    };
  };

  return {
    isFeatureAvailable,
    getFeatureStatus,
    hasCorpus: Boolean(corpusId),
  };
};
