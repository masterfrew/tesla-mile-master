import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";
import type { Algorithm } from "https://deno.land/x/djwt@v2.8/mod.ts";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

// Cache the token in memory for reuse during a single execution
let cachedToken: string | null = null;
let tokenExpiry: number = 0;

function getServiceAccount() {
  // Try env variable first (preferred for edge functions)
  const envJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (envJson) {
    try {
      return JSON.parse(envJson);
    } catch {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
    }
  }
  throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env variable is not set');
}

export async function getGoogleAuthToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  if (cachedToken && now < tokenExpiry - 60) {
    return cachedToken;
  }

  const serviceAccount = getServiceAccount();

  const iat = now;
  const exp = now + 3600; // 1 hour

  const jwtHeader = { alg: "RS256" as Algorithm, typ: "JWT" };
  const jwtPayload = {
    iss: serviceAccount.client_email,
    scope: SCOPES.join(" "),
    aud: serviceAccount.token_uri,
    exp,
    iat,
  };

  const signedJwt = await create(jwtHeader, jwtPayload, serviceAccount.private_key);

  const response = await fetch(serviceAccount.token_uri, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signedJwt,
    }),
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(`Google Auth failed: ${JSON.stringify(data)}`);
  }

  cachedToken = data.access_token;
  tokenExpiry = now + data.expires_in;

  return data.access_token;
}

export async function appendToSheet(spreadsheetId: string, range: string, values: unknown[]) {
  const token = await getGoogleAuthToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      values: Array.isArray(values[0]) ? values : [values],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Failed to append to sheet: ${errorText}`);
    throw new Error(`Failed to append to sheet: ${errorText}`);
  }

  return await response.json();
}
