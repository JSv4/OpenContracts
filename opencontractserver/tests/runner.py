import logging
import time

from django.db import DEFAULT_DB_ALIAS, connections
from django.test.runner import DiscoverRunner

logger = logging.getLogger(__name__)


class TerminateConnectionsTestRunner(DiscoverRunner):
    """
    Custom test runner that gracefully handles database connections
    before attempting to drop the test database.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.connection_termination_attempts = 0
        self.max_termination_attempts = 3

    def teardown_databases(self, old_config, **kwargs):
        """
        Override teardown_databases to gracefully close connections before dropping the database.
        """
        db_name = connections[DEFAULT_DB_ALIAS].settings_dict["NAME"]

        # Close Django's own connections first
        for conn in connections.all():
            conn.close_if_unusable_or_obsolete()
            conn.close()

        # Retry termination and dropping multiple times
        for attempt in range(5):
            try:
                # First check for active queries and wait for them to complete
                if self._has_active_queries(db_name):
                    logger.warning(
                        f"Waiting for active queries to complete on {db_name}..."
                    )
                    time.sleep(2)
                    continue

                # Wait a bit longer to ensure all queries have finished
                time.sleep(0.5)

                # Double-check for any pending transactions
                with connections[DEFAULT_DB_ALIAS].cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT COUNT(*)
                        FROM pg_stat_activity
                        WHERE datname = %s
                          AND pid <> pg_backend_pid()
                          AND xact_start IS NOT NULL;
                        """,
                        [db_name],
                    )
                    transactions_count = cursor.fetchone()[0]
                    if transactions_count > 0:
                        logger.warning(
                            f"Found {transactions_count} pending transactions on {db_name}, waiting..."
                        )
                        time.sleep(2)
                        continue

                # Now terminate idle connections
                self._terminate_db_connections(db_name)

                # Now attempt to drop the database
                return super().teardown_databases(old_config, **kwargs)
            except Exception as e:
                if "being accessed by other users" in str(e):
                    logger.warning(
                        f"Attempt {attempt + 1}: Database still in use, retrying in 2 seconds..."
                    )
                    time.sleep(2)
                else:
                    raise
        # If we reach here, raise an error explicitly
        raise RuntimeError(
            f"Could not drop test database '{db_name}' after multiple attempts."
        )

    def _has_active_queries(self, db_name):
        """
        Check if there are any active queries running on the database.
        """
        with connections[DEFAULT_DB_ALIAS].cursor() as cursor:
            cursor.execute(
                """
                SELECT COUNT(*)
                FROM pg_stat_activity
                WHERE datname = %s
                  AND pid <> pg_backend_pid()
                  AND state = 'active'
                  AND query <> '<IDLE>';
                """,
                [db_name],
            )
            active_count = cursor.fetchone()[0]
            if active_count > 0:
                logger.warning(
                    f"Found {active_count} active queries on database '{db_name}'."
                )
                return True
            return False

    def _terminate_db_connections(self, db_name):
        """
        Terminate all connections to the specified database.
        First try to terminate only idle connections, then all connections if needed.
        Uses a more cautious approach for test databases.
        """
        # First try to terminate only idle connections
        with connections[DEFAULT_DB_ALIAS].cursor() as cursor:
            # Only terminate idle connections that aren't in a transaction
            cursor.execute(
                """
                SELECT pg_terminate_backend(pid)
                FROM pg_stat_activity
                WHERE datname = %s
                  AND pid <> pg_backend_pid()
                  AND state = 'idle'
                  AND xact_start IS NULL; -- Only terminate if not in a transaction
                """,
                [db_name],
            )
            idle_terminated = cursor.rowcount
            logger.info(
                f"Terminated {idle_terminated} idle connections to database '{db_name}'."
            )

        # Wait a bit to allow tasks to complete
        time.sleep(0.5)

        # Check for active/idle in transaction connections
        with connections[DEFAULT_DB_ALIAS].cursor() as cursor:
            cursor.execute(
                """
                SELECT COUNT(*)
                FROM pg_stat_activity
                WHERE datname = %s
                  AND pid <> pg_backend_pid()
                  AND (state = 'active' OR xact_start IS NOT NULL);
                """,
                [db_name],
            )
            active_count = cursor.fetchone()[0]

            if active_count > 0:
                logger.warning(
                    f"Still have {active_count} active connections or transactions. "
                    f"Waiting before terminating..."
                )
                # Give more time for tasks to complete
                time.sleep(1)

        # If we still have active connections, terminate them as a last resort
        with connections[DEFAULT_DB_ALIAS].cursor() as cursor:
            cursor.execute(
                """
                SELECT COUNT(*)
                FROM pg_stat_activity
                WHERE datname = %s AND pid <> pg_backend_pid();
                """,
                [db_name],
            )
            remaining = cursor.fetchone()[0]

            if remaining > 0:
                logger.warning(
                    f"Still have {remaining} active connections to terminate."
                )
                cursor.execute(
                    """
                    SELECT pg_terminate_backend(pid)
                    FROM pg_stat_activity
                    WHERE datname = %s AND pid <> pg_backend_pid();
                    """,
                    [db_name],
                )
                terminated = cursor.rowcount
                logger.info(
                    f"Terminated {terminated} remaining connections to database '{db_name}'."
                )
