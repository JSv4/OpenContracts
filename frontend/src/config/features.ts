export interface FeatureConfig {
  requiresCorpus: boolean;
  displayName: string;
  hideWhenUnavailable: boolean;
  disabledMessage?: string;
  fallbackBehavior?: "hide" | "disable" | "show-message";
}

export const FEATURE_FLAGS = {
  CHAT: {
    requiresCorpus: true,
    displayName: "Document Chat",
    hideWhenUnavailable: true,
    disabledMessage: "Add to corpus to enable AI chat",
  },
  ANNOTATIONS: {
    requiresCorpus: true,
    displayName: "Annotations",
    hideWhenUnavailable: true,
    disabledMessage: "Add to corpus to annotate",
  },
  NOTES: {
    requiresCorpus: false,
    displayName: "Notes",
    hideWhenUnavailable: false,
  },
  SUMMARIES: {
    requiresCorpus: true,
    displayName: "Document Summaries",
    hideWhenUnavailable: true,
    disabledMessage: "Add to corpus for collaborative summaries",
  },
  SEARCH: {
    requiresCorpus: false,
    displayName: "Document Search",
    hideWhenUnavailable: false,
  },
  ANALYSES: {
    requiresCorpus: true,
    displayName: "Document Analyses",
    hideWhenUnavailable: true,
    disabledMessage: "Add to corpus to run analyses",
  },
  EXTRACTS: {
    requiresCorpus: true,
    displayName: "Data Extracts",
    hideWhenUnavailable: true,
    disabledMessage: "Add to corpus for data extraction",
  },
} as const;

export type FeatureKey = keyof typeof FEATURE_FLAGS;
