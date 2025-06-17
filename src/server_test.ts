import { assertEquals, assertExists } from "@std/assert"

const BASE_URL = "http://127.0.0.1:3001" // Use different port for tests

async function startServer() {
  const process = new Deno.Command("deno", {
    args: [
      "run",
      "--allow-net",
      "--allow-read",
      "--allow-write",
      "--allow-env",
      "--allow-ffi",
      "src/server.ts",
    ],
    env: {
      PORT: "3001",
      BASE_URL: BASE_URL,
    },
    stdout: "piped",
    stderr: "piped",
  }).spawn()

  // Wait for server to start
  await new Promise((resolve) => setTimeout(resolve, 1000))

  return process
}

Deno.test("http-server: validates Accept header", async () => {
  const server = await startServer()

  try {
    // Missing Accept header
    const response1 = await fetch(`${BASE_URL}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
      }),
    })

    assertEquals(response1.status, 400)

    // Wrong Accept header
    const response2 = await fetch(`${BASE_URL}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
      }),
    })

    assertEquals(response2.status, 400)

    // Correct Accept header
    const response3 = await fetch(`${BASE_URL}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
      }),
    })

    assertEquals(response3.status, 200)
  } finally {
    server.kill()
    await server.status
  }
})

Deno.test("http-server: returns 202 for notifications", async () => {
  const server = await startServer()

  try {
    // First get a token
    const registerResponse = await fetch(`${BASE_URL}/oauth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        redirect_uris: ["http://localhost:3000/callback"],
      }),
    })

    const { client_id, client_secret } = await registerResponse.json()

    // Get access token (simplified for testing)
    const _tokenResponse = await fetch(`${BASE_URL}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: "test-code", // This won't work in real scenario
        client_id,
        client_secret,
      }),
    })

    // For actual test, we'll skip auth and test the 202 behavior
    // Send notification (no id field)
    const response = await fetch(`${BASE_URL}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    })

    // Should return 202 Accepted for notifications
    assertEquals(response.status, 202)
    const body = await response.text()
    assertEquals(body, "")
  } finally {
    server.kill()
    await server.status
  }
})

Deno.test("http-server: session management", async () => {
  const server = await startServer()

  try {
    // Initialize and get session ID
    const initResponse = await fetch(`${BASE_URL}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
        },
      }),
    })

    assertEquals(initResponse.status, 200)
    const sessionId = initResponse.headers.get("Mcp-Session-Id")
    assertExists(sessionId)

    // Use session ID in subsequent request
    const pingResponse = await fetch(`${BASE_URL}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Mcp-Session-Id": sessionId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "ping",
      }),
    })

    // Should fail with 401 since we don't have auth token
    assertEquals(pingResponse.status, 401)

    // Delete session
    const deleteResponse = await fetch(`${BASE_URL}/mcp`, {
      method: "DELETE",
      headers: {
        "Mcp-Session-Id": sessionId,
      },
    })

    assertEquals(deleteResponse.status, 204)

    // Try to use deleted session
    const afterDeleteResponse = await fetch(`${BASE_URL}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Mcp-Session-Id": sessionId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "ping",
      }),
    })

    assertEquals(afterDeleteResponse.status, 404)
  } finally {
    server.kill()
    await server.status
  }
})

Deno.test("http-server: GET returns 405", async () => {
  const server = await startServer()

  try {
    const response = await fetch(`${BASE_URL}/mcp`, {
      method: "GET",
      headers: {
        "Accept": "text/event-stream",
      },
    })

    assertEquals(response.status, 405)
    assertEquals(response.headers.get("Allow"), "POST, DELETE, OPTIONS")
  } finally {
    server.kill()
    await server.status
  }
})

Deno.test("http-server: validates Origin header", async () => {
  const server = await startServer()

  try {
    // Invalid origin
    const response1 = await fetch(`${BASE_URL}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Origin": "https://evil.com",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
      }),
    })

    assertEquals(response1.status, 403)

    // Valid origin
    const response2 = await fetch(`${BASE_URL}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Origin": "http://localhost:3000",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
      }),
    })

    assertEquals(response2.status, 200)
  } finally {
    server.kill()
    await server.status
  }
})

Deno.test("http-server: allows initialization without auth", async () => {
  const server = await startServer()

  try {
    const response = await fetch(`${BASE_URL}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
        },
      }),
    })

    assertEquals(response.status, 200)
    const result = await response.json()
    assertEquals(result.jsonrpc, "2.0")
    assertExists(result.result)
    assertEquals(result.result.protocolVersion, "2025-03-26")
  } finally {
    server.kill()
    await server.status
  }
})
