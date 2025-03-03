import logging
import time

from django.db import DEFAULT_DB_ALIAS, connections
from django.test.runner import DiscoverRunner

logger = logging.getLogger(__name__)


class TerminateConnectionsTestRunner(DiscoverRunner):
    """
    Custom test runner that forcibly terminates all database connections
    before attempting to drop the test database.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.connection_termination_attempts = 0
        self.max_termination_attempts = 3

    def teardown_databases(self, old_config, **kwargs):
        """
        Override teardown_databases to terminate connections before dropping the database.
        """
        db_name = connections[DEFAULT_DB_ALIAS].settings_dict["NAME"]

        # Close Django's own connections first
        for conn in connections.all():
            conn.close()

        # Retry termination and dropping multiple times
        for attempt in range(5):
            try:
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

    def _terminate_db_connections(self, db_name):
        """
        Terminate all connections to the specified database.
        """
        with connections[DEFAULT_DB_ALIAS].cursor() as cursor:
            cursor.execute(
                """
                SELECT pg_terminate_backend(pid)
                FROM pg_stat_activity
                WHERE datname = %s AND pid <> pg_backend_pid();
                """,
                [db_name],
            )
            terminated = cursor.rowcount
            logger.info(f"Terminated {terminated} connections to database '{db_name}'.")
