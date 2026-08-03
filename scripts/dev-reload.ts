import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const EMPTY_PARAMETERS = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

export default function devReload(pi: ExtensionAPI): void {
  pi.registerCommand("reload-runtime", {
    description: "Reload the local Chi development extensions",
    handler: async (_args, ctx) => {
      await ctx.reload();
      return;
    },
  });

  pi.registerTool({
    name: "reload_extensions",
    label: "Reload Extensions",
    description: "Reload the local Chi extensions after editing their source files.",
    parameters: EMPTY_PARAMETERS,
    async execute() {
      pi.sendUserMessage("/reload-runtime", { deliverAs: "followUp" });
      return {
        content: [{ type: "text", text: "Queued an extension reload." }],
      };
    },
  });
}
