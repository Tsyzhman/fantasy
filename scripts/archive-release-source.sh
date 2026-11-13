#!/usr/bin/env bash
# @spec spec://common/INFRA-006-continuous-deployment#contracts
set -euo pipefail

commit=${1:?Git commit is required}
archive=${2:?Archive path is required}

git archive --format=tar.gz --output="$archive" "$commit" -- . \
  ':(exclude)docs/archive' \
  ':(exclude)specs/work/evidence'
