#!/bin/bash
# Script to fix session configuration on EC2

cd /picwa/Candliq || exit 1

echo "🔧 Fixing session configuration..."

# Generate a secure SESSION_SECRET if not already set
if ! grep -q "^SESSION_SECRET=" .env 2>/dev/null || grep -q "change-me-to-a-secure-random-string" .env 2>/dev/null; then
  echo "📝 Generating new SESSION_SECRET..."
  NEW_SECRET=$(openssl rand -hex 32)
  
  # Remove old SESSION_SECRET line if exists
  sed -i '/^SESSION_SECRET=/d' .env
  
  # Add new SESSION_SECRET
  echo "SESSION_SECRET=$NEW_SECRET" >> .env
  echo "✅ SESSION_SECRET generated and added to .env"
else
  echo "✅ SESSION_SECRET already exists in .env"
fi

echo ""
echo "📋 Current .env SESSION_SECRET line:"
grep "^SESSION_SECRET=" .env || echo "⚠️  SESSION_SECRET not found!"

echo ""
echo "✅ Session configuration fix complete!"
echo ""
echo "Next steps:"
echo "1. Rebuild: rm -rf dist node_modules && npm install && npm run build"
echo "2. Restart PM2: pm2 restart all"
echo "3. Check logs: pm2 logs --lines 50"
