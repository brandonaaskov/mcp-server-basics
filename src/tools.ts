// MCP Tools definitions - Get block information from Avalanche

export const tools = [
  {
    name: "get_block",
    description:
      "Get block information from Avalanche C-Chain. Returns the latest block by default, or a specific block if blockNumber is provided.",
    inputSchema: {
      type: "object",
      properties: {
        blockNumber: {
          type: "number",
          description:
            "The block number to fetch (optional, defaults to latest block)",
        },
      },
      required: [],
    },
    annotations: {
      readOnly: true,
      destructive: false,
    },
  },
]
