#!/bin/bash

# Test runner script with coverage reporting
set -e

echo "🧪 AndozaAI Backend Test Suite"
echo "=================================="
echo ""

# Check if pytest-cov is installed
if ! python -m pip show pytest-cov > /dev/null 2>&1; then
    echo "📦 Installing pytest-cov..."
    pip install -q pytest-cov
fi

echo "📊 Running tests with coverage..."
echo ""

# Run tests with coverage
python -m pytest tests/ \
    --cov=app \
    --cov-report=term-missing \
    --cov-report=html:htmlcov \
    --cov-report=json:coverage.json \
    -v \
    --tb=short

echo ""
echo "✅ Test run complete!"
echo ""
echo "📈 Coverage Reports:"
echo "  - Terminal: Above ⬆️"
echo "  - HTML Report: htmlcov/index.html"
echo "  - JSON Report: coverage.json"
echo ""

# Extract coverage percentage
COVERAGE=$(python -m coverage report | grep "TOTAL" | awk '{print $(NF-2)}' | sed 's/%//')
echo "🎯 Total Coverage: ${COVERAGE}%"
echo ""

if (( $(echo "$COVERAGE < 80" | bc -l) )); then
    echo "⚠️  Coverage is below 80% target. Gaps to address:"
    python -m coverage report | grep -v "100%" | grep -v "TOTAL" | head -10
else
    echo "✨ Coverage target met!"
fi

echo ""
echo "Next steps:"
echo "  1. Review coverage report: open htmlcov/index.html"
echo "  2. Add tests for uncovered modules"
echo "  3. Run: ./run_tests.sh to check progress"
