import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts"
import { BlockchainService } from "./blockchain.ts"
import { tools } from "./tools.ts"
import { getErrorMessage } from "./utils.ts"
import { animalGroups } from "./animalGroups.ts"
import { getPrompt, prompts } from "./prompts.ts"

// Load environment variables
await load()

const BASE_URL = Deno.env.get("BASE_URL") || "http://localhost:3000"
const PORT = parseInt(Deno.env.get("PORT") || "3000")
const BIND_ADDRESS = "127.0.0.1" // Bind to localhost only for security

// CORS headers for all responses - restricted to localhost
const corsHeaders = {
  "Access-Control-Allow-Origin": "http://localhost:3000, http://127.0.0.1:3000",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Accept, Mcp-Session-Id, X-Requested-With, X-MCP-Proxy-Auth",
  "Access-Control-Max-Age": "86400", // 24 hours
}

// OAuth state storage (in-memory for POC)
const clients = new Map()
const authorizationCodes = new Map()
const accessTokens = new Map()

// Session management
const sessions = new Map<
  string,
  { clientId?: string; createdAt: number; expiresAt: number }
>()

// MCP server state
const serverInfo = {
  name: "mcp-server-basics",
  version: "1.0.0",
}

// Initialize services
const blockchainService = new BlockchainService()

// Track active connections for notifications (basic implementation)
// const activeConnections = new Set<WritableStream>()

// Function to send tool list change notifications
function notifyToolListChanged() {
  const notification = {
    jsonrpc: "2.0",
    method: "notifications/tools/list_changed",
  }

  console.log("Sending tool list changed notification:", notification)

  // In a full implementation, you would send this to all active connections
  // For now, we'll just log it as a placeholder
  // activeConnections.forEach(connection => {
  //   connection.write(JSON.stringify(notification) + "\n")
  // })
}

// Tools are imported from tools.ts

