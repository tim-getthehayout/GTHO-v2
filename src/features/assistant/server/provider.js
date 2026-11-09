/* global AbortSignal */
/** Text provider port: pinned XaiProvider with a per-request 25 s bound. */
import { XaiProvider, RuntimeError } from '../shared.js';
import { PROVIDER_TIMEOUT_MS } from './config.js';
import { feedbackInterview } from './host.js';

export function createProviderPort({ config, fetch = globalThis.fetch, signal, meter, session, timeoutMs = PROVIDER_TIMEOUT_MS }) {
  const xai = new XaiProvider({ apiKey: config.xaiApiKey, model: config.textModel, fetch });
  return async (scope, routing) => {
    if (routing !== 'shared') throw new RuntimeError('shared-routing-only');
    // One bound for the whole request, regardless of the platform wall clock.
    const bound = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)].filter(Boolean));
    return {
      name: 'xai',
      async respond(input, incoming) {
        meter.providerInvoked = true;
        session.live = globalThis.structuredClone(input.session);
        const context = input.session?.intent === 'feedback'
          ? { ...input.context, data: { ...input.context.data, interview: feedbackInterview(input.session) } }
          : input.context;
        return xai.respond({ ...input, context }, AbortSignal.any([bound, incoming].filter(Boolean)));
      },
    };
  };
}
