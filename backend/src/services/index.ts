import { config } from '../env.js';
import { SphereService, SphereConfig } from './sphere.service.js';
import { RoundScheduler } from './round-scheduler.service.js';

// eslint-disable-next-line no-console
console.log(`[Config] ROUND_DURATION: ${config.roundDurationSeconds}s`);

const sphereConfig: SphereConfig = {
  network: 'testnet',
  dataDir: config.dataDir,
  tokensDir: `${config.dataDir}/tokens`,
  nametag: config.agentNametag,
  mnemonic: config.agentMnemonic || undefined,
  aggregatorApiKey: config.aggregatorApiKey,
  trustBasePath: config.trustBasePath,
  coinId: config.coinId,
  paymentTimeoutSeconds: config.paymentTimeoutSeconds,
  debug: config.nodeEnv === 'development',
  walletApiUrl: config.walletApiUrl,
  walletApiDeviceId: config.walletApiDeviceId,
};

// Create service instances
export const sphereService = new SphereService(sphereConfig);
export const roundScheduler = new RoundScheduler(config.roundDurationSeconds);

// Initialize services
export async function initializeServices(): Promise<void> {
  await sphereService.initialize();

  // Set up payment confirmation callback - auto-confirm payments via Sphere SDK
  sphereService.setPaymentConfirmedCallback(async (paymentInfo) => {
    const { invoiceId, txId, tokenCount, totalAmount, receivedAmounts } = paymentInfo;
    // eslint-disable-next-line no-console
    console.log(
      `[Services] Payment received: ${totalAmount} UCT (${tokenCount} token${tokenCount > 1 ? 's' : ''}: ${receivedAmounts.join(' + ')}), invoice: ${invoiceId}`
    );

    // Dynamically import to avoid circular dependency
    const { GameService } = await import('./game.service.js');

    try {
      const result = await GameService.confirmPayment(invoiceId, txId, tokenCount, receivedAmounts);

      if (result.accepted) {
        // eslint-disable-next-line no-console
        console.log(`[Services] Payment accepted for invoice: ${invoiceId}`);
      } else {
        // eslint-disable-next-line no-console
        console.log(
          `[Services] Payment rejected for invoice: ${invoiceId} - ${result.refundReason}`
        );
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[Services] Failed to process payment:`, error);
    }
  });

  // Start round scheduler
  await roundScheduler.start();
}

export { SphereService, RoundScheduler };
