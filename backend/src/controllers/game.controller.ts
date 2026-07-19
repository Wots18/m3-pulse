import { Request, Response } from 'express';
import { GameService } from '../services/game.service.js';
import { sphereService } from '../services/index.js';
import { IBetItem } from '../models/game.model.js';
import { config } from '../env.js';

export class GameController {
  // Validate nametag exists on Nostr
  static async validateNametag(req: Request, res: Response): Promise<void> {
    try {
      const nametag = req.params.nametag as string;

      if (!nametag) {
        res.status(400).json({ success: false, error: 'Nametag is required' });
        return;
      }

      const result = await sphereService.validateNametag(nametag);

      if (result.valid) {
        res.json({ success: true, data: { nametag, pubkey: result.pubkey } });
      } else {
        res.status(404).json({ success: false, error: result.error });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  }
  // Get current round info with duration for timer
  static async getCurrentRound(_req: Request, res: Response): Promise<void> {
    try {
      const round = await GameService.getCurrentRound();
      res.json({
        success: true,
        data: {
          ...round.toObject(),
          roundDurationSeconds: config.roundDurationSeconds,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  }

  // Get previous round with winning number
  static async getPreviousRound(_req: Request, res: Response): Promise<void> {
    try {
      const round = await GameService.getPreviousRound();
      res.json({ success: true, data: round });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  }

  // Place bets - returns invoice for payment
  static async placeBets(req: Request, res: Response): Promise<void> {
    try {
      const { userNametag, bets } = req.body as {
        userNametag: string;
        bets: IBetItem[];
      };

      if (!userNametag || !bets) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: userNametag, bets',
        });
        return;
      }

      const result = await GameService.placeBets(userNametag, bets);
      res.json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ success: false, error: message });
    }
  }

  // Get round history
  static async getRoundHistory(req: Request, res: Response): Promise<void> {
    try {
      const limitParam = req.query.limit;
      const limit = typeof limitParam === 'string' ? parseInt(limitParam, 10) : 10;
      const rounds = await GameService.getRoundHistory(limit);
      res.json({ success: true, data: rounds });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  }

  // Get user bet history with win/loss result
  static async getUserBets(req: Request, res: Response): Promise<void> {
    try {
      const userNametag = req.params.userNametag as string;
      const limitParam = req.query.limit;
      const limit = typeof limitParam === 'string' ? parseInt(limitParam, 10) : 20;
      const bets = await GameService.getUserBets(userNametag, limit);

      // Add 'won' field to each bet
      const betsWithResult = bets.map((bet) => {
        const betObj = bet.toObject();
        const round = betObj.roundId as {
          status?: string;
          winningDirection?: 'up' | 'down' | 'flat' | null;
        } | null;

        // Determine win/loss result
        let won: boolean | null = null;

        if (betObj.paymentStatus === 'paid' && round?.status === 'completed') {
          // Round is completed - we know the result
          won = betObj.winnings > 0;
        }
        // If round is not completed or bet not paid, won remains null (pending)

        return {
          ...betObj,
          won,
        };
      });

      res.json({ success: true, data: betsWithResult });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  }

  // Get bets for a specific round
  static async getRoundBets(req: Request, res: Response): Promise<void> {
    try {
      const roundId = req.params.roundId as string;
      const bets = await GameService.getRoundBets(roundId);
      res.json({ success: true, data: bets });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  }

  // Get user bets in current round
  static async getUserBetsInCurrentRound(req: Request, res: Response): Promise<void> {
    try {
      const nametag = req.params.nametag as string;
      if (!nametag) {
        res.status(400).json({ success: false, error: 'Nametag is required' });
        return;
      }
      const bets = await GameService.getUserBetsInCurrentRound(nametag);
      res.json({ success: true, data: bets });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  }

  // Get commission balance
  static async getCommissionBalance(_req: Request, res: Response): Promise<void> {
    try {
      const balance = await GameService.getCommissionBalance();
      res.json({ success: true, data: balance });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  }

  // Withdraw commission (developer only)
  static async withdrawCommission(req: Request, res: Response): Promise<void> {
    try {
      // Verify developer nametag from request matches config
      const { nametag, amount } = req.body as { nametag: string; amount?: number };

      if (!nametag) {
        res.status(400).json({ success: false, error: 'Developer nametag required' });
        return;
      }

      if (nametag !== config.developerNametag) {
        res.status(403).json({ success: false, error: 'Unauthorized: Invalid developer nametag' });
        return;
      }

      const result = await GameService.withdrawCommission(amount);

      if (result.success) {
        res.json({ success: true, data: result });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  }
}
