import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const EMPTY_PARAMETERS = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

export default function devReload(pi: ExtensionAPI): void {
  let reloadQueued = false;

  pi.registerCommand("reload-runtime", {
    description: "Reload local Chi development extensions, skills, prompts, themes, and context files",
    handler: async (_args, ctx) => {
      await ctx.reload();
      return;
    },
  });

  pi.registerTool({
    name: "reload_runtime",
    label: "Reload Runtime",
    description:
      "Queue /reload-runtime once to reload local Chi development extensions, skills, prompts, themes, and context files. Do not call repeatedly unless the user reports the reload failed.",
    parameters: EMPTY_PARAMETERS,
    async execute() {
      if (reloadQueued) {
        return {
          content: [{ type: "text", text: "Reload is already queued for this extension instance." }],
        };
      }

      reloadQueued = true;
      pi.sendUserMessage("/reload-runtime", { deliverAs: "followUp" });
      return {
        content: [
          {
            type: "text",
            text: "Queued /reload-runtime as a follow-up command. Future tool calls will use the reloaded extension instance after Pi processes it.",
          },
        ],
      };
    },
  });
}
