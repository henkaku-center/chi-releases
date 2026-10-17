import { Plugin } from '@opencode/plugin/tui';
import { Participants, misconfiguredMessage } from './rpc.js';

export default Plugin.define({
  id: 'chi.mentions',
  setup(context) {
    if (!context.prompt?.completions) throw new Error('Chi mentions requires the OpenCode prompt-completion build');
    const directory = context.client.rpc(Participants);
    let notified;
    return context.prompt.completions.register({
      id: 'people',
      async complete({ query, location, signal }) {
        try {
          const items = await directory.complete({ query }, { location, signal });
          notified = undefined;
          return items;
        } catch (error) {
          if (error?.type !== 'misconfigured') throw error;
          const scope = JSON.stringify(location);
          if (!signal.aborted && notified !== scope) {
            notified = scope;
            context.ui.toast.show({ message: misconfiguredMessage, variant: 'warning' });
          }
          return [];
        }
      },
    });
  },
});
