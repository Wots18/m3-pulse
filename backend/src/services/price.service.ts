// Live price oracle - fetches real market prices used to resolve rounds.
// This is what makes round resolution genuinely verifiable, unlike a random draw:
// anyone can check the same public price feed and confirm the outcome themselves.
//
// IDs verified live against api.coingecko.com/api/v3/simple/price before shipping.

const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  XRP: 'ripple',
  BNB: 'binancecoin',
  OKB: 'okb',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  TRX: 'tron',
  TON: 'the-open-network',
  DOT: 'polkadot',
  MATIC: 'polygon-ecosystem-token', // Polygon rebranded MATIC -> POL; ticker kept for familiarity
  LINK: 'chainlink',
  AVAX: 'avalanche-2',
  SHIB: 'shiba-inu',
  LTC: 'litecoin',
  BCH: 'bitcoin-cash',
  ATOM: 'cosmos',
  UNI: 'uniswap',
  NEAR: 'near',
  ICP: 'internet-computer',
};

const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price';

export class PriceService {
  // Fetch the current USD price for a supported asset (e.g. 'BTC')
  static async getPrice(asset: string): Promise<number> {
    const coinId = COINGECKO_IDS[asset.toUpperCase()];
    if (!coinId) {
      throw new Error(`Unsupported asset: ${asset}`);
    }

    const url = `${COINGECKO_URL}?ids=${coinId}&vs_currencies=usd`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Price fetch failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as Record<string, { usd: number }>;
    const price = data[coinId]?.usd;

    if (typeof price !== 'number') {
      throw new Error(`Price not found in response for ${asset}`);
    }

    return price;
  }

  static getSupportedAssets(): string[] {
    return Object.keys(COINGECKO_IDS);
  }
}
