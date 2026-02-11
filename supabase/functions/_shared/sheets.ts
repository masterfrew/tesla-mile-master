import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";
import serviceAccount from "./service-account.json" assert { type: "json" };

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

// Cache the token in memory for reuse during a single execution
let cachedToken: string | null = null;
let tokenExpiry: number = 0;

export async function getGoogleAuthToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  if (cachedToken && now < tokenExpiry - 60) {
    return cachedToken;
  }

  const iat = now;
  const exp = now + 3600; // 1 hour

  const jwtHeader = { alg: "RS256", typ: "JWT" };
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

export async function appendToSheet(spreadsheetId: string, range: string, values: any[]) {
  const token = await getGoogleAuthToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      values: [values],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Failed to append to sheet: ${errorText}`);
    throw new Error(`Failed to append to sheet: ${errorText}`);
  }

  return await response.json();
}
