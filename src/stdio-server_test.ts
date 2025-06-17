import { assertEquals, assertExists } from "@std/assert"

Deno.test("stdio-server: handles initialize request", async () => {
  const process = new Deno.Command("deno", {
    args: [
      "run",
      "--allow-read",
      "--allow-write",
      "--allow-env",
      "--allow-ffi",
      "src/stdio-server.ts",
    ],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn()

  const writer = process.stdin.getWriter()
  const reader = process.stdout.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  // Send initialize request
  const initRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: {
        name: "test-client",
        version: "1.0.0",
      },
    },
  }

  await writer.write(
    encoder.encode(JSON.stringify(initRequest) + "\n"),
  )

  // Read response
  let buffer = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value)
    if (buffer.includes("\n")) break
  }

  const response = JSON.parse(buffer.trim())

  assertEquals(response.jsonrpc, "2.0")
  assertEquals(response.id, 1)
  assertExists(response.result)
  assertEquals(response.result.protocolVersion, "2025-03-26")
  assertExists(response.result.capabilities)
  assertExists(response.result.serverInfo)
  assertEquals(response.result.serverInfo.name, "mcp-server-basics")

  process.kill()
  await process.status
})

Deno.test("stdio-server: handles tools/list request", async () => {
  const process = new Deno.Command("deno", {
    args: [
      "run",
      "--allow-read",
      "--allow-write",
      "--allow-env",
      "--allow-ffi",
      "src/stdio-server.ts",
    ],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn()

  const writer = process.stdin.getWriter()
  const reader = process.stdout.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  // Send tools/list request
  const toolsRequest = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
  }

  await writer.write(
    encoder.encode(JSON.stringify(toolsRequest) + "\n"),
  )

  // Read response
  let buffer = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value)
    if (buffer.includes("\n")) break
  }

  const response = JSON.parse(buffer.trim())

  assertEquals(response.jsonrpc, "2.0")
  assertEquals(response.id, 2)
  assertExists(response.result)
  assertExists(response.result.tools)
  assertEquals(Array.isArray(response.result.tools), true)

  process.kill()
  await process.status
})

Deno.test("stdio-server: handles batch requests", async () => {
  const process = new Deno.Command("deno", {
    args: [
      "run",
      "--allow-read",
      "--allow-write",
      "--allow-env",
      "--allow-ffi",
      "src/stdio-server.ts",
    ],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn()

  const writer = process.stdin.getWriter()
  const reader = process.stdout.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  // Send batch request
  const batchRequest = [
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/list",
    },
    {
      jsonrpc: "2.0",
      id: 4,
      method: "prompts/list",
    },
  ]

  await writer.write(
    encoder.encode(JSON.stringify(batchRequest) + "\n"),
  )

  // Read response
  let buffer = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value)
    if (buffer.includes("\n")) break
  }

  const responses = JSON.parse(buffer.trim())

  assertEquals(Array.isArray(responses), true)
  assertEquals(responses.length, 2)
  assertEquals(responses[0].id, 3)
  assertEquals(responses[1].id, 4)

  process.kill()
  await process.status
})

Deno.test("stdio-server: handles parse errors gracefully", async () => {
  const process = new Deno.Command("deno", {
    args: [
      "run",
      "--allow-read",
      "--allow-write",
      "--allow-env",
      "--allow-ffi",
      "src/stdio-server.ts",
    ],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn()

  const writer = process.stdin.getWriter()
  const reader = process.stdout.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  // Send invalid JSON
  await writer.write(encoder.encode("invalid json\n"))

  // Read error response
  let buffer = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value)
    if (buffer.includes("\n")) break
  }

  const response = JSON.parse(buffer.trim())

  assertEquals(response.jsonrpc, "2.0")
  assertExists(response.error)
  assertEquals(response.error.code, -32700)
  assertEquals(response.error.message, "Parse error")

  process.kill()
  await process.status
})

Deno.test("stdio-server: ignores empty lines", async () => {
  const process = new Deno.Command("deno", {
    args: [
      "run",
      "--allow-read",
      "--allow-write",
      "--allow-env",
      "--allow-ffi",
      "src/stdio-server.ts",
    ],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn()

  const writer = process.stdin.getWriter()
  const reader = process.stdout.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  // Send empty lines followed by valid request
  await writer.write(encoder.encode("\n\n\n"))

  const pingRequest = {
    jsonrpc: "2.0",
    id: 5,
    method: "ping",
  }

  await writer.write(
    encoder.encode(JSON.stringify(pingRequest) + "\n"),
  )

  // Should only get response for the ping
  let buffer = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value)
    if (buffer.includes("\n")) break
  }

  const response = JSON.parse(buffer.trim())

  assertEquals(response.jsonrpc, "2.0")
  assertEquals(response.id, 5)
  assertExists(response.result)

  process.kill()
  await process.status
})
