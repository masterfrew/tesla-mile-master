# Tesla OAuth2 PKCE Integration - Complete Setup Guide

## 🎯 Overview
This implementation provides a secure Tesla OAuth2 flow with PKCE (Proof Key for Code Exchange) for kmtrack.nl.

## ✅ What's Been Implemented

### 1. Database
- `oauth_pkce_state` table for temporary PKCE state storage (15-minute TTL)
- Secure token storage using Supabase Vault
- Automatic cleanup function for expired states

### 2. Edge Functions

#### `tesla-start` (Initiates OAuth Flow)
- Generates PKCE parameters (state, code_verifier, code_challenge)
- Stores state securely in database
- Returns authorization URL with PKCE challenge
- **Requires JWT authentication** (user must be logged in)

#### `tesla-auth` (Handles Callback)
- Validates state parameter against database
- Retrieves code_verifier for PKCE validation
- Exchanges authorization code for tokens with PKCE
- Stores tokens securely in Vault
- Deletes used state to prevent replay attacks
- **Requires JWT authentication**

### 3. Frontend Components
- `TeslaConnect.tsx` - Updated to call `tesla-start`
- `TeslaCallback.tsx` - Already configured for `/oauth2callback` route

## 📋 Configuration Checklist

### Required Secrets in Supabase (Already Set)
- ✅ `TESLA_CLIENT_ID`
- ✅ `TESLA_CLIENT_SECRET`
- ✅ `TESLA_FLEET_API_BASE_URL` *(use `https://fleet-api.prd.eu.vn.cloud.tesla.com` for EU accounts, `https://fleet-api.prd.na.vn.cloud.tesla.com` for North America)*
- ✅ `SUPABASE_URL`
- ✅ `SUPABASE_SERVICE_ROLE_KEY`

### Tesla Developer Console Settings
1. **Redirect URI**: `https://kmtrack.nl/oauth2callback`
2. **Authorized JavaScript Origins**: `https://kmtrack.nl`

## 🔄 OAuth Flow Diagram

```
User clicks "Connect Tesla"
    ↓
Frontend calls tesla-start Edge Function
    ↓
tesla-start generates PKCE parameters
    ↓
State + code_verifier stored in DB
    ↓
User redirected to Tesla login
    ↓
User approves access
    ↓
Tesla redirects to https://kmtrack.nl/oauth2callback?code=XXX&state=YYY
    ↓
Frontend extracts code + state
    ↓
Frontend calls tesla-auth with code + state
    ↓
tesla-auth validates state, retrieves code_verifier
    ↓
tesla-auth exchanges code for tokens (with PKCE)
    ↓
Tokens stored in Vault
    ↓
User redirected to dashboard
```

## 🧪 Testing Steps

### 1. Start OAuth Flow
1. Login to your app
2. Click "Verbind met Tesla" button
3. **Expected**: Redirected to Tesla login page
4. **Check logs**: `supabase functions logs tesla-start`

### 2. Authorize Access
1. Login with Tesla credentials
2. Approve access for kmtrack.nl
3. **Expected**: Redirected back to `https://kmtrack.nl/oauth2callback?code=...&state=...`

### 3. Token Exchange
1. App automatically calls `tesla-auth`
2. **Expected**: Success message, redirected to dashboard
3. **Check logs**: `supabase functions logs tesla-auth`

## 🔍 Log Examples

### Success Flow (tesla-start)
```
[tesla-start] Initiating Tesla OAuth flow with PKCE
[tesla-start] User authenticated: 2a33aba1-xxxx-xxxx-xxxx-xxxxxxxxxxxx
[tesla-start] Generated PKCE parameters: { state: "abc123...", ... }
[tesla-start] PKCE state stored successfully
[tesla-start] SUCCESS: Redirecting to Tesla authorization
```

### Success Flow (tesla-auth)
```
[tesla-auth] Received callback: { hasCode: true, hasState: true, ... }
[tesla-auth] User authenticated: 2a33aba1-xxxx-xxxx-xxxx-xxxxxxxxxxxx
[tesla-auth] PKCE state validated successfully
[tesla-auth] Used PKCE state deleted
[tesla-auth] Exchanging code for tokens with PKCE...
[tesla-auth] SUCCESS: Received tokens from Tesla
[tesla-auth] Storing tokens for user: 2a33aba1-xxxx...
[tesla-auth] SUCCESS: Tesla tokens stored successfully
```

### Error Examples

#### Missing Code
```
[tesla-auth] ERROR: missing_code
```
**Fix**: Ensure Tesla redirect includes `code` parameter

#### Invalid State
```
[tesla-auth] ERROR: invalid_or_expired_state
```
**Fix**: State expired (>15 min) or already used. Start new flow.

#### Token Exchange Failed
```
[tesla-auth] ERROR: token_exchange_failed
```
**Fix**: Check Tesla credentials, redirect_uri mismatch, or code already used

## 🔐 Security Features

1. **PKCE** - Prevents authorization code interception attacks
2. **State Validation** - Prevents CSRF attacks
3. **Time-Limited States** - 15-minute expiry
4. **One-Time Use** - States deleted after use
5. **User Isolation** - RLS policies ensure users only access their own data
6. **Secure Token Storage** - Tokens encrypted in Supabase Vault
7. **JWT Required** - All endpoints require authenticated user

## 🚨 Common Issues & Fixes

### Issue: "invalid_auth_code"
- **Cause**: Authorization code already used or expired
- **Fix**: Don't refresh the callback page. Start new flow.

### Issue: "redirect_uri_mismatch"
- **Cause**: Redirect URI in token exchange doesn't match authorization request
- **Fix**: Verify both edge functions use `https://kmtrack.nl/oauth2callback`

### Issue: "requested path is invalid"
- **Cause**: Site URL not configured in Supabase
- **Fix**: Set Site URL in Supabase Dashboard → Authentication → URL Configuration

### Issue: Edge Function returns non-2xx status
- **Cause**: Tesla Fleet API region mismatch
- **Fix**: Set `TESLA_FLEET_API_BASE_URL` in Supabase → Project Settings → Configuration → Functions. Use the EU endpoint for European Tesla accounts.

### Issue: User not redirected after success
- **Cause**: TeslaCallback component not handling success
- **Fix**: Check TeslaCallback.tsx redirects to `/` after success

## 📊 Database Queries for Debugging

Check active PKCE states:
```sql
SELECT nonce, user_id, created_at 
FROM oauth_pkce_state 
ORDER BY created_at DESC;
```

Check if tokens are stored:
```sql
SELECT user_id, tesla_token_expires_at 
FROM profiles 
WHERE tesla_token_expires_at IS NOT NULL;
```

Manually clean up expired states:
```sql
SELECT cleanup_expired_pkce_states();
```

## 🔗 Useful Links

- [Tesla Fleet API Docs](https://developer.tesla.com/docs/fleet-api)
- [OAuth 2.0 PKCE Spec](https://oauth.net/2/pkce/)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
