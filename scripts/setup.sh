#!/bin/bash
# NINE Protocol - Development Environment Setup
# Run this once after cloning the repository.

set -e

echo "=== NINE Protocol Setup ==="
echo ""

# Check Node.js version
NODE_VERSION=$(node --version 2>/dev/null || echo "NOT_FOUND")
if [[ "$NODE_VERSION" == "NOT_FOUND" ]]; then
    echo "ERROR: Node.js is not installed. Install Node.js 20+ from https://nodejs.org"
    exit 1
fi
echo "Node.js: $NODE_VERSION"

# Check npm
NPM_VERSION=$(npm --version 2>/dev/null || echo "NOT_FOUND")
echo "npm: $NPM_VERSION"

# Install root dependencies
echo ""
echo "Installing dependencies..."
npm install

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Available commands:"
echo "  npm run build     - Compile TypeScript"
echo "  npm run test      - Run tests"
echo "  npm run simulate  - Run mesh simulator"
echo "  npm run lint      - Lint code"
