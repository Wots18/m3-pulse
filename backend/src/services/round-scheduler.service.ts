import { GameService } from './game.service.js';
import { Round } from '../models/game.model.js';

export class RoundScheduler {
  private timer: NodeJS.Timeout | null = null;
  private roundDurationMs: number;
  private running = false;

  constructor(roundDurationSeconds: number) {
    this.roundDurationMs = roundDurationSeconds * 1000;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // eslint-disable-next-line no-console
    console.log(`[RoundScheduler] Starting with ${this.roundDurationMs / 1000}s rounds`);

    await this.scheduleNextRound();
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.running = false;
    // eslint-disable-next-line no-console
    console.log('[RoundScheduler] Stopped');
  }

  private async scheduleNextRound(): Promise<void> {
    if (!this.running) return;

    // Clear any existing timer
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const round = await GameService.getCurrentRound();
    const roundStartTime = new Date(round.startTime).getTime();
    const now = Date.now();
    const elapsed = now - roundStartTime;
    const remaining = Math.max(1000, this.roundDurationMs - elapsed); // At least 1 second

    // eslint-disable-next-line no-console
    console.log(
      `[RoundScheduler] Round #${round.roundNumber} ends in ${Math.round(remaining / 1000)}s`
    );

    this.timer = setTimeout(async () => {
      await this.executeRoundEnd();
    }, remaining);
  }

  private async executeRoundEnd(): Promise<void> {
    if (!this.running) return;

    try {
      // Get current open round
      const round = await Round.findOne({ status: 'open' });

      if (!round) {
        // eslint-disable-next-line no-console
        console.log('[RoundScheduler] No open round found, creating new one');
        await GameService.createRound();
        await this.scheduleNextRound();
        return;
      }

      // eslint-disable-next-line no-console
      console.log(`[RoundScheduler] Closing round #${round.roundNumber}...`);

      // Close round (atomic update) - may return null if already closed
      const closedRound = await GameService.closeRound(round._id.toString()).catch(() => null);

      if (!closedRound) {
        // eslint-disable-next-line no-console
        console.log(`[RoundScheduler] Round #${round.roundNumber} already processed, skipping...`);
        await this.scheduleNextRound();
        return;
      }

      // eslint-disable-next-line no-console
      console.log(`[RoundScheduler] Round closed, status: ${closedRound.status}`);

      // Draw winner (atomic update)
      // eslint-disable-next-line no-console
      console.log(`[RoundScheduler] Drawing winner for round #${round.roundNumber}...`);
      const drawnRound = await GameService.drawWinner(closedRound._id.toString());

      // eslint-disable-next-line no-console
      console.log(`[RoundScheduler] Winning direction: ${drawnRound.winningDirection}`);

      // Process payouts
      // eslint-disable-next-line no-console
      console.log(`[RoundScheduler] Processing payouts...`);
      const payoutResult = await GameService.processPayouts(closedRound._id.toString());

      // eslint-disable-next-line no-console
      console.log(
        `[RoundScheduler] Payouts: ${payoutResult.processed} processed, ${payoutResult.failed} failed`
      );

      // eslint-disable-next-line no-console
      console.log(`[RoundScheduler] Round #${round.roundNumber} completed!`);

      // Schedule next round
      await this.scheduleNextRound();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[RoundScheduler] Error executing round end:', error);

      // Retry after a delay
      setTimeout(() => {
        this.scheduleNextRound();
      }, 5000);
    }
  }

  getRoundDurationMs(): number {
    return this.roundDurationMs;
  }

  isRunning(): boolean {
    return this.running;
  }
}
