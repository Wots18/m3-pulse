import axios from 'axios';
import { config } from '../config';

export const api = axios.create({
  baseURL: config.apiUrl,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Types
export interface Round {
  _id: string;
  roundNumber: number;
  asset: string;
  status: 'open' | 'closed' | 'drawing' | 'paying' | 'completed';
  startPrice: number | null;
  endPrice: number | null;
  winningDirection: 'up' | 'down' | 'flat' | null;
  totalPool: number;
  totalPayout: number;
  houseFee: number;
  startTime: string;
  endTime: string | null;
  drawTime: string | null;
  roundDurationSeconds?: number;
  createdAt: string;
  updatedAt: string;
}

export interface BetItem {
  direction: 'up' | 'down';
  amount: number;
}

export interface Bet {
  _id: string;
  roundId: string | Round;
  roundNumber: number;
  userNametag: string;
  bets: BetItem[];
  totalAmount: number;
  invoiceId: string;
  paymentStatus: 'pending' | 'paid' | 'expired' | 'failed' | 'refunded';
  paymentTxId: string | null;
  refundTxId: string | null;
  refundReason: string | null;
  winnings: number;
  payoutStatus: 'none' | 'pending' | 'sent' | 'confirmed' | 'failed';
  payoutTxId: string | null;
  createdAt: string;
  updatedAt: string;
  // Win/loss result: true = won, false = lost, null = pending (round not completed)
  won: boolean | null;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

// API functions
export const gameApi = {
  getCurrentRound: () => api.get<ApiResponse<Round>>('/game/round'),

  getPreviousRound: () => api.get<ApiResponse<Round | null>>('/game/round/previous'),

  validateNametag: (nametag: string) =>
    api.get<ApiResponse<{ nametag: string; pubkey: string }>>(`/game/validate/${nametag}`),

  placeBets: (userNametag: string, bets: BetItem[]) =>
    api.post<ApiResponse<{ bet: Bet; invoice: { invoiceId: string; amount: number } }>>(
      '/game/bet',
      { userNametag, bets }
    ),

  getRoundHistory: (limit = 10) =>
    api.get<ApiResponse<Round[]>>('/game/history', { params: { limit } }),

  getUserBets: (userNametag: string, limit = 20) =>
    api.get<ApiResponse<Bet[]>>(`/game/bets/${userNametag}`, { params: { limit } }),

  getRoundBets: (roundId: string) =>
    api.get<ApiResponse<Bet[]>>(`/game/round/${roundId}/bets`),

  getUserBetsInCurrentRound: (nametag: string) =>
    api.get<ApiResponse<Bet[]>>(`/game/round/current/bets/${nametag}`),
};
