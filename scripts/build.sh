#!/bin/bash
# NINE Protocol - Build Script

set -e

echo "=== Building NINE Protocol Core ==="

# Clean previous build
rm -rf dist/

# Compile TypeScript
npx tsc

echo "Build complete. Output in ./dist/"
