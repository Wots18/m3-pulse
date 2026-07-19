import { Sphere, toSmallestUnit, toHumanReadable } from '@unicitylabs/sphere-sdk';
import { createNodeProviders } from '@unicitylabs/sphere-sdk/impl/nodejs';
import type { PaymentRequestResult, TransferResult } from '@unicitylabs/sphere-sdk';
import type { NetworkType } from '@unicitylabs/sphere-sdk';

export interface SphereConfig {
  dataDir: string;
  tokensDir?: string;
  nametag: string;
  mnemonic?: string;
  network?: NetworkType;
  aggregatorApiKey?: string;
  trustBasePath?: string;
  coinId: string;
  paymentTimeoutSeconds: number;
  debug?: boolean;
}

export interface Invoice {
  invoiceId: string;
  amount: number;
  recipientNametag: string;
  status: 'pending' | 'paid' | 'expired';
  createdAt: Date;
  expiresAt: Date;
}

export interface BetDetail {
  direction: 'up' | 'down';
  amount: number;
}

export interface TokenTransfer {
  transferId: string;
  toNametag: string;
  amount: number;
  status: 'pending' | 'sent' | 'confirmed' | 'failed';
  createdAt: Date;
  transactionCount: number;
  sentAmounts: number[];
}

export interface PaymentInfo {
  invoiceId: string;
  txId: string;
  tokenCount: number;
  totalAmount: number;
  receivedAmounts: number[];
}

export type PaymentConfirmedCallback = (paymentInfo: PaymentInfo) => void;

interface PendingPayment {
  requestId: string;
  invoiceId: string;
  userNametag: string;
  amount: number;
  createdAt: number;
  expiresAt: number;
  confirmed: boolean;
}

export class SphereService {
  private sphere: Sphere | null = null;
  private config: SphereConfig;
  private connected = false;
  private onPaymentConfirmed: PaymentConfirmedCallback | null = null;
  private pendingPayments: Map<string, PendingPayment> = new Map();
  private paymentRequestUnsubscribe: (() => void) | null = null;

  constructor(config: SphereConfig) {
    this.config = config;
  }

  setPaymentConfirmedCallback(callback: PaymentConfirmedCallback): void {
    this.onPaymentConfirmed = callback;
  }

