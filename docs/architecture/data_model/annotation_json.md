# Annotation `json` Payloads

This document formalises **the implicit contract** that exists between the backend `Annotation` model (Python / Django), the GraphQL API and the TypeScript client regarding the run-time structure stored in/served from the `json` column of the `annotations_annotation` table.

> Although the column is implemented as an un-typed `JSONField` in Django/PostgreSQL _(which is necessary for performance and flexibility reasons)_, *its contents **are** well defined*: the value **must** be one of two shapes depending on the label type attached to the annotation. This page codifies that rule so that it is easily discoverable and can be enforced by static tooling on both sides of the API boundary.

---

## Quick reference

| `Annotation.annotation_type` (`AnnotationLabel.label_type`) | Concrete JSON type stored in `Annotation.json` | TS counterpart | Description |
| ----------------------------------------------------------- | ---------------------------------------------- | -------------- | ----------- |
| `"TOKEN_LABEL"`                                            | **MultipageAnnotationJson**                    | `MultipageAnnotationJson` (TS) | Page-indexed map used by token-level annotations. |
| `"SPAN_LABEL"`                                             | **SpanAnnotationJson**                         | `SpanAnnotationJson` (TS)      | Character-offset tuple for span-level annotations. |

Any mismatch **must** be treated as undefined behaviour: the backend will refuse to create such an object in the future and the client should treat it as a data-integrity error.

---

## Detailed schema definitions

### 1. `MultipageAnnotationJson`

Python (for reference – using `typing.TypedDict`):
```python
from typing import Dict, List, TypedDict

class BoundingBox(TypedDict):
    x0: float
    y0: float
    x1: float
    y1: float

SinglePageAnnotationJson = List[BoundingBox]
MultipageAnnotationJson = Dict[int, SinglePageAnnotationJson]
```

TypeScript (already present in `frontend/src/components/types.ts`):
```ts
export type SinglePageAnnotationJson = BoundingBox[];
export type MultipageAnnotationJson = Record<number, SinglePageAnnotationJson>;
```

Semantics:
* **Key** – the 1-indexed page number to which the bounding boxes apply.
* **Value** – an array of bounding boxes (absolute PDF-space coordinates) that collectively represent the token selection on that page.

### 2. `SpanAnnotationJson`

Python:
```python
class SpanAnnotationJson(TypedDict):
    start: int  # inclusive UTF-16 character offset
    end: int    # exclusive UTF-16 character offset
```

TypeScript (already present in `frontend/src/components/types.ts`):
```ts
export type SpanAnnotationJson = {
  start: number;
  end: number;
};
```

Semantics:
* `start` / `end` form a half-open range `[start, end)` **in the raw text of the source document**, expressed in UTF-16 code units (mirroring the browser DOM-selection API).

---

## Backend ↔︎ Frontend conversion pipeline

```mermaid
flowchart TD
    A[Annotation.json (PostgreSQL)] -- raw GraphQL --> B[RawServerAnnotationType]
    B -- convertToServerAnnotation() --> C{Label type?}
    C -- TOKEN_LABEL --> D[ServerTokenAnnotation]
    C -- SPAN_LABEL  --> E[ServerSpanAnnotation]
```

1. The Django GraphQL layer serialises the raw JSON column verbatim onto `RawServerAnnotationType.json`.
2. The React client calls `convertToServerAnnotation()` which:
   * Reads `annotation.annotationType` / `annotation.annotationLabel.labelType`.
   * Down-casts the `json` union to the correct concrete shape and instantiates either `ServerTokenAnnotation` or `ServerSpanAnnotation`.

Because the union narrowing is purely run-time today, **keeping this mapping documented is critical**. `eslint`/`tsc` cannot express the dependency between the two fields, but future work could add custom static assertions.

---

## Future tightening options (non-breaking)

1. **Python typing** – The `Annotation` model can expose helper properties such as:
   ```python
   from typing import Optional, Union

   class Annotation(BaseOCModel):
       # ... existing fields ...

       @property
       def typed_json(self) -> Union[MultipageAnnotationJson, SpanAnnotationJson]:
           return self.json  # type: ignore[return-value]
   ```
   This gives downstream Python code better IntelliSense without penalising DB performance.

2. **GraphQL sub-types** – Split `AnnotationType` into `TokenAnnotationType` and `SpanAnnotationType` inheriting from the same interface. This encodes the invariant at the API layer and removes the need for run-time down-casting on the client.

3. **Runtime validation** – Fast pydantic models or `dataclasses-json` checks can be wired into the serializer save path (behind a feature flag) to reject malformed JSON early.

---
