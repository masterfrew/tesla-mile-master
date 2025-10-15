export async function listTeslaVehicles(authHeader?: string) {
  const headers: Record<string,string> = {}
  if (authHeader) headers["Authorization"] = authHeader
  const r = await fetch("/functions/v1/tesla-api/vehicles", { headers })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}
