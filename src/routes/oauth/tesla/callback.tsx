import React, { useEffect } from "react"
export default function TeslaOAuthCallback() {
  useEffect(() => {
    window.location.replace("/settings?connected=tesla")
  }, [])
  return <div style={{ padding: 20 }}>Processing…</div>
}