  async initialize(): Promise<void> {
    if (this.connected) return;
    try {
      await this.doInitialize();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Sphere not initialized')) {
        console.warn('[SphereService] Detected known SDK restore bug, self-healing...');
        const fs = await import('fs/promises');
        await fs.rm(this.config.dataDir, { recursive: true, force: true }).catch(() => {});
        await this.doInitialize();
      } else {
        throw error;
      }
    }
  }

  private async doInitialize(): Promise<void> {

    const network = this.config.network || 'testnet';
    // eslint-disable-next-line no-console
    console.log(`[SphereService] Initializing with network: ${network}...`);

    // Create all providers using simplified factory
    const providers = createNodeProviders({
      network,
      dataDir: this.config.dataDir,
      tokensDir: this.config.tokensDir || './sphere-tokens',
      transport: {
        debug: this.config.debug ?? true,
      },
      oracle: {
        apiKey: this.config.aggregatorApiKey,
        trustBasePath: this.config.trustBasePath,
        debug: this.config.debug ?? false,
      },
      // L1 not needed for UCT token lottery - omit to disable
    });

    // Initialize Sphere SDK
    // If mnemonic is provided in config, use it; otherwise auto-generate
    // Pass nametag to init so it's registered during wallet creation
    const initOptions = this.config.mnemonic
      ? { ...providers, mnemonic: this.config.mnemonic, nametag: this.config.nametag }
      : { ...providers, autoGenerate: true, nametag: this.config.nametag };

    const { sphere, created, generatedMnemonic } = await Sphere.init(initOptions);

    this.sphere = sphere;
    this.connected = true;

    if (created) {
      // eslint-disable-next-line no-console
      console.log('[SphereService] Created new wallet');
      if (generatedMnemonic) {
        // eslint-disable-next-line no-console
        console.log('[SphereService] =========================================');
        // eslint-disable-next-line no-console
        console.log('[SphereService] SAVE THIS MNEMONIC TO .env AS AGENT_MNEMONIC:');
        // eslint-disable-next-line no-console
        console.log('[SphereService]', generatedMnemonic);
        // eslint-disable-next-line no-console
        console.log('[SphereService] =========================================');
      }
    } else {
      // eslint-disable-next-line no-console
      console.log('[SphereService] Loaded existing wallet');
    }

    // Note: Sphere.init() with nametag parameter now automatically:
    // 1. Registers the nametag in Nostr
    // 2. Mints the nametag NFT token
    // No additional minting is needed here
    const existingNametag = sphere.payments.getNametag();
    if (existingNametag?.token) {
      // eslint-disable-next-line no-console
      console.log(`[SphereService] ✓ Nametag NFT @${existingNametag.name} ready`);
    } else {
      // eslint-disable-next-line no-console
      console.log(
        `[SphereService] Nametag @${this.config.nametag} registered (NFT minting handled by Sphere.init)`
      );
    }

    // Subscribe to incoming transfers
    sphere.on('transfer:incoming', (transfer) => {
      this.handleIncomingTransfer(transfer);
    });

    // Subscribe to payment request responses
    this.paymentRequestUnsubscribe = sphere.payments.onPaymentRequestResponse((response) => {
      this.handlePaymentRequestResponse(response);
    });

    // eslint-disable-next-line no-console
    console.log('[SphereService] Ready');
    // eslint-disable-next-line no-console
    console.log(`[SphereService] Nametag: @${sphere.getNametag() || this.config.nametag}`);
    // eslint-disable-next-line no-console
    console.log(`[SphereService] Address: ${sphere.identity?.address?.slice(0, 20)}...`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleIncomingTransfer(transfer: any): void {
    // eslint-disable-next-line no-console
    console.log(`[SphereService] Incoming transfer: ${transfer.id}`);
    // eslint-disable-next-line no-console
    console.log(`[SphereService] Pending payments count:`, this.pendingPayments.size);

    // Try to match with pending payment
    // eslint-disable-next-line no-console
    console.log(
      `[SphereService] Pending payment requestIds:`,
      Array.from(this.pendingPayments.keys())
    );
    for (const [requestId, pending] of this.pendingPayments) {
      if (pending.confirmed) continue;

      // Check if expired
      if (Date.now() > pending.expiresAt) {
        this.pendingPayments.delete(requestId);
        continue;
      }

      // Match by checking if the transfer amount matches
      const tokens = transfer.tokens || [];
      let totalAmount = 0n;
      const receivedAmounts: number[] = [];

      for (const token of tokens) {
        // Amount may be in format "coinId,amount" or just "amount"
        let amountStr = token.amount || '0';
        if (typeof amountStr === 'string' && amountStr.includes(',')) {
          // eslint-disable-next-line no-console
          console.log(`[SphereService] Parsing amount from coinId,amount format: ${amountStr}`);
          amountStr = amountStr.split(',')[1] || '0';
        }
        const amount = BigInt(amountStr);
        // eslint-disable-next-line no-console
        console.log(
          `[SphereService] Token amount: ${amount.toString()} (${toHumanReadable(amount.toString())} UCT)`
        );
        totalAmount += amount;
        receivedAmounts.push(parseFloat(toHumanReadable(amount.toString())));
      }

      const expectedAmount = toSmallestUnit(pending.amount.toString());
      // eslint-disable-next-line no-console
      console.log(
        `[SphereService] Matching: received=${totalAmount.toString()} vs expected=${expectedAmount} (pending.amount=${pending.amount} UCT)`
      );
      const tolerance = BigInt(1e14); // 0.0001 UCT tolerance

      if (totalAmount >= BigInt(expectedAmount) - tolerance) {
        pending.confirmed = true;

        // eslint-disable-next-line no-console
        console.log(`[SphereService] Payment confirmed for invoice ${pending.invoiceId}`);

        if (this.onPaymentConfirmed) {
          this.onPaymentConfirmed({
            invoiceId: pending.invoiceId,
            txId: transfer.id,
            tokenCount: tokens.length,
            totalAmount: pending.amount,
            receivedAmounts,
          });
        }

        this.pendingPayments.delete(requestId);
        return;
      }
    }

    // eslint-disable-next-line no-console
    console.log('[SphereService] Transfer did not match any pending payment');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handlePaymentRequestResponse(response: any): void {
    // eslint-disable-next-line no-console
    console.log(
      `[SphereService] Payment request response received:`,
      JSON.stringify(response, null, 2)
    );

    // eslint-disable-next-line no-console
    console.log(`[SphereService] Pending payments keys:`, Array.from(this.pendingPayments.keys()));

    // Try to find pending payment by requestId or by iterating
    let pending = this.pendingPayments.get(response.requestId);
    let matchedKey = response.requestId;

    // If not found by requestId, try to match by other fields
    if (!pending) {
      for (const [key, p] of this.pendingPayments) {
        // eslint-disable-next-line no-console
        console.log(
          `[SphereService] Checking pending: key=${key}, invoiceId=${p.invoiceId}, requestId=${p.requestId}`
        );
        // Match by invoiceId or if there's only one pending payment
        if (p.requestId === response.requestId || p.invoiceId === response.requestId) {
          pending = p;
          matchedKey = key;
          break;
        }
      }
    }

    if (!pending) {
      // eslint-disable-next-line no-console
      console.log(
        '[SphereService] No pending payment found for response.requestId:',
        response.requestId
      );
      return;
    }

    // eslint-disable-next-line no-console
    console.log(
      `[SphereService] Found pending payment: invoiceId=${pending.invoiceId}, matchedKey=${matchedKey}`
    );

    if (response.responseType === 'paid' && response.transferId) {
      pending.confirmed = true;
      // eslint-disable-next-line no-console
      console.log(`[SphereService] Payment PAID! transferId=${response.transferId}`);

      if (this.onPaymentConfirmed) {
        this.onPaymentConfirmed({
          invoiceId: pending.invoiceId,
          txId: response.transferId,
          tokenCount: 1,
          totalAmount: pending.amount,
          receivedAmounts: [pending.amount],
        });
      }

      this.pendingPayments.delete(matchedKey);
    } else if (response.responseType === 'rejected') {
      // eslint-disable-next-line no-console
      console.log(`[SphereService] Payment request rejected: ${pending.invoiceId}`);
      this.pendingPayments.delete(matchedKey);
    } else {
      // eslint-disable-next-line no-console
      console.log(`[SphereService] Unhandled response type: ${response.responseType}`);
    }
  }

  async resolvePubkey(nametag: string): Promise<string | null> {
    if (!this.sphere) {
      throw new Error('Sphere not initialized');
    }

    const cleanId = nametag.replace('@unicity', '').replace('@', '').trim();
    // eslint-disable-next-line no-console
    console.log(`[SphereService] Resolving nametag: @${cleanId}...`);

    try {
      const transport = this.sphere.getTransport();
      // eslint-disable-next-line no-console
      console.log(`[SphereService] Transport status:`, transport.getStatus?.() || 'unknown');

      if (transport.resolveNametag) {
        // eslint-disable-next-line no-console
        console.log(`[SphereService] Calling transport.resolveNametag('${cleanId}')...`);
        const pubkey = await transport.resolveNametag(cleanId);
        // eslint-disable-next-line no-console
        console.log(`[SphereService] resolveNametag returned:`, pubkey);
        if (pubkey) {
          // eslint-disable-next-line no-console
          console.log(`[SphereService] Resolved @${cleanId} -> ${pubkey.slice(0, 16)}...`);
          return pubkey;
        }
      } else {
        // eslint-disable-next-line no-console
        console.log(`[SphereService] Transport does not have resolveNametag method`);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[SphereService] Error resolving nametag:`, error);
    }

    // eslint-disable-next-line no-console
    console.log(`[SphereService] Nametag @${cleanId} not found`);
    return null;
  }

  async validateNametag(
    nametag: string
  ): Promise<{ valid: boolean; pubkey?: string; error?: string }> {
    if (!this.connected || !this.sphere) {
      return { valid: false, error: 'Sphere service not connected' };
    }

    const pubkey = await this.resolvePubkey(nametag);
    if (pubkey) {
      return { valid: true, pubkey };
    }
    return {
      valid: false,
      error: `Nametag @${nametag} not found. Make sure it exists and has Nostr binding.`,
    };
  }

  async createInvoice(
    userNametag: string,
    amount: number,
    bets: BetDetail[],
    roundNumber: number
  ): Promise<Invoice> {
    if (!this.sphere) {
      throw new Error('Sphere not initialized');
    }

    let recipientNametag = this.sphere.getNametag() || this.config.nametag;
    // Remove @ prefix if present - payment request should send nametag without @
    if (recipientNametag.startsWith('@')) {
      recipientNametag = recipientNametag.slice(1);
    }

    // eslint-disable-next-line no-console
    console.log(
      `[SphereService] Creating invoice for @${userNametag}, amount: ${amount}, round #${roundNumber}`
    );
    // eslint-disable-next-line no-console
    console.log(`[SphereService] recipientNametag for payment request: "${recipientNametag}"`);

    // Resolve user's pubkey
    const userPubkey = await this.resolvePubkey(userNametag);
    if (!userPubkey) {
      throw new Error(
        `Nametag @${userNametag} not found. Make sure it exists and has Nostr binding published.`
      );
    }

    // Format bet details for message
    const betsStr = bets.map((b) => `${b.direction}:${b.amount}`).join(', ');
    const amountWithDecimals = toSmallestUnit(amount.toString()).toString();

    // Send payment request via SDK
    const result: PaymentRequestResult = await this.sphere.payments.sendPaymentRequest(
      `@${userNametag}`,
      {
        amount: amountWithDecimals,
        coinId: this.config.coinId,
        recipientNametag,
        message: `M3 PriceCall Round #${roundNumber} - Calls: ${betsStr}`,
      }
    );

    if (!result.success || !result.requestId) {
      throw new Error(result.error || 'Failed to send payment request');
    }

    const invoiceId = result.eventId || result.requestId;
    const requestId = result.requestId!;

    // eslint-disable-next-line no-console
    console.log(`[SphereService] Payment request sent:`);
    // eslint-disable-next-line no-console
    console.log(`[SphereService]   eventId: ${result.eventId}`);
    // eslint-disable-next-line no-console
    console.log(`[SphereService]   requestId: ${requestId}`);
    // eslint-disable-next-line no-console
    console.log(`[SphereService]   invoiceId: ${invoiceId}`);

    // Track pending payment
    const pending: PendingPayment = {
      requestId,
      invoiceId,
      userNametag,
      amount,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.config.paymentTimeoutSeconds * 1000,
      confirmed: false,
    };

    this.pendingPayments.set(requestId, pending);
    // eslint-disable-next-line no-console
    console.log(
      `[SphereService] Added pending payment: requestId=${requestId}, amount=${amount} UCT, expires in ${this.config.paymentTimeoutSeconds}s`
    );
    // eslint-disable-next-line no-console
    console.log(`[SphereService] Total pending payments: ${this.pendingPayments.size}`);

    // Set up timeout cleanup
    setTimeout(() => {
      const p = this.pendingPayments.get(requestId);
      if (p && !p.confirmed) {
        this.pendingPayments.delete(requestId);
        // eslint-disable-next-line no-console
        console.log(`[SphereService] Payment request expired: ${invoiceId}`);
      }
    }, this.config.paymentTimeoutSeconds * 1000);

    return {
      invoiceId,
      amount,
      recipientNametag,
      status: 'pending',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.config.paymentTimeoutSeconds * 1000),
    };
  }

  async sendTokens(toNametag: string, amount: number): Promise<TokenTransfer> {
    if (!this.sphere) {
      throw new Error('Sphere not initialized');
    }

    // eslint-disable-next-line no-console
    console.log(`[SphereService] Sending ${amount} UCT to @${toNametag}...`);

    const amountWithDecimals = toSmallestUnit(amount.toString()).toString();

    try {
      const result: TransferResult = await this.sphere.payments.send({
        coinId: this.config.coinId,
        amount: amountWithDecimals,
        recipient: `@${toNametag}`,
      });

      // eslint-disable-next-line no-console
      console.log(`[SphereService] Transfer complete: ${result.id}`);

      return {
        transferId: result.id,
        toNametag,
        amount,
        status: result.status === 'completed' ? 'confirmed' : 'sent',
        createdAt: new Date(),
        transactionCount: result.tokens.length,
        sentAmounts: result.tokens.map((t) => parseFloat(toHumanReadable(t.amount))),
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[SphereService] Transfer failed:`, error);
      throw error;
    }
  }

  getNametag(): string {
    return this.sphere?.getNametag() || this.config.nametag;
  }

  getPublicKey(): string {
    if (!this.sphere?.identity) {
      throw new Error('Sphere not initialized');
    }
    return this.sphere.identity.publicKey;
  }

  disconnect(): void {
    if (this.paymentRequestUnsubscribe) {
      this.paymentRequestUnsubscribe();
      this.paymentRequestUnsubscribe = null;
    }

    if (this.sphere) {
      this.sphere.destroy();
      this.sphere = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
