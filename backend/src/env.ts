import dotenv from 'dotenv';
dotenv.config();

// Export all config from one place - ensures dotenv is loaded first
export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/single-digit-lottery',
  nodeEnv: process.env.NODE_ENV || 'development',
  mockMode: process.env.MOCK_MODE === 'true',

  // Agent
  agentNametag: process.env.AGENT_NAMETAG || 'lotterybet',
  agentPrivateKey: process.env.AGENT_PRIVATE_KEY || '',
  agentMnemonic: process.env.AGENT_MNEMONIC || '',

  // Nostr
  nostrRelayUrl: process.env.NOSTR_RELAY_URL || 'wss://nostr-relay.testnet.unicity.network',

  // Aggregator
  aggregatorUrl: process.env.AGGREGATOR_URL || 'https://goggregator-test.unicity.network',
  aggregatorApiKey: process.env.AGGREGATOR_API_KEY || '',

  // Payment
  coinId: process.env.COIN_ID || '455ad8720656b08e8dbd5bac1f3c73eeea5431565f6c1c3af742b1aa12d41d89',
  paymentTimeoutSeconds: parseInt(process.env.PAYMENT_TIMEOUT_SECONDS || '120', 10),

  // Round
  roundDurationSeconds: parseInt(process.env.ROUND_DURATION_SECONDS || '300', 10),

  // Price market
  priceAsset: process.env.PRICE_ASSET || 'BTC',

  // House fee (percentage of winning pool retained by developers)
  houseFeePercent: parseFloat(process.env.HOUSE_FEE_PERCENT || '5'),
  developerNametag: process.env.DEVELOPER_NAMETAG || '',

  // Data
  dataDir: process.env.DATA_DIR || './data',
  trustBasePath: process.env.TRUSTBASE_PATH || './dist/trustbase-testnet.json',

  // CORS
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:5174').split(
    ','
  ),
};
