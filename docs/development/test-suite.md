Our test suite is a bit sparse, but we're working to improve coverage on the backend. Frontend tests will likely take
longer to implement. Our existing tests do test imports and a number of the utility functions for manipulating
annotations. These tests are integrated in our GitHub actions.

NOTE, **use Python 3.10 or above** as pydantic and certain pre-3.10 type annotations do not play well.
using `from __future__ import annotations` doesn't always solve the problem, and upgrading to Python 3.10
was a lot easier than trying to figure out why the `from __future__` didn't behave as expected

To run the tests, check your test coverage, and generate an HTML coverage report:

```commandline
 $ docker-compose -f local.yml run django coverage run -m pytest
 $ docker-compose -f local.yml run django coverage html
 $ open htmlcov/index.html
```

To run a specific test (e.g. test_analyzers):

```commandline
 $ sudo docker-compose -f local.yml run django python manage.py test opencontractserver.tests.test_analyzers --noinput
```
