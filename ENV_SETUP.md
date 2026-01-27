# Environment Variables Setup Guide

## Required Environment Variables

### For Local Development

The application runs in local development mode. You need to set up these environment variables:

#### 1. Create a `.env` file in the project root:

```env
# Database (REQUIRED)
# Recommended: Use Supabase (see DATABASE_SETUP.md for instructions)
# Supabase connection string format:
# DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres
# 
# For local PostgreSQL:
# DATABASE_URL=postgresql://user:password@localhost:5432/candiq_ai

# Session Secret (REQUIRED - generate a random string)
SESSION_SECRET=your-random-session-secret-here

# AI API Keys (REQUIRED for AI features)
# For Gemini 2.5 Pro (primary LLM for question generation)
GOOGLE_AI_API_KEY=your-google-ai-api-key
# For OpenAI Whisper (audio transcription)
OPENAI_API_KEY=your-openai-api-key
OPENAI_BASE_URL=https://api.openai.com/v1

# Server Port (OPTIONAL)
PORT=5000
```

#### 3. Generate SESSION_SECRET

You can generate a random session secret using:

**PowerShell:**
```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})
```

**Node.js:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Online:**
- Use any secure random string generator (32+ characters)

### Environment Variables Reference

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `DATABASE_URL` | ✅ Yes | PostgreSQL connection string | - |
| `SESSION_SECRET` | ✅ Yes | Secret for session encryption | - |
| `GOOGLE_AI_API_KEY` | ✅ Yes | Google AI API key for Gemini 2.5 Pro | - |
| `OPENAI_API_KEY` | ✅ Yes | OpenAI API key for Whisper transcription | - |
| `OPENAI_BASE_URL` | ⚠️ Optional | OpenAI API base URL | `https://api.openai.com/v1` |
| `PORT` | ⚠️ Optional | Server port | `5000` |

### Troubleshooting

#### Error: Missing DATABASE_URL

**Cause**: Database connection string not configured.

**Solution**:
1. Set up a local PostgreSQL database
2. Add `DATABASE_URL` to `.env`
3. Run migrations: `npm run db:migrate`

#### Error: Missing SESSION_SECRET

**Cause**: Session encryption secret not configured.

**Solution**:
1. Generate a random secret (see above)
2. Add `SESSION_SECRET` to `.env`

### Loading Environment Variables

The application uses `dotenv` to load environment variables. Make sure:

1. `.env` file is in the project root (`Candiq-AI/`)
2. `dotenv` is configured in your entry point (`server/index.ts`)

If you're using a different method to load environment variables, ensure they're available before the server starts.

### Production Deployment

For production deployments:

1. Set environment variables in your hosting platform (Heroku, Railway, Vercel, etc.)
2. Never commit `.env` files to version control
3. Use secure secret management services
4. Rotate secrets regularly

---

## Local Development Authentication

The application uses local authentication for development:

- Users must sign up or log in to access the application
- No automatic dev user is created
- Works in both development and production modes

**Users must create accounts through the signup page** - no default users are created automatically.
