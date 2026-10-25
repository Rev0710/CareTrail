const apiUrl = import.meta.env.VITE_API_URL;

if (!apiUrl) {
  throw new Error("Missing VITE_API_URL");
}

export async function checkDatabase() {
  const response = await fetch(
    `${apiUrl.replace(/\/$/, "")}/api/health/database`
  );

  if (!response.ok) {
    throw new Error("Database connection check failed");
  }

  return response.json() as Promise<{
    status: string;
    message: string;
  }>;
}