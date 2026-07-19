import { Sphere, parseTokenAmount, toHumanReadable } from '@unicitylabs/sphere-sdk';
import { createNodeProviders } from '@unicitylabs/sphere-sdk/impl/nodejs';
import { createOwnStorageWalletApiProviders } from '@unicitylabs/sphere-sdk/impl/shared/wallet-api';
import type { TransferResult } from '@unicitylabs/sphere-sdk';
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
  walletApiUrl?: string;
  walletApiDeviceId?: string;
}

export interface Invoice {
  invoiceId: string;
  amount: number;
  recipientNametag: string;
  status: 'pending' | 'paid' | 'expired';
  createdAt: Date;
  expiresAt: Date;
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
      // Known bug in @unicitylabs/sphere-sdk: Sphere.load() tries to auto-repair
      // a missing nametag token by calling mintNametag() before marking the
      // instance as initialized, which always throws "Sphere not initialized".
      // Self-heal by clearing the local wallet cache and forcing a fresh
      // Sphere.create() (which does not have this ordering bug) using the
      // same AGENT_MNEMONIC, so the identity is preserved.
      if (message.includes('Sphere not initialized')) {
        // eslint-disable-next-line no-console
        console.warn(
          '[SphereService] Detected known SDK restore bug (Sphere.load() nametag repair). ' +
            'Clearing local wallet cache and re-initializing from AGENT_MNEMONIC...'
        );
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

    // Create base providers using simplified factory
    const baseProviders = createNodeProviders({
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

    // Compose the wallet-api delivery rail on top. Without this, payments sent
    // by a Connect-connected wallet (e.g. the hosted sphere.unicity.network
    // wallet) would never be seen by this agent - bare createNodeProviders
    // only listens on the Nostr transport, and Connect-originated sends are
    // delivered via the wallet-api mailbox instead. Own-storage preset keeps
    // our existing local wallet.json custody model unchanged; wallet-api is
    // purely an additional delivery/notification rail on top of it.
    const providers = createOwnStorageWalletApiProviders(baseProviders, {
      baseUrl: this.config.walletApiUrl || 'https://wallet-api.unicity.network',
      network: 'testnet2',
      deviceId: this.config.walletApiDeviceId || `m3pricecall-agent-${this.config.nametag}`,
    });

    // Initialize Sphere SDK
    // If mnemonic is provided in config, use it; otherwise auto-generate
    // Pass nametag to init so it's registered during wallet creation
    const initOptions = this.config.mnemonic
      ? { ...providers, mnemonic: this.config.mnemonic, nametag: this.config.nametag, network }
      : { ...providers, autoGenerate: true, nametag: this.config.nametag, network };

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

    // Subscribe to incoming transfers - this is now the only confirmation path.
    // Connect-connected wallets send payment directly via intent('send', ...),
    // matched here by memo (invoiceId), not via a sendPaymentRequest round-trip.
    sphere.on('transfer:incoming', (transfer) => {
      this.handleIncomingTransfer(transfer);
    });

    // eslint-disable-next-line no-console
    console.log('[SphereService] Ready');
    // eslint-disable-next-line no-console
    console.log(`[SphereService] Nametag: @${sphere.getNametag() || this.config.nametag}`);
    // eslint-disable-next-line no-console
    console.log(`[SphereService] Address: ${sphere.identity?.directAddress?.slice(0, 20)}...`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleIncomingTransfer(transfer: any): void {
    // eslint-disable-next-line no-console
    console.log(`[SphereService] Incoming transfer: ${transfer.id}, memo: ${transfer.memo ?? '(none)'}`);
    // eslint-disable-next-line no-console
    console.log(`[SphereService] Pending payments count:`, this.pendingPayments.size);

    const tokens = transfer.tokens || [];
    let totalAmount = 0n;
    const receivedAmounts: number[] = [];

    for (const token of tokens) {
      // Amount may be in format "coinId,amount" or just "amount"
      let amountStr = token.amount || '0';
      if (typeof amountStr === 'string' && amountStr.includes(',')) {
        amountStr = amountStr.split(',')[1] || '0';
      }
      const amount = BigInt(amountStr);
      totalAmount += amount;
      receivedAmounts.push(parseFloat(toHumanReadable(amount.toString())));
    }

    const confirmMatch = (invoiceId: string, pending: PendingPayment): void => {
      pending.confirmed = true;
      // eslint-disable-next-line no-console
      console.log(`[SphereService] Payment confirmed for invoice ${invoiceId} (tx ${transfer.id})`);
      if (this.onPaymentConfirmed) {
        this.onPaymentConfirmed({
          invoiceId,
          txId: transfer.id,
          tokenCount: tokens.length,
          totalAmount: pending.amount,
          receivedAmounts,
        });
      }
      this.pendingPayments.delete(invoiceId);
    };

    // Primary match: exact memo === invoiceId. This is the reliable path for
    // Connect-initiated sends, which carry the invoiceId as the memo.
    if (transfer.memo) {
      const pending = this.pendingPayments.get(transfer.memo);
      if (pending && !pending.confirmed && Date.now() <= pending.expiresAt) {
        confirmMatch(transfer.memo, pending);
        return;
      }
    }

    // Fallback: match by amount, for any transfer that arrived without a
    // recognizable memo. Ambiguous if two pending bets share an amount, so
    // memo match is always preferred when available.
    for (const [invoiceId, pending] of this.pendingPayments) {
      if (pending.confirmed) continue;

      if (Date.now() > pending.expiresAt) {
        this.pendingPayments.delete(invoiceId);
        continue;
      }

      const expectedAmount = parseTokenAmount(pending.amount.toString());
      const tolerance = BigInt(1e14); // 0.0001 UCT tolerance

      if (totalAmount >= BigInt(expectedAmount) - tolerance) {
        confirmMatch(invoiceId, pending);
        return;
      }
    }

    // eslint-disable-next-line no-console
    console.log('[SphereService] Transfer did not match any pending payment');
  }

  // TEMPORARY diagnostic - checks the full resolved peer info (chainPubkey
  // included) for a nametag, not just the transport pubkey. Used to verify
  // whether the chain pubkey is actually published correctly.
  async debugResolvePeer(nametag: string): Promise<unknown> {
    if (!this.sphere) {
      throw new Error('Sphere not initialized');
    }
    const clean = nametag.replace('@', '').trim();
    return this.sphere.resolve(`@${clean}`);
  }

  // TEMPORARY diagnostic - the LOCAL identity object, to compare against
  // what got published on Nostr.
  debugLocalIdentity(): unknown {
    if (!this.sphere) {
      throw new Error('Sphere not initialized');
    }
    return this.sphere.identity;
  }

  // TEMPORARY fix - re-publishes the identity binding now that the wallet-api
  // layer is fully initialized, correcting a binding that was published with
  // empty chainPubkey/directAddress earlier in this session.
  async republishIdentity(nametag: string): Promise<unknown> {
    if (!this.sphere) {
      throw new Error('Sphere not initialized');
    }
    const clean = nametag.replace('@', '').trim();
    await this.sphere.registerNametag(clean);
    return this.sphere.resolve(`@${clean}`);
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

  // Registers an invoiceId to watch for. Used with the Connect payment flow:
  // the frontend sends payment directly via client.intent('send', { memo: invoiceId }),
  // and this just tells handleIncomingTransfer what to match it against - no
  // outbound payment request is sent by the agent.
  registerPendingPayment(invoiceId: string, userNametag: string, amount: number): Invoice {
    if (!this.sphere) {
      throw new Error('Sphere not initialized');
    }

    let recipientNametag = this.sphere.getNametag() || this.config.nametag;
    if (recipientNametag.startsWith('@')) {
      recipientNametag = recipientNametag.slice(1);
    }

    // eslint-disable-next-line no-console
    console.log(
      `[SphereService] Registering pending payment for @${userNametag}, invoice ${invoiceId}, amount: ${amount}`
    );

    const pending: PendingPayment = {
      invoiceId,
      userNametag,
      amount,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.config.paymentTimeoutSeconds * 1000,
      confirmed: false,
    };

    this.pendingPayments.set(invoiceId, pending);
    // eslint-disable-next-line no-console
    console.log(
      `[SphereService] Watching invoice ${invoiceId}: ${amount} UCT, expires in ${this.config.paymentTimeoutSeconds}s`
    );

    setTimeout(() => {
      const p = this.pendingPayments.get(invoiceId);
      if (p && !p.confirmed) {
        this.pendingPayments.delete(invoiceId);
        // eslint-disable-next-line no-console
        console.log(`[SphereService] Pending payment expired: ${invoiceId}`);
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

    const amountWithDecimals = parseTokenAmount(amount.toString()).toString();

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
    return this.sphere.identity.chainPubkey;
  }

  disconnect(): void {
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
