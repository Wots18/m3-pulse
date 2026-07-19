// Frontend configuration - all values from environment variables
// Vite requires VITE_ prefix for env variables

export const config = {
  // API
  apiUrl: import.meta.env.VITE_API_URL || '/api',

  // App Info
  appName: import.meta.env.VITE_APP_NAME || 'M3 PRICECALL',
  appSubtitle: import.meta.env.VITE_APP_SUBTITLE || 'PRICE PREDICTION',

  // Token
  tokenSymbol: import.meta.env.VITE_TOKEN_SYMBOL || 'UCT',
  tokenName: import.meta.env.VITE_TOKEN_NAME || 'UCT Token',

  // Refetch intervals (in milliseconds)
  refetchCurrentRound: parseInt(import.meta.env.VITE_REFETCH_CURRENT_ROUND || '5000', 10),
  refetchPreviousRound: parseInt(import.meta.env.VITE_REFETCH_PREVIOUS_ROUND || '30000', 10),
  refetchHistory: parseInt(import.meta.env.VITE_REFETCH_HISTORY || '30000', 10),

  // Stale time for queries (milliseconds)
  staleTime: parseInt(import.meta.env.VITE_STALE_TIME || '5000', 10),

  // UI
  maxBetAmount: parseInt(import.meta.env.VITE_MAX_BET_AMOUNT || '99999', 10),
  historyLimit: parseInt(import.meta.env.VITE_HISTORY_LIMIT || '12', 10),
} as const;

// Type for config
export type Config = typeof config;
