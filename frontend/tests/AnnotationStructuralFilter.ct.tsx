import React, { useEffect } from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { Provider, useStore } from "jotai";

import { AnnotationList } from "../src/components/annotator/display/components/AnnotationList";
import {
  allAnnotationsAtom,
  pdfAnnotationsAtom,
} from "../src/components/annotator/context/AnnotationAtoms";
import { LabelType } from "../src/components/annotator/types/enums";

/* ------------------------------------------------------------------ */
/* helper to fabricate a structural annotation                        */
/* ------------------------------------------------------------------ */
const makeStructural = (id: string, page = 1) => ({
  __typename: "AnnotationType" as const,
  id,
  page,
  structural: true,
  rawText: `Structural annotation ${id}`,
  bounds: {
    __typename: "BoundingBoxType" as const,
    left: 100,
    top: 100,
    right: 200,
    bottom: 150,
    page,
  },
  annotationLabel: {
    __typename: "AnnotationLabelType" as const,
    id: "lbl-struct",
    text: "Structural",
    labelType: LabelType.TokenLabel,
    color: "#000000",
    icon: null,
    description: "Structural label",
  },
  annotationType: "Token",
  approved: false,
  rejected: false,
  annotation_created: new Date().toISOString(),
  isPublic: false,
  myPermissions: [],
});

/* ------------------------------------------------------------------ */
/* wrapper component that seeds atoms exactly once                     */
/* ------------------------------------------------------------------ */
const StructuralFilterTestHarness: React.FC = () => {
  /* obtain jotai store so we can imperatively seed read-only atoms */
  const store = useStore();

  useEffect(() => {
    const annotations = [
      makeStructural("struct-1"),
      makeStructural("struct-2"),
    ];
    store.set(allAnnotationsAtom as any, annotations);
    store.set(pdfAnnotationsAtom as any, { annotations, relations: [] });
  }, [store]);

  return <AnnotationList read_only={false} />;
};

/* wrapper expected by Playwright-CT (root must be a "normal" component) */
const StructuralFilterStory: React.FC = () => (
  <Provider>
    <StructuralFilterTestHarness />
  </Provider>
);

/* ------------------------------------------------------------------ */
/* test                                                               */
/* ------------------------------------------------------------------ */
test("Show Structural toggle hides / shows structural annotations", async ({
  mount,
  page,
}) => {
  await mount(<StructuralFilterStory />);

  /* 1️⃣  Initially structural is OFF -> placeholder visible */
  const placeholder = page.getByText("No Matching Annotations Found");
  await expect(placeholder).toBeVisible();

  /* 2️⃣  Turn structural ON through the popup */
  await page.getByTestId("view-settings-trigger").click();
  await page.getByTestId("toggle-show-structural").click();

  /* 3️⃣  Placeholder disappears, annotations appear           */
  await expect(placeholder).toBeHidden();
  await expect(page.locator('[data-annotation-id="struct-1"]')).toBeVisible();
  await expect(page.locator('[data-annotation-id="struct-2"]')).toBeVisible();
});
