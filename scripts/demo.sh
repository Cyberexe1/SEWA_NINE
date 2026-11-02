#!/bin/bash
# NINE Protocol - Demo Script
# Runs the mesh simulator with a predefined multi-floor topology.

set -e

echo "=== NINE Protocol Demo ==="
echo "Starting mesh simulator with multi-floor topology..."
echo ""

npx ts-node core/simulator/MeshSimulator.ts

echo ""
echo "Demo complete."
