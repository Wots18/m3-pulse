import { Link } from 'react-router-dom';
import { useRoundHistory } from '../api/hooks';
import { config } from '../config';

const DIRECTION_COLOR: Record<string, string> = {
  up: '#00ff88',
  down: '#ff6b6b',
  flat: '#94a3b8',
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

export function History() {
  const { data: rounds, isLoading } = useRoundHistory(50);

  return (
    <div className="min-h-screen bg-linear-to-br from-[#0a0a0f] via-[#1a1a2e] to-[#0f0f1a] text-white font-rajdhani">
      {/* Header */}
      <header className="px-6 py-4 flex justify-between items-center border-b border-white/5 bg-black/30">
        <div>
          <h1 className="text-xl font-bold font-orbitron text-[#00ff88]">Round History</h1>
          <p className="text-xs text-gray-500">Past lottery rounds and results</p>
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
        ) : !rounds || rounds.length === 0 ? (
          <div className="text-center py-12 text-gray-500">No completed rounds yet</div>
        ) : (
          <div className="space-y-3">
            {rounds.map((round) => (
              <div
                key={round._id}
                className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 transition-colors"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                    {/* Round Number */}
                    <div className="text-gray-500 text-sm font-medium">
                      #{round.roundNumber}
                    </div>

                    {/* Winning Direction */}
                    {round.winningDirection !== null ? (
                      <div
                        className="min-w-10 h-10 px-2 rounded-full flex items-center justify-center text-white font-bold text-sm font-orbitron gap-1"
                        style={{
                          background: DIRECTION_COLOR[round.winningDirection],
                          boxShadow: `0 0 15px ${DIRECTION_COLOR[round.winningDirection]}66`
                        }}
                      >
                        {round.winningDirection === 'up' ? '▲' : round.winningDirection === 'down' ? '▼' : '–'}
                        {round.winningDirection.toUpperCase()}
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-gray-500 font-bold">
                        ?
                      </div>
                    )}

                    {/* Status Badge */}
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                      round.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                      round.status === 'paying' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {round.status.toUpperCase()}
                    </span>

                    {/* Asset + Price move */}
                    {round.startPrice !== null && round.endPrice !== null && (
                      <div className="text-xs text-gray-500">
                        {round.asset} ${round.startPrice.toLocaleString()} → ${round.endPrice.toLocaleString()}
                      </div>
                    )}
                  </div>

                  <div className="text-left sm:text-right">
                    {/* Pool & Payout */}
                    <div className="flex flex-wrap items-center gap-3 text-sm sm:gap-4">
                      <div>
                        <span className="text-gray-500">Pool:</span>{' '}
                        <span className="text-[#ffd700] font-semibold">{round.totalPool} {config.tokenSymbol}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Paid:</span>{' '}
                        <span className="text-green-400 font-semibold">{round.totalPayout} {config.tokenSymbol}</span>
                      </div>
                      {round.houseFee > 0 && (
                        <div>
                          <span className="text-gray-500">Fee:</span>{' '}
                          <span className="text-gray-400">{round.houseFee} {config.tokenSymbol}</span>
                        </div>
                      )}
                    </div>
                    {/* Date */}
                    <div className="text-xs text-gray-600 mt-1">
                      {formatDate(round.startTime)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
