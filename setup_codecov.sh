#!/bin/bash -x

if [ "$GITHUB_ACTIONS" = "true" ]
then
  curl -o /bin/codecov -Os https://uploader.codecov.io/latest/linux/codecov
  chmod +x /bin/codecov
  echo "INSTALLED CODECOV"
fi
