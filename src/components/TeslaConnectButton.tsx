import React, { useState } from "react"

export default function TeslaConnectButton() {
  const [busy, setBusy] = useState(false)
  async function go() {
    setBusy(true)
    try {
      const r = await fetch("/functions/v1/tesla-oauth/authorize")
      const { url } = await r.json()
      window.location.href = url
    } catch {
      setBusy(false)
    }
  }
  return (
    <button onClick={go} disabled={busy} className="px-3 py-2 rounded-xl border">
      {busy ? "Redirecting..." : "Connect your Tesla"}
    </button>
  )
}
