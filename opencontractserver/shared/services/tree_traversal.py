"""Permission-filtered traversal for annotation and note trees."""

from typing import Any, Literal

from django_cte import CTE, with_cte

from opencontractserver.shared.services.base import BaseService


class TreeTraversalService(BaseService):
    @classmethod
    def get_nodes(
        cls,
        root: Any,
        user: Any,
        *,
        mode: Literal["descendants", "full", "subtree"],
        text_field: str,
        request: Any = None,
    ) -> list[dict[str, Any]]:
        """Traverse only visible edges, stopping at inaccessible ancestors.

        Filter both terms of the recursive query: a readable root does not
        imply that its children share its analysis/extract privacy. UNION
        deduplication and the ancestor visited set also terminate cycles.
        """
        visible = cls.filter_visible(type(root), user, request=request).order_by()
        fields = ("id", "parent_id", text_field)
        current = visible.filter(pk=root.pk).values(*fields).first()
        if current is None:
            return []

        ancestors = {current["id"]: current}
        if mode != "descendants":
            while current["parent_id"] is not None:
                parent_id = current["parent_id"]
                if parent_id in ancestors:
                    break
                parent = visible.filter(pk=parent_id).values(*fields).first()
                if parent is None:
                    break
                ancestors[parent_id] = parent
                current = parent

        def descendants(cte):
            seed = (
                visible.filter(pk=current["id"])
                if mode == "full"
                else visible.filter(parent_id=root.pk)
            )
            children = cte.join(visible, parent_id=cte.col.id)
            return seed.values(*fields).union(children.values(*fields))

        cte = CTE.recursive(descendants)
        rows = {
            row["id"]: row
            for row in with_cte(cte, select=cte.queryset()).order_by("id")
        }
        if mode == "subtree":
            rows.update(ancestors)
        elif mode == "descendants":
            rows.pop(root.pk, None)
        return [rows[pk] for pk in sorted(rows)]
