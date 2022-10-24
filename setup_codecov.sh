#!/bin/bash -x

if $CI
then
  curl -o /bin/codecov -Os https://uploader.codecov.io/latest/linux/codecov
  chmod +x /bin/codecov
  echo "INSTALLED CODECOV"
fi
