# Deployment Guide

This guide covers deploying the Moneko OpenAI App SDK to production.

## Prerequisites

1. **Supabase CLI** installed:
   ```bash
   npm install -g supabase
   # or
   brew install supabase/tap/supabase
   ```

2. **Supabase Project** with:
   - Functions enabled
   - Service role API key
   - Project reference ID

3. **Node.js 18+** and **pnpm** installed

## Environment Configuration

Create environment files with your Supabase credentials:

### `server/.env` (Default)
```bash
# Supabase Edge Function Configuration
EDGE_BASE_URL=https://your-project-ref.supabase.co/functions/v1
EDGE_API_KEY=your_supabase_service_role_key

# Server Configuration
LOG_LEVEL=info
PORT=8000
```

### `prod.env` (Production)
```bash
EDGE_BASE_URL=https://your-prod-project.supabase.co/functions/v1
EDGE_API_KEY=your_prod_service_role_key
LOG_LEVEL=warn
PORT=8000
```

### `staging.env` (Staging)
```bash
EDGE_BASE_URL=https://your-staging-project.supabase.co/functions/v1
EDGE_API_KEY=your_staging_service_role_key
LOG_LEVEL=info
PORT=8000
```

## Deployment Methods

### Method 1: Using the Deployment Script (Recommended)

The `deploy.sh` script handles all Supabase function deployments:

```bash
# Deploy using default environment (server/.env)
./deploy.sh

# Deploy using specific environment file
./deploy.sh prod.env
./deploy.sh staging.env
```

### Method 2: Using Package Scripts

From the project root:

```bash
# Deploy to development
pnpm deploy

# Deploy to production
pnpm deploy:prod

# Deploy to staging
pnpm deploy:staging
```

### Method 3: Manual Deployment

```bash
# Set Supabase access token
export SUPABASE_ACCESS_TOKEN=your_service_role_key

# Deploy each function individually
supabase functions deploy gpt-analyze-expense --project-ref your-project-ref
supabase functions deploy gpt-expenses-summary --project-ref your-project-ref
supabase functions deploy gpt-get-budget --project-ref your-project-ref
```

## Available Functions

The following Supabase Edge functions will be deployed:

- `gpt-analyze-expense` - Analyzes and categorizes expenses
- `gpt-expenses-summary` - Generates spending summaries by category
- `gpt-get-budget` - Retrieves budget information and pacing

## Post-Deployment Steps

### 1. Update MCP Server Configuration

Ensure your MCP server points to the deployed Supabase functions:

```bash
# In server/.env
EDGE_BASE_URL=https://your-project-ref.supabase.co/functions/v1
```

### 2. Test the Deployment

```bash
# Start the MCP server
cd server
pnpm dev

# Test locally with curl
curl -X POST https://your-project-ref.supabase.co/functions/v1/get-budget \
  -H "Authorization: Bearer your_service_role_key" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-01-01", "currency": "USD"}'
```

### 3. Update ChatGPT Connector

If using ngrok for local development:
```bash
ngrok http 8000
```

Update your ChatGPT connector URL to:
```
https://your-ngrok-url/mcp
```

For production deployment, you'll need to host your MCP server on a cloud platform.

## Production Hosting Options

### Option 1: Railway
```bash
# Install Railway CLI
npm install -g @railway/cli

# Deploy
railway login
railway link
railway up
```

### Option 2: Render
- Connect your GitHub repository
- Set environment variables
- Deploy as a web service

### Option 3: Vercel
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

## Monitoring and Logs

### Supabase Function Logs
```bash
# View function logs
supabase functions logs gpt-get-budget --project-ref your-project-ref

# View all function logs
supabase functions logs --project-ref your-project-ref
```

### MCP Server Logs
Your MCP server logs will show:
- Function calls from ChatGPT
- Supabase proxy requests
- Error details

## Troubleshooting

### Common Issues

1. **Permission Denied**
   - Ensure you're using the **service role** key, not the anon key
   - Check that the key has proper permissions

2. **Function Not Found**
   - Verify the function was deployed successfully
   - Check the function name matches exactly

3. **CORS Errors**
   - Ensure your Supabase CORS settings allow your domain
   - Check that the MCP server forwards proper headers

4. **Environment Variables Missing**
   - Verify the `.env` file exists and is properly formatted
   - Check that `EDGE_BASE_URL` and `EDGE_API_KEY` are set

### Debug Mode

Enable debug logging by setting:
```bash
LOG_LEVEL=debug
```

### Health Check

Test individual functions:
```bash
# Test budget function
curl -X POST "${EDGE_BASE_URL}/get-budget" \
  -H "Authorization: Bearer ${EDGE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-01-01", "currency": "USD"}'
```

## Security Considerations

1. **API Keys**: Never commit service role keys to version control
2. **Environment Variables**: Use different keys for dev/staging/prod
3. **Access Control**: Implement proper user authentication in functions
4. **Rate Limiting**: Consider implementing rate limiting for production
5. **Monitoring**: Set up alerts for function failures

## Rollback

If you need to rollback a deployment:

```bash
# Redeploy previous version
supabase functions deploy gpt-get-budget --project-ref your-project-ref --version <previous-version>

# Or redeploy from local
supabase functions deploy gpt-get-budget --project-ref your-project-ref
```

## Support

For deployment issues:
1. Check Supabase function logs
2. Verify environment variables
3. Test with curl commands
4. Review MCP server logs

The deployment script provides detailed output to help identify issues.
