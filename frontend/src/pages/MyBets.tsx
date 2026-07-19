import { Link, useParams } from 'react-router-dom';
import { useUserBets } from '../api/hooks';
import type { Bet, Round } from '../api/client';
import { config } from '../config';

const DIRECTION_COLOR: Record<string, string> = {
  up: '#00ff88',
  down: '#ff6b6b',
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusColor(status: Bet['paymentStatus']): string {
  switch (status) {
    case 'paid': return 'text-green-400';
    case 'pending': return 'text-yellow-400';
    case 'refunded': return 'text-blue-400';
    case 'expired':
    case 'failed': return 'text-red-400';
    default: return 'text-gray-400';
  }
}

function getStatusIcon(status: Bet['paymentStatus']): string {
  switch (status) {
    case 'paid': return '✓';
    case 'pending': return '○';
    case 'refunded': return '↩';
    case 'expired':
    case 'failed': return '✗';
    default: return '?';
  }
}

export function MyBets() {
  const { nametag } = useParams<{ nametag: string }>();
  const { data: bets, isLoading } = useUserBets(nametag, 100);

  // Helper to get round info from populated roundId
  const getRoundInfo = (bet: Bet): { roundNumber: number; winningDirection: 'up' | 'down' | 'flat' | null } | null => {
    if (typeof bet.roundId === 'object' && bet.roundId !== null) {
      const round = bet.roundId as Round;
      return { roundNumber: round.roundNumber, winningDirection: round.winningDirection };
    }
    return bet.roundNumber ? { roundNumber: bet.roundNumber, winningDirection: null } : null;
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-[#0a0a0f] via-[#1a1a2e] to-[#0f0f1a] text-white font-rajdhani">
      {/* Header */}
      <header className="px-6 py-4 flex justify-between items-center border-b border-white/5 bg-black/30">
        <div>
          <h1 className="text-xl font-bold font-orbitron text-[#00ff88]">My Bets</h1>
          <p className="text-xs text-gray-500">@{nametag}</p>
        </div>
        <Link
          to="/"
          className="px-4 py-2 border border-white/20 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/40 transition-colors"
        >
          Back to Play
        </Link>
      </header>

      <main className="max-w-2xl mx-auto p-6">
        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : !bets || bets.length === 0 ? (
          <div className="text-center py-12 text-gray-500">No bets yet</div>
        ) : (
          <div className="space-y-3">
            {bets.map((bet) => {
              const roundInfo = getRoundInfo(bet);
              // Use 'won' field from API: true = won, false = lost, null = result unknown
              const isWinner = bet.won === true;
              const isLoser = bet.won === false;

              return (
                <div
                  key={bet._id}
                  className={`border rounded-xl p-4 ${
                    isWinner
                      ? 'bg-green-500/10 border-green-500/40'
                      : isLoser
                        ? 'bg-red-500/10 border-red-500/30'
                        : 'bg-white/5 border-white/10'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {/* Payment Status */}
                      <span className={`text-lg ${getStatusColor(bet.paymentStatus)}`}>
                        {getStatusIcon(bet.paymentStatus)}
                      </span>

                      {/* Round Info */}
                      <div>
                        <div className="text-sm font-medium">
                          Round #{roundInfo?.roundNumber ?? bet.roundNumber ?? '?'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatDate(bet.createdAt)}
                        </div>
                      </div>

                      {/* Payment Status Badge */}
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        bet.paymentStatus === 'paid' ? 'bg-green-500/20 text-green-400' :
                        bet.paymentStatus === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                        bet.paymentStatus === 'refunded' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {bet.paymentStatus.toUpperCase()}
                      </span>

                      {/* Result Badge - only show when result is known */}
                      {isWinner && (
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-500/30 text-green-300">
                          WIN
                        </span>
                      )}
                      {isLoser && (
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-500/30 text-red-300">
                          LOSS
                        </span>
                      )}
                    </div>

                    {/* Amount & Winnings */}
                    <div className="text-right">
                      <div className="text-sm">
                        <span className="text-gray-400">Bet:</span>{' '}
                        <span className="text-[#ffd700] font-semibold">{bet.totalAmount} {config.tokenSymbol}</span>
                      </div>
                      {isWinner && (
                        <div className="text-sm">
                          <span className="text-gray-400">Won:</span>{' '}
                          <span className="text-green-400 font-bold">+{bet.winnings} {config.tokenSymbol}</span>
                        </div>
                      )}
                      {bet.paymentStatus === 'refunded' && bet.refundReason && (
                        <div className="text-xs text-blue-400 mt-1">
                          Refund: {bet.refundReason}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bet Directions */}
                  <div className="flex gap-2 flex-wrap">
                    {bet.bets.map((b, i) => {
                      const isWinningDirection = roundInfo?.winningDirection === b.direction;
                      const color = DIRECTION_COLOR[b.direction];
                      return (
                        <div
                          key={i}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${
                            isWinningDirection ? 'ring-2 ring-green-400' : ''
                          }`}
                          style={{
                            background: `${color}22`,
                            border: `1px solid ${color}66`
                          }}
                        >
                          <span
                            className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-xs"
                            style={{ background: color }}
                          >
                            {b.direction === 'up' ? '▲' : '▼'}
                          </span>
                          <span className="text-sm font-medium" style={{ color }}>
                            {b.amount} {config.tokenSymbol}
                          </span>
                          {isWinningDirection && (
                            <span className="text-green-400 text-xs font-bold">WIN</span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Payout Status */}
                  {bet.payoutStatus !== 'none' && (
                    <div className="mt-3 pt-3 border-t border-white/5 text-xs">
                      <span className="text-gray-500">Payout:</span>{' '}
                      <span className={
                        bet.payoutStatus === 'confirmed' ? 'text-green-400' :
                        bet.payoutStatus === 'sent' ? 'text-yellow-400' :
                        bet.payoutStatus === 'pending' ? 'text-gray-400' :
                        'text-red-400'
                      }>
                        {bet.payoutStatus.toUpperCase()}
                      </span>
                      {bet.payoutTxId && (
                        <span className="text-gray-600 ml-2">
                          TX: {bet.payoutTxId.slice(0, 8)}...
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
