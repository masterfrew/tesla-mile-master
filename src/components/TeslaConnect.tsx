// src/components/TeslaConnectButton.tsx
import React, { useState } from "react"

export default function TeslaConnectButton() {
  const [busy, setBusy] = useState(false)

  async function go() {
    setBusy(true)
    try {
      const res = await fetch("/functions/v1/tesla-oauth/authorize")
      if (!res.ok) throw new Error("authorize-failed")
      const payload = await res.json()
      const url = payload.url as string
      if (!url) throw new Error("no-url")
      window.location.href = url
    } catch (e) {
      console.error("connect-error", e)
      setBusy(false)
      // client should surface an error; component stays minimal
    }
  }

  return (
    <button
      onClick={go}
      disabled={busy}
      className="px-3 py-2 rounded-xl border"
      aria-busy={busy}
    >
      {busy ? "Redirecting..." : "Connect your Tesla"}
    </button>
  )
}
