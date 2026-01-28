#!/bin/bash
# Script to update .env file on EC2 with the correct DATABASE_URL

cd /picwa/Candliq/Candiq-AI

# Backup current .env
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

# Update DATABASE_URL with direct connection and URL-encoded password
sed -i 's|DATABASE_URL=.*|DATABASE_URL=postgresql://postgres:gY4%2FwChqc%40PB5%3Fj@db.bgpjjxehadcowtsvbcge.supabase.co:5432/postgres|' .env

echo "✅ .env file updated successfully!"
echo ""
echo "Current DATABASE_URL:"
grep DATABASE_URL .env
echo ""
echo "To test the connection, run: npm run db:test"
