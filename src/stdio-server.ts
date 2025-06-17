import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts"
import { BlockchainService } from "./blockchain.ts"
import { tools } from "./tools.ts"
import { getErrorMessage } from "./utils.ts"
import { animalGroups } from "./animalGroups.ts"
import { getPrompt, prompts } from "./prompts.ts"

// Load environment variables
await load()

// Server info
const serverInfo = {
  name: "mcp-server-basics",
  version: "1.0.0",
}

// Initialize services
const blockchainService = new BlockchainService()

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

// Main stdio server loop
async function runStdioServer() {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  // Log to stderr to avoid interfering with JSON-RPC messages
  console.error("MCP Server (stdio transport) started")
  console.error(`Protocol version: 2025-03-26`)

  // Read from stdin line by line
  const stdin = Deno.stdin.readable
  const reader = stdin.getReader()
  let buffer = ""

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      // Decode the chunk and add to buffer
      buffer += decoder.decode(value, { stream: true })

      // Process complete lines
      const lines = buffer.split("\n")
      buffer = lines.pop() || "" // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmedLine = line.trim()
        if (!trimmedLine) continue

        try {
          // Parse JSON-RPC message
          const message = JSON.parse(trimmedLine)

          // Handle the message
          const response = await handleJsonRpc(message)

          // Write response to stdout if there is one
          if (response) {
            await Deno.stdout.write(
              encoder.encode(JSON.stringify(response) + "\n"),
            )
          }
        } catch (error) {
          // Log parsing errors to stderr
          console.error("Error parsing JSON-RPC message:", error)

          // Send parse error response
          const errorResponse = {
            jsonrpc: "2.0",
            error: {
              code: -32700,
              message: "Parse error",
            },
          }
          await Deno.stdout.write(
            encoder.encode(JSON.stringify(errorResponse) + "\n"),
          )
        }
      }
    }
  } catch (error) {
    console.error("Fatal error in stdio server:", error)
  } finally {
    reader.releaseLock()
  }
}

// Start the stdio server
if (import.meta.main) {
  await runStdioServer()
}
