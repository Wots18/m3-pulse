import mongoose, { Document, Schema } from 'mongoose';

// Single bet within a round
export interface IBetItem {
  direction: 'up' | 'down';
  amount: number;
}

// Bet document - one per user per round (can contain multiple direction bets)
export interface IBet extends Document {
  roundId: mongoose.Types.ObjectId;
  roundNumber: number;
  userNametag: string;
  bets: IBetItem[];
  totalAmount: number;
  invoiceId: string;
  paymentStatus: 'pending' | 'paid' | 'expired' | 'failed' | 'refunded';
  paymentTxId: string | null;
  refundTxId: string | null;
  refundReason: string | null;
  winnings: number;
  payoutStatus: 'none' | 'pending' | 'sent' | 'confirmed' | 'failed';
  payoutTxId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const betItemSchema = new Schema<IBetItem>(
  {
    direction: {
      type: String,
      required: true,
      enum: ['up', 'down'],
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  { _id: false }
);

const betSchema = new Schema<IBet>(
  {
    roundId: {
      type: Schema.Types.ObjectId,
      ref: 'Round',
      required: true,
      index: true,
    },
    roundNumber: {
      type: Number,
      required: true,
      index: true,
    },
    userNametag: {
      type: String,
      required: true,
      index: true,
    },
    bets: {
      type: [betItemSchema],
      required: true,
      validate: [(v: IBetItem[]): boolean => v.length > 0, 'At least one bet required'],
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 1,
    },
    invoiceId: {
      type: String,
      required: true,
      unique: true,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'expired', 'failed', 'refunded'],
      default: 'pending',
    },
    paymentTxId: {
      type: String,
      default: null,
    },
    refundTxId: {
      type: String,
      default: null,
    },
    refundReason: {
      type: String,
      default: null,
    },
    winnings: {
      type: Number,
      default: 0,
    },
    payoutStatus: {
      type: String,
      enum: ['none', 'pending', 'sent', 'confirmed', 'failed'],
      default: 'none',
    },
    payoutTxId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for finding user bets in a round
betSchema.index({ roundId: 1, userNametag: 1 });

// Round document
export interface IRound extends Document {
  roundNumber: number;
  asset: string;
  status: 'open' | 'closed' | 'drawing' | 'paying' | 'completed';
  startPrice: number | null;
  endPrice: number | null;
  winningDirection: 'up' | 'down' | 'flat' | null;
  totalPool: number;
  totalPayout: number;
  houseFee: number;
  startTime: Date;
  endTime: Date | null;
  drawTime: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const roundSchema = new Schema<IRound>(
  {
    roundNumber: {
      type: Number,
      required: true,
      unique: true,
    },
    asset: {
      type: String,
      required: true,
      default: 'BTC',
    },
    status: {
      type: String,
      enum: ['open', 'closed', 'drawing', 'paying', 'completed'],
      default: 'open',
    },
    startPrice: {
      type: Number,
      default: null,
    },
    endPrice: {
      type: Number,
      default: null,
    },
    winningDirection: {
      type: String,
      enum: ['up', 'down', 'flat'],
      default: null,
    },
    totalPool: {
      type: Number,
      default: 0,
    },
    totalPayout: {
      type: Number,
      default: 0,
    },
    houseFee: {
      type: Number,
      default: 0,
    },
    startTime: {
      type: Date,
      default: Date.now,
    },
    endTime: {
      type: Date,
      default: null,
    },
    drawTime: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Commission tracking for developer withdrawals
export interface ICommission extends Document {
  totalAccumulated: number;
  totalWithdrawn: number;
  lastWithdrawalAt: Date | null;
  updatedAt: Date;
}

const commissionSchema = new Schema<ICommission>(
  {
    totalAccumulated: {
      type: Number,
      default: 0,
    },
    totalWithdrawn: {
      type: Number,
      default: 0,
    },
    lastWithdrawalAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Payment log for tracking all incoming and outgoing payments
export interface IPaymentLog extends Document {
  type: 'incoming' | 'outgoing';
  amount: number;
  fromNametag: string | null;
  toNametag: string | null;
  txId: string;
  relatedBetId: mongoose.Types.ObjectId | null;
  relatedRoundId: mongoose.Types.ObjectId | null;
  purpose: 'bet_payment' | 'payout' | 'refund' | 'commission_withdrawal';
  status: 'pending' | 'confirmed' | 'failed';
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const paymentLogSchema = new Schema<IPaymentLog>(
  {
    type: {
      type: String,
      enum: ['incoming', 'outgoing'],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    fromNametag: {
      type: String,
      default: null,
      index: true,
    },
    toNametag: {
      type: String,
      default: null,
      index: true,
    },
    txId: {
      type: String,
      required: true,
      index: true,
    },
    relatedBetId: {
      type: Schema.Types.ObjectId,
      ref: 'Bet',
      default: null,
    },
    relatedRoundId: {
      type: Schema.Types.ObjectId,
      ref: 'Round',
      default: null,
    },
    purpose: {
      type: String,
      enum: ['bet_payment', 'payout', 'refund', 'commission_withdrawal'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'failed'],
      default: 'confirmed',
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for common queries
paymentLogSchema.index({ createdAt: -1 });
paymentLogSchema.index({ type: 1, createdAt: -1 });

export const Bet = mongoose.model<IBet>('Bet', betSchema);
export const Round = mongoose.model<IRound>('Round', roundSchema);
export const Commission = mongoose.model<ICommission>('Commission', commissionSchema);
export const PaymentLog = mongoose.model<IPaymentLog>('PaymentLog', paymentLogSchema);