// Handle tool calls
async function handleToolCall(name: string, arguments_: unknown) {
  try {
    switch (name) {
      case "get_block": {
        // Type guard for arguments
        const args = arguments_ as { blockNumber?: number } | undefined
        const blockNumber = args?.blockNumber

        const result = await blockchainService.getBlock(blockNumber)
        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2),
          }],
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error executing tool ${name}: ${getErrorMessage(error)}`,
      }],
    }
  }
}

// Handle JSON-RPC messages (supports batching)
// deno-lint-ignore no-explicit-any
async function handleJsonRpc(messages: any | any[]): Promise<any | any[]> {
  const isBatch = Array.isArray(messages)
  const requests = isBatch ? messages : [messages]
  // deno-lint-ignore no-explicit-any
  const responses: any[] = []

  for (const message of requests) {
    // deno-lint-ignore no-explicit-any
    let response: any = null

    try {
      switch (message.method) {
        case "initialize":
          response = {
            jsonrpc: "2.0",
            id: message.id,
            result: {
              protocolVersion: "2025-03-26",
              capabilities: {
                tools: {
                  listChanged: true, // Enable dynamic tool list notifications
                },
                resources: {},
                prompts: {},
              },
              serverInfo,
            },
          }
          break

        case "tools/list":
          response = {
            jsonrpc: "2.0",
            id: message.id,
            result: { tools },
          }
          break

        case "tools/call":
          try {
            const result = await handleToolCall(
              message.params.name,
              message.params.arguments,
            )
            response = {
              jsonrpc: "2.0",
              id: message.id,
              result,
            }
          } catch (error) {
            response = {
              jsonrpc: "2.0",
              id: message.id,
              error: {
                code: -32603,
                message: getErrorMessage(error),
              },
            }
          }
          break

        case "completions/list":
          response = {
            jsonrpc: "2.0",
            id: message.id,
            result: {
              completions: [],
            },
          }
          break

        case "resources/list":
          response = {
            jsonrpc: "2.0",
            id: message.id,
            result: {
              resources: [
                {
                  uri: "file:///animals/groups",
                  name: "Animal Group Names",
                  description: "Collective nouns for groups of animals",
                  mimeType: "application/json",
                },
              ],
            },
          }
          break

        case "resources/read":
          if (message.params?.uri === "file:///animals/groups") {
            response = {
              jsonrpc: "2.0",
              id: message.id,
              result: {
                contents: [
                  {
                    uri: "file:///animals/groups",
                    mimeType: "application/json",
                    text: JSON.stringify(animalGroups, null, 2),
                  },
                ],
              },
            }
          } else {
            response = {
              jsonrpc: "2.0",
              id: message.id,
              error: {
                code: -32002,
                message: "Resource not found",
                data: {
                  uri: message.params?.uri,
                },
              },
            }
          }
          break

        case "prompts/list":
          response = {
            jsonrpc: "2.0",
            id: message.id,
            result: {
              prompts: prompts.map((p) => ({
                name: p.name,
                description: p.description,
                arguments: p.arguments,
              })),
            },
          }
          break

        case "prompts/get": {
          const promptName = message.params?.name
          const promptArgs = message.params?.arguments

          if (!promptName) {
            response = {
              jsonrpc: "2.0",
              id: message.id,
              error: {
                code: -32602,
                message: "Invalid params: missing prompt name",
              },
            }
          } else {
            const promptResult = getPrompt(promptName, promptArgs)
            if (promptResult) {
              response = {
                jsonrpc: "2.0",
                id: message.id,
                result: promptResult,
              }
            } else {
              response = {
                jsonrpc: "2.0",
                id: message.id,
                error: {
                  code: -32602,
                  message: `Unknown prompt: ${promptName}`,
                },
              }
            }
          }
          break
        }

        case "ping":
          response = {
            jsonrpc: "2.0",
            id: message.id,
            result: {},
          }
          break

        default:
          if (message.id !== undefined) {
            response = {
              jsonrpc: "2.0",
              id: message.id,
              error: {
                code: -32601,
                message: `Method not found: ${message.method}`,
              },
            }
          }
      }

      if (response) {
        responses.push(response)
      }
    } catch (error) {
      if (message.id !== undefined) {
        responses.push({
          jsonrpc: "2.0",
          id: message.id,
          error: {
            code: -32603,
            message: getErrorMessage(error),
          },
        })
      }
    }
  }

  return isBatch ? responses : responses[0]
}

// Streamable HTTP transport handler
async function handleStreamableHttp(
  req: Request,
  sessionId?: string,
): Promise<Response> {
  try {
    const contentType = req.headers.get("content-type") || ""
    const acceptHeader = req.headers.get("accept") || ""

    // Validate Accept header for Streamable HTTP spec compliance
    if (
      !acceptHeader.includes("application/json") ||
      !acceptHeader.includes("text/event-stream")
    ) {
      return new Response(
        "Accept header must include both application/json and text/event-stream",
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    // Handle JSON-RPC requests
    if (contentType.includes("application/json")) {
      const body = await req.json()

      // Check if this is a notification/response only request
      const isBatch = Array.isArray(body)
      const messages = isBatch ? body : [body]
      const hasOnlyNotificationsOrResponses = messages.every(
        // deno-lint-ignore no-explicit-any
        (msg: any) =>
          !msg.method || msg.result !== undefined || msg.error !== undefined,
      )

      if (hasOnlyNotificationsOrResponses) {
        // Process the messages but return 202 Accepted
        await handleJsonRpc(body)
        return new Response(null, {
          status: 202,
          headers: corsHeaders,
        })
      }

      const response = await handleJsonRpc(body)

      // Handle initialization specially - create session
      if (!isBatch && body.method === "initialize" && response?.result) {
        const newSessionId = sessionId || crypto.randomUUID()
        sessions.set(newSessionId, {
          createdAt: Date.now(),
          expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        })

        return new Response(JSON.stringify(response), {
          headers: {
            "Content-Type": "application/json",
            "Mcp-Session-Id": newSessionId,
            ...corsHeaders,
          },
        })
      }

      return new Response(JSON.stringify(response), {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      })
    }

    // Handle streaming requests (JSONL)
    if (
      contentType.includes("application/jsonl") ||
      contentType.includes("application/x-ndjson")
    ) {
      const encoder = new TextEncoder()
      const decoder = new TextDecoder()

      const stream = new TransformStream({
        async transform(chunk, controller) {
          const lines = decoder.decode(chunk).split("\n").filter((line) =>
            line.trim()
          )

          for (const line of lines) {
            try {
              const message = JSON.parse(line)
              const response = await handleJsonRpc(message)
              if (response) {
                controller.enqueue(
                  encoder.encode(JSON.stringify(response) + "\n"),
                )
              }
            } catch (error) {
              console.error("Error processing line:", error)
            }
          }
        },
      })

      return new Response(req.body!.pipeThrough(stream), {
        headers: {
          "Content-Type": "application/jsonl",
          ...corsHeaders,
        },
      })
    }

    return new Response("Unsupported content type", {
      status: 400,
      headers: corsHeaders,
    })
  } catch (error) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32700,
          message: `Parse error ${getErrorMessage(error)}`,
        },
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      },
    )
  }
}

// Generate random string for client secrets and tokens
function generateClientSecret(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let result = ""
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// Main server
Deno.serve({ port: PORT, hostname: BIND_ADDRESS }, async (req) => {
  const url = new URL(req.url)

  // Handle CORS preflight for all paths
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    })
  }

  const headers = {
    "Content-Type": "application/json",
    ...corsHeaders,
  }

  // OAuth endpoints
  if (
    url.pathname === "/.well-known/oauth-authorization-server" &&
    req.method === "GET"
  ) {
    // Step 1: Metadata discovery
    return new Response(
      JSON.stringify({
        issuer: BASE_URL,
        authorization_endpoint: `${BASE_URL}/oauth/authorize`,
        token_endpoint: `${BASE_URL}/oauth/token`,
        registration_endpoint: `${BASE_URL}/oauth/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["client_secret_post"],
        service_documentation: `${BASE_URL}/docs`,
        ui_locales_supported: ["en"],
        op_policy_uri: `${BASE_URL}/policy`,
        op_tos_uri: `${BASE_URL}/tos`,
      }),
      { headers },
    )
  }

  if (url.pathname === "/oauth/register" && req.method === "POST") {
    // Step 2: Client registration
    const body = await req.json()
    const clientId = crypto.randomUUID()
    const clientSecret = generateClientSecret(48)

    clients.set(clientId, {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uris: body.redirect_uris || [],
    })

    return new Response(
      JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uris: body.redirect_uris || [],
      }),
      { headers },
    )
  }

  if (url.pathname === "/oauth/authorize" && req.method === "GET") {
    // Step 3 & 4: Authorization request
    const clientId = url.searchParams.get("client_id")
    const redirectUri = url.searchParams.get("redirect_uri")
    const state = url.searchParams.get("state")
    const scope = url.searchParams.get("scope")
    const codeChallenge = url.searchParams.get("code_challenge")
    const codeChallengeMethod = url.searchParams.get("code_challenge_method")

    if (!clientId || !redirectUri) {
      return new Response("Missing required parameters", {
        status: 400,
        headers: corsHeaders,
      })
    }

    // Generate authorization code
    const code = crypto.randomUUID()
    authorizationCodes.set(code, {
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scope || "",
      code_challenge: codeChallenge || undefined,
      code_challenge_method: codeChallengeMethod || undefined,
      expires_at: Date.now() + 600000, // 10 minutes
    })

    // For POC, auto-approve and redirect with code
    const redirectUrl = new URL(redirectUri)
    redirectUrl.searchParams.set("code", code)
    if (state) {
      redirectUrl.searchParams.set("state", state)
    }

    return Response.redirect(redirectUrl.toString(), 302)
  }

  if (url.pathname === "/oauth/token" && req.method === "POST") {
    // Step 5: Token exchange
    const body = await req.formData()
    const grantType = body.get("grant_type")
    const code = body.get("code")
    const clientId = body.get("client_id")
    const clientSecret = body.get("client_secret")
    const codeVerifier = body.get("code_verifier")
    const redirectUri = body.get("redirect_uri")

    if (grantType !== "authorization_code") {
      return new Response(
        JSON.stringify({
          error: "unsupported_grant_type",
        }),
        { status: 400, headers },
      )
    }

    const codeData = authorizationCodes.get(code as string)
    if (!codeData || codeData.client_id !== clientId) {
      return new Response(
        JSON.stringify({
          error: "invalid_grant",
        }),
        { status: 400, headers },
      )
    }

    // Verify the authorization code hasn't expired
    if (codeData.expires_at < Date.now()) {
      authorizationCodes.delete(code as string)
      return new Response(
        JSON.stringify({
          error: "invalid_grant",
          error_description: "Authorization code expired",
        }),
        { status: 400, headers },
      )
    }

    // Verify redirect_uri matches
    if (redirectUri && codeData.redirect_uri !== redirectUri) {
      return new Response(
        JSON.stringify({
          error: "invalid_grant",
          error_description: "Redirect URI mismatch",
        }),
        { status: 400, headers },
      )
    }

    // Handle PKCE validation if code_challenge was used
    if (codeData.code_challenge) {
      if (!codeVerifier) {
        return new Response(
          JSON.stringify({
            error: "invalid_request",
            error_description: "Code verifier required for PKCE",
          }),
          { status: 400, headers },
        )
      }

      // Verify the code_verifier matches the code_challenge
      const encoder = new TextEncoder()
      const data = encoder.encode(codeVerifier as string)
      const hashBuffer = await crypto.subtle.digest("SHA-256", data)
      const hashArray = new Uint8Array(hashBuffer)
      const computedChallenge = btoa(
        String.fromCharCode(...hashArray),
      ).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")

      if (computedChallenge !== codeData.code_challenge) {
        return new Response(
          JSON.stringify({
            error: "invalid_grant",
            error_description: "Invalid code verifier",
          }),
          { status: 400, headers },
        )
      }
    } else if (!clientSecret) {
      // If not using PKCE, require client_secret
      return new Response(
        JSON.stringify({
          error: "invalid_client",
          error_description: "Client authentication required",
        }),
        { status: 401, headers },
      )
    }

    // If using client_secret (non-PKCE flow), validate it
    if (clientSecret && !codeVerifier) {
      const client = clients.get(clientId as string)
      if (!client || client.client_secret !== clientSecret) {
        return new Response(
          JSON.stringify({
            error: "invalid_client",
          }),
          { status: 401, headers },
        )
      }
    }

    // Generate access token
    const accessToken = generateClientSecret(64)
    accessTokens.set(accessToken, {
      client_id: clientId,
      scope: codeData.scope,
      expires_at: Date.now() + 3600000, // 1 hour
    })

    // Clean up used authorization code
    authorizationCodes.delete(code as string)

    return new Response(
      JSON.stringify({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 3600,
        scope: codeData.scope || undefined,
      }),
      { headers },
    )
  }

  // Health endpoint for MCP Inspector
  if (url.pathname === "/health" && req.method === "GET") {
    return new Response(
      JSON.stringify({
        status: "ok",
        name: serverInfo.name,
        version: serverInfo.version,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      },
    )
  }

  // Server information endpoint (publicly accessible)
  if (url.pathname === "/info" && req.method === "GET") {
    return new Response(
      JSON.stringify({
        name: serverInfo.name,
        version: serverInfo.version,
        protocolVersion: "2025-03-26",
        transport: "streamable-http",
        requiresAuth: true,
        authType: "oauth2",
        authorizationUrl: `${BASE_URL}/.well-known/oauth-authorization-server`,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      },
    )
  }

  // Config endpoint for MCP Inspector
  if (url.pathname === "/config" && req.method === "GET") {
    return new Response(
      JSON.stringify({
        defaultEnvironment: {},
        defaultCommand: "",
        defaultArgs: "",
      }),
      {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      },
    )
  }

  // MCP endpoint with streamable HTTP transport
  if (url.pathname === "/mcp" || url.pathname === "/") {
    // Validate Origin header for security (DNS rebinding protection)
    const origin = req.headers.get("Origin")
    if (
      origin && !origin.startsWith("http://localhost") &&
      !origin.startsWith("http://127.0.0.1")
    ) {
      return new Response("Forbidden: Invalid origin", {
        status: 403,
        headers: corsHeaders,
      })
    }

    // Get session ID from header
    const sessionId = req.headers.get("Mcp-Session-Id") || undefined

    // Check if this is an initialization request
    let isInitRequest = false
    if (req.method === "POST") {
      try {
        const bodyText = await req.clone().text()
        const body = JSON.parse(bodyText)
        isInitRequest =
          (Array.isArray(body) ? body[0] : body)?.method === "initialize"
      } catch {
        // If we can't parse, it's not an init request
      }
    }

    // Session validation (skip for initialization)
    if (sessionId && !isInitRequest) {
      const session = sessions.get(sessionId)
      if (!session || session.expiresAt < Date.now()) {
        sessions.delete(sessionId)
        return new Response("Session not found or expired", {
          status: 404,
          headers: corsHeaders,
        })
      }
    }

    // Require authorization for non-initialization operations
    const authHeader = req.headers.get("Authorization")
    let isAuthenticated = false

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7)
      const tokenData = accessTokens.get(token)

      if (tokenData && tokenData.expires_at > Date.now()) {
        isAuthenticated = true
      }
    }

    // Allow initialization without auth, require auth for everything else
    if (!isInitRequest && !isAuthenticated) {
      return new Response(
        JSON.stringify({
          error: "unauthorized",
          error_description:
            "Authentication required. Please complete OAuth flow.",
        }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            "WWW-Authenticate":
              `Bearer realm="${BASE_URL}", error="invalid_token"`,
            ...corsHeaders,
          },
        },
      )
    }

    // Handle POST requests with streamable HTTP
    if (req.method === "POST") {
      return handleStreamableHttp(req, sessionId)
    }

    // Handle GET requests - return 405 as we don't implement SSE
    if (req.method === "GET") {
      return new Response("Method Not Allowed - SSE not implemented", {
        status: 405,
        headers: {
          "Allow": "POST, DELETE, OPTIONS",
          ...corsHeaders,
        },
      })
    }

    // Handle DELETE requests for session termination
    if (req.method === "DELETE") {
      if (sessionId) {
        sessions.delete(sessionId)
        return new Response(null, {
          status: 204,
          headers: corsHeaders,
        })
      }
      return new Response("No session to terminate", {
        status: 400,
        headers: corsHeaders,
      })
    }
  }

  return new Response("MCP Server - Protocol version 2025-03-26", {
    status: 200,
    headers: corsHeaders,
  })
})

console.log(`MCP Server running on http://${BIND_ADDRESS}:${PORT}`)
console.log(`MCP endpoint: ${BASE_URL}/mcp`)
console.log(`Protocol version: 2025-03-26`)
console.log(`Transport: Streamable HTTP`)

// Send tool list change notification after server startup
// This ensures Claude Desktop refreshes the tool list on connection
setTimeout(() => {
  notifyToolListChanged()
}, 1000) // Send notification 1 second after startup
