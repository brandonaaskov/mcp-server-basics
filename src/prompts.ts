// Prompt definitions for MCP server
export interface Prompt {
  name: string
  description: string
  arguments?: Array<{
    name: string
    description: string
    required: boolean
  }>
}

export interface PromptMessage {
  role: "user" | "assistant"
  content: {
    type: "text"
    text: string
  }
}

// Available prompts
export const prompts: Prompt[] = [
  {
    name: "explore_block",
    description:
      "Explore blockchain data for a specific block or the latest block",
    arguments: [
      {
        name: "blockNumber",
        description:
          "The block number to explore (optional - defaults to latest)",
        required: false,
      },
    ],
  },
  {
    name: "animal_quiz",
    description: "Create an interactive quiz about animal collective nouns",
    arguments: [
      {
        name: "difficulty",
        description:
          "Quiz difficulty: 'easy' or 'hard' (optional - defaults to easy)",
        required: false,
      },
    ],
  },
]

// Get prompt by name and generate messages
export function getPrompt(
  name: string,
  args?: Record<string, unknown>,
): { description: string; messages: PromptMessage[] } | null {
  const prompt = prompts.find((p) => p.name === name)
  if (!prompt) return null

  switch (name) {
    case "explore_block": {
      const blockNumber = args?.blockNumber as number | undefined
      const blockText = blockNumber
        ? `block number ${blockNumber}`
        : "the latest block"

      return {
        description: prompt.description,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Please fetch and analyze ${blockText} from the Avalanche C-Chain. Use the get_block tool to retrieve the block data, then provide a clear summary including:
- Block number and timestamp
- Number of transactions
- Gas used and gas limit
- Any other interesting details about the block`,
            },
          },
        ],
      }
    }

    case "animal_quiz": {
      const difficulty = args?.difficulty as string | undefined
      const isHard = difficulty === "hard"

      return {
        description: prompt.description,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Create a fun quiz about animal collective nouns using the animal groups resource. ${
                  isHard
                    ? "Make it challenging by asking for less common animals or giving multiple choice with tricky options."
                    : "Keep it simple with well-known animals and provide hints if needed."
                } Start with 3 questions and keep score. Make it interactive and educational!`,
            },
          },
        ],
      }
    }

    default:
      return null
  }
}
