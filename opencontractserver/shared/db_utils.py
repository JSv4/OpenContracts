from __future__ import annotations

from functools import lru_cache

from django.db import connection


@lru_cache(maxsize=128)
def table_has_column(db_table: str, column_name: str) -> bool:
    """Return True if the given table has the specified column in the current DB.

    Uses the database introspection API; results are cached per process.
    """
    try:
        with connection.cursor() as cursor:
            desc = connection.introspection.get_table_description(cursor, db_table)
            return any(col.name == column_name for col in desc)
    except Exception:
        # If introspection fails (e.g. table not created yet), assume column absent
        return False
