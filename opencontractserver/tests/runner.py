import logging
import time
from django.conf import settings
from django.db import connection, connections
from django.test.runner import DiscoverRunner

logger = logging.getLogger(__name__)

class TerminateConnectionsTestRunner(DiscoverRunner):
    """
    Custom test runner that forcibly terminates all database connections
    before attempting to drop the test database.
    """
    
    def teardown_databases(self, old_config, **kwargs):
        """
        Override teardown_databases to forcibly terminate all connections
        before Django tries to drop the test database.
        """
        # First, close all Django connections
        for conn in connections.all():
            conn.close_if_unusable_or_obsolete()
            conn.close()
        
        # Wait a moment for any async operations to complete
        time.sleep(2)
        
        # Forcibly terminate all other connections to the test database
        db_name = settings.DATABASES["default"]["NAME"]
        with connection.cursor() as cursor:
            logger.info(f"Test runner: Terminating ALL connections to {db_name}")
            
            # Get count of connections
            cursor.execute(
                """
                SELECT COUNT(*) 
                FROM pg_stat_activity 
                WHERE datname = %s AND pid <> pg_backend_pid();
                """,
                [db_name],
            )
            count = cursor.fetchone()[0]
            logger.info(f"Test runner: Found {count} connections to terminate")
            
            if count > 0:
                # Terminate ALL connections to the test database
                cursor.execute(
                    """
                    SELECT pg_terminate_backend(pid)
                    FROM pg_stat_activity
                    WHERE pid <> pg_backend_pid()
                      AND datname = %s;
                    """,
                    [db_name],
                )
                logger.info(f"Test runner: Terminated {count} connections")
        
        # Try multiple times if needed
        for attempt in range(3):
            try:
                # Call the parent method to drop the database
                return super().teardown_databases(old_config, **kwargs)
            except Exception as e:
                if "database is being accessed by other users" in str(e) and attempt < 2:
                    logger.warning(f"Test runner: Database still in use (attempt {attempt+1}), retrying...")
                    time.sleep(3)  # Wait longer
                    
                    # Try terminating connections again
                    with connection.cursor() as cursor:
                        cursor.execute(
                            """
                            SELECT pg_terminate_backend(pid)
                            FROM pg_stat_activity
                            WHERE pid <> pg_backend_pid()
                              AND datname = %s;
                            """,
                            [db_name],
                        )
                else:
                    # If it's not a "database in use" error or we've tried 3 times, re-raise
                    raise 