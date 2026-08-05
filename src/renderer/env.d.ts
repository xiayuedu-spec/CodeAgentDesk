import type { CodeAgentDeskApi } from '../shared/types';

declare global {
  interface Window {
    codeagentdesk: CodeAgentDeskApi;
  }
}

export {};
