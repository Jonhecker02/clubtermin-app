#!/bin/sh
# Xcode Cloud: runs right after the repo is cloned, before the build.
# The iOS project needs node_modules (Swift packages for the Capacitor
# plugins live there) and the generated capacitor.config.json, and neither is
# committed to git.
set -e

cd "$CI_PRIMARY_REPOSITORY_PATH"

# Xcode Cloud images ship Homebrew but not necessarily Node.
if ! command -v node >/dev/null 2>&1; then
  brew install node
fi

npm ci --ignore-scripts
npx cap sync ios
