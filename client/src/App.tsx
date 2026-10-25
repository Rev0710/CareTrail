import { useState } from "react";

function App() {
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);

  async function checkConnection() {
    setChecking(true);
    setMessage("Connecting...");

    try {
      const apiUrl = import.meta.env.VITE_API_URL;

      if (!apiUrl) {
        throw new Error("VITE_API_URL is missing in Vercel.");
      }

      const response = await fetch(
        `${apiUrl.replace(/\/$/, "")}/api/health/database`
      );

      if (!response.ok) {
        throw new Error(`Backend returned status ${response.status}.`);
      }

      const data = await response.json();
      setMessage(data.message);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Connection failed."
      );
    } finally {
      setChecking(false);
    }
  }

  return (
    <main>
      <h1>CareTrail</h1>
      <p>Check the connection to our backend and database.</p>

      <button onClick={checkConnection} disabled={checking}>
        {checking ? "Checking..." : "Check connection"}
      </button>

      <p role="status">{message}</p>
    </main>
  );
}

export default App;