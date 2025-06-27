"""Re-export *canonical* JSON-shape types declared in `opencontractserver.types.dicts`.

Keeping a thin wrapper here lets `annotations.models` depend on a *single* import
location while the underlying definitions live in `opencontractserver.types` –
the shared home for all cross-layer data-shape declarations.
"""

from __future__ import annotations

from opencontractserver.types.dicts import BoundingBoxPythonType as BoundingBox
from opencontractserver.types.dicts import (
    OpenContractsSinglePageAnnotationType as SinglePageAnnotationJson,
)
from opencontractserver.types.dicts import TextSpanData as SpanAnnotationJson

MultipageAnnotationJson = dict[int, SinglePageAnnotationJson]

# Re-exported names for external importers.
__all__ = [
    "BoundingBox",
    "SinglePageAnnotationJson",
    "MultipageAnnotationJson",
    "SpanAnnotationJson",
]
