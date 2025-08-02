import { renderHook } from "@testing-library/react";
import { useFeatureAvailability } from "../useFeatureAvailability";
import { FEATURE_FLAGS } from "../../config/features";

describe("useFeatureAvailability", () => {
  it("should return features as unavailable when no corpusId", () => {
    const { result } = renderHook(() => useFeatureAvailability());

    // All corpus-required features should be unavailable
    expect(result.current.isFeatureAvailable("CHAT")).toBe(false);
    expect(result.current.isFeatureAvailable("ANNOTATIONS")).toBe(false);
    expect(result.current.isFeatureAvailable("EXTRACTS")).toBe(false);
    expect(result.current.isFeatureAvailable("RELATIONSHIPS")).toBe(false);
    expect(result.current.isFeatureAvailable("SEARCH")).toBe(false);
    expect(result.current.isFeatureAvailable("EXPORT")).toBe(false);

    // Non-corpus features should be available
    expect(result.current.isFeatureAvailable("DOCUMENT_VIEW")).toBe(true);
    expect(result.current.isFeatureAvailable("TEXT_VIEW")).toBe(true);
    expect(result.current.isFeatureAvailable("DOWNLOAD")).toBe(true);
  });

  it("should return all features as available when corpusId provided", () => {
    const { result } = renderHook(() => useFeatureAvailability("corpus-123"));

    // All features should be available
    Object.keys(FEATURE_FLAGS).forEach((feature) => {
      expect(result.current.isFeatureAvailable(feature as any)).toBe(true);
    });
  });

  it("should return correct disabled messages", () => {
    const { result } = renderHook(() => useFeatureAvailability());

    expect(result.current.getFeatureMessage("CHAT")).toBe(
      "Add to corpus to enable AI chat"
    );
    expect(result.current.getFeatureMessage("ANNOTATIONS")).toBe(
      "Add to corpus to create annotations"
    );
    expect(result.current.getFeatureMessage("DOCUMENT_VIEW")).toBe("");
  });

  it("should correctly identify features to hide", () => {
    const { result } = renderHook(() => useFeatureAvailability());

    expect(result.current.shouldHideFeature("CHAT")).toBe(true);
    expect(result.current.shouldHideFeature("EXTRACTS")).toBe(true);
    expect(result.current.shouldHideFeature("ANNOTATIONS")).toBe(false); // Shows disabled state
    expect(result.current.shouldHideFeature("DOCUMENT_VIEW")).toBe(false);
  });

  it("should return list of unavailable features", () => {
    const { result } = renderHook(() => useFeatureAvailability());

    const unavailable = result.current.getUnavailableFeatures();
    expect(unavailable).toContain("CHAT");
    expect(unavailable).toContain("ANNOTATIONS");
    expect(unavailable).toContain("EXTRACTS");
    expect(unavailable).not.toContain("DOCUMENT_VIEW");
  });

  it("should handle undefined corpusId same as missing corpusId", () => {
    const { result: resultUndefined } = renderHook(() =>
      useFeatureAvailability(undefined)
    );
    const { result: resultMissing } = renderHook(() =>
      useFeatureAvailability()
    );

    expect(resultUndefined.current.isFeatureAvailable("CHAT")).toBe(
      resultMissing.current.isFeatureAvailable("CHAT")
    );
  });

  it("should handle empty string corpusId as no corpus", () => {
    const { result } = renderHook(() => useFeatureAvailability(""));

    expect(result.current.isFeatureAvailable("CHAT")).toBe(false);
    expect(result.current.isFeatureAvailable("DOCUMENT_VIEW")).toBe(true);
  });
});
