import React, { useEffect, useState } from "react"
import TeslaConnectButton from "../components/TeslaConnectButton"
import { listTeslaVehicles } from "../hooks/useTesla"

export default function Settings() {
  const [vehicles, setVehicles] = useState<any[]|null>(null)
  const [err, setErr] = useState<string|null>(null)

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get("connected") === "tesla") void fetchVehicles()
  }, [])

  async function fetchVehicles() {
    try {
      const data = await listTeslaVehicles()
      setVehicles(data.response || data)
    } catch (e:any) {
      setErr(String(e.message || e))
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Instellingen</h2>
      <TeslaConnectButton />
      {err && <div style={{ color: "red", marginTop: 12 }}>{err}</div>}
      {vehicles && (
        <div style={{ marginTop: 12 }}>
          <h3>Voertuigen</h3>
          <ul>{vehicles.map((v:any) => <li key={v.id_s || v.id}>{v.display_name || v.vin || v.id_s}</li>)}</ul>
        </div>
      )}
    </div>
  )
}
