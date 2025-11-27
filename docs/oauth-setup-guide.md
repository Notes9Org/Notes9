# OAuth Setup Guide for Google and Microsoft

This guide will help you enable Google and Microsoft OAuth authentication in your Supabase project.

## Prerequisites

You should already have:
- Google OAuth credentials (Client ID and Client Secret)
- Microsoft OAuth credentials (Client ID and Client Secret)

## Step 1: Enable Google OAuth in Supabase

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Navigate to **Authentication** → **Providers**
4. Find **Google** in the list and click on it
5. Toggle **Enable Google provider** to ON
6. Enter your Google OAuth credentials:
   - **Client ID (for OAuth)**: Your Google Client ID
   - **Client Secret (for OAuth)**: Your Google Client Secret
7. Click **Save**

### Google OAuth Redirect URL

The OAuth callback is handled at `/auth/login` in this application. However, Supabase requires the redirect URL to be:
```
https://<your-project-ref>.supabase.co/auth/v1/callback
```

You can find your project reference in your Supabase project settings.

## Step 2: Enable Microsoft OAuth in Supabase

1. In the same **Authentication** → **Providers** page
2. Find **Azure (Microsoft)** in the list and click on it
3. Toggle **Enable Azure provider** to ON
4. Enter your Microsoft OAuth credentials:
   - **Client ID (for OAuth)**: Your Microsoft Client ID
   - **Client Secret (for OAuth)**: Your Microsoft Client Secret
5. Click **Save**

### Microsoft OAuth Redirect URL

The OAuth callback is handled at `/auth/login` in this application. However, Supabase requires the redirect URL to be:
```
https://<your-project-ref>.supabase.co/auth/v1/callback
```

## Step 3: Configure Redirect URLs in OAuth Apps

### Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** → **Credentials**
3. Click on your OAuth 2.0 Client ID
4. Under **Authorized redirect URIs**, add:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
5. Click **Save**

### Microsoft Azure Portal

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Select your app
4. Go to **Authentication**
5. Under **Redirect URIs**, add:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
6. Click **Save**

## Step 4: Test the Integration

1. Start your development server: `pnpm dev`
2. Navigate to `/auth/login` or `/auth/sign-up`
3. Click on "Continue with Google" or "Continue with Microsoft"
4. You should be redirected to the OAuth provider's login page
5. After authentication, you'll be redirected back to your app

## Troubleshooting

### Error: "Unsupported provider: provider is not enabled"

- Make sure you've enabled the provider in Supabase Dashboard (Authentication → Providers)
- Verify the provider toggle is ON
- Check that you've saved the credentials

### Error: "redirect_uri_mismatch"

- Verify the redirect URL in your OAuth app matches exactly:
  ```
  https://<your-project-ref>.supabase.co/auth/v1/callback
  ```
- Make sure there are no trailing slashes or extra characters

### Error: "invalid_client"

- Double-check your Client ID and Client Secret in Supabase
- Verify the credentials are correct in your OAuth provider's console

### Error: "Error getting user email from external provider"

This error means the OAuth provider isn't returning the user's email. Fix it by:

**For Google:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** → **OAuth consent screen**
3. Make sure your app is configured and published (or in testing mode with test users)
4. Under **Scopes**, ensure `email` and `profile` are added
5. Go to **APIs & Services** → **Credentials**
6. Click your OAuth 2.0 Client ID
7. Under **Authorized JavaScript origins**, add your domain
8. Under **Authorized redirect URIs**, ensure the Supabase callback URL is added

**For Microsoft:**
1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Select your app
4. Go to **API permissions**
5. Ensure these permissions are added and granted:
   - `User.Read` (Microsoft Graph)
   - `email` (OpenID Connect)
   - `profile` (OpenID Connect)
6. Click **Grant admin consent** if you're an admin
7. Go to **Authentication** and ensure the redirect URI is correct

## Notes

- The credentials in `.env.local` are **not used** by Supabase for OAuth
- All OAuth configuration must be done in the Supabase Dashboard
- The redirect URL format is always: `https://<project-ref>.supabase.co/auth/v1/callback`
- For local development, Supabase handles the OAuth flow automatically

