import { useState, useEffect, useCallback, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { HelpCircle, History as HistoryIcon, Wallet, TrendingUp, TrendingDown, Check, X } from 'lucide-react';
import { gameApi } from '../api/client';
import type { BetItem } from '../api/client';
import { useCurrentRound, usePreviousRound, useUserBetsInCurrentRound, usePlaceBets } from '../api/hooks';
import { config } from '../config';
import './lottery.css';

const NAMETAG_KEY = 'pricecall_nametag';

function loadNametag(): string {
  try {
    return localStorage.getItem(NAMETAG_KEY) || '';
  } catch {
    return '';
  }
}

function saveNametag(nametag: string): void {
  try {
    if (nametag) localStorage.setItem(NAMETAG_KEY, nametag);
    else localStorage.removeItem(NAMETAG_KEY);
  } catch {
    // localStorage unavailable - not fatal
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Client-side live price ticker - purely cosmetic. The round's actual outcome
// always comes from the backend's own authoritative price fetch at close time.
const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple', BNB: 'binancecoin',
  OKB: 'okb', ADA: 'cardano', DOGE: 'dogecoin', TRX: 'tron', TON: 'the-open-network',
  DOT: 'polkadot', MATIC: 'polygon-ecosystem-token', LINK: 'chainlink', AVAX: 'avalanche-2',
  SHIB: 'shiba-inu', LTC: 'litecoin', BCH: 'bitcoin-cash', ATOM: 'cosmos', UNI: 'uniswap',
  NEAR: 'near', ICP: 'internet-computer',
};

function useLivePrice(asset: string | undefined): number | null {
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    if (!asset) return;
    const coinId = COINGECKO_IDS[asset.toUpperCase()];
    if (!coinId) return;

    let cancelled = false;
    const fetchPrice = async (): Promise<void> => {
      try {
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`
        );
        const data = await res.json();
        const p = data[coinId]?.usd;
        if (!cancelled && typeof p === 'number') setPrice(p);
      } catch {
        // Ignore transient ticker errors - not critical to functionality
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [asset]);

  return price;
}

type Direction = 'up' | 'down';

export function Home() {
  const [userNametag, setUserNametag] = useState(loadNametag);
  const [nametagStatus, setNametagStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [nametagError, setNametagError] = useState<string | null>(null);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showHowToPlayModal, setShowHowToPlayModal] = useState(false);
  const [selectedDirection, setSelectedDirection] = useState<Direction | null>(null);
  const [betAmount, setBetAmount] = useState('');
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentStep, setPaymentStep] = useState<'confirm' | 'awaiting' | 'paid' | 'failed'>('confirm');
  const [pendingBetItems, setPendingBetItems] = useState<BetItem[]>([]);
  const [pendingBetId, setPendingBetId] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [roundResult, setRoundResult] = useState<{ won: boolean; direction: Direction } | null>(null);

  const queryClient = useQueryClient();
  const prevRoundNumberRef = useRef<number | null>(null);
  const lockedBetRef = useRef<{ direction: Direction; amount: number } | null>(null);
  const hasHandledRoundRef = useRef<number | null>(null);

  const { data: round } = useCurrentRound();
  const { data: previousRound } = usePreviousRound();
  const { data: myCurrentRoundBets } = useUserBetsInCurrentRound(
    nametagStatus === 'valid' ? userNametag : undefined
  );
  const placeBetMutation = usePlaceBets();
  const livePrice = useLivePrice(round?.asset);

  // Track the user's locked-in bet for the current round, so we can show a
  // result banner once it resolves (even after the round rolls over).
  useEffect(() => {
    if (myCurrentRoundBets && myCurrentRoundBets.length > 0) {
      const totals: Record<Direction, number> = { up: 0, down: 0 };
      myCurrentRoundBets.forEach((bet) => {
        bet.bets.forEach((b) => {
          totals[b.direction] += b.amount;
        });
      });
      if (totals.up > 0) lockedBetRef.current = { direction: 'up', amount: totals.up };
      else if (totals.down > 0) lockedBetRef.current = { direction: 'down', amount: totals.down };
    }
  }, [myCurrentRoundBets]);

  // When the round number changes, the previous round just resolved - check
  // whether our locked bet won and surface a result banner.
  useEffect(() => {
    if (!round?.roundNumber) return;

    if (prevRoundNumberRef.current !== null && prevRoundNumberRef.current !== round.roundNumber) {
      const resolvedRoundNumber = prevRoundNumberRef.current;
      queryClient.refetchQueries({ queryKey: ['previousRound'] });
      queryClient.refetchQueries({ queryKey: ['roundHistory'] });

      if (lockedBetRef.current && hasHandledRoundRef.current !== resolvedRoundNumber) {
        hasHandledRoundRef.current = resolvedRoundNumber;
        const locked = lockedBetRef.current;

        // Give the backend a moment to finish payout processing before checking
        setTimeout(() => {
          queryClient
            .fetchQuery({ queryKey: ['previousRound'] })
            .then((prev) => {
              const p = prev as { roundNumber: number; winningDirection: Direction | 'flat' | null } | null;
              if (p && p.roundNumber === resolvedRoundNumber && p.winningDirection) {
                if (p.winningDirection === 'up' || p.winningDirection === 'down') {
                  setRoundResult({ won: p.winningDirection === locked.direction, direction: locked.direction });
                  setTimeout(() => setRoundResult(null), 6000);
                }
              }
            })
            .catch(() => {});
          lockedBetRef.current = null;
        }, 3000);
      }
    }

    prevRoundNumberRef.current = round.roundNumber;
  }, [round?.roundNumber, queryClient]);

  // Poll for payment confirmation after placing a bet
  useEffect(() => {
    if (!pendingBetId || paymentStep !== 'awaiting') return;

    let pollCount = 0;
    const maxPolls = 60; // 60 * 2s = 2 minute timeout

    const pollInterval = setInterval(async () => {
      pollCount++;
      try {
        const response = await gameApi.getUserBetsInCurrentRound(userNametag);
        let pendingBet = response.data.data.find((b) => b._id === pendingBetId);

        if (!pendingBet) {
          const historyResponse = await gameApi.getUserBets(userNametag, 10);
          pendingBet = historyResponse.data.data.find((b) => b._id === pendingBetId);
        }

        if (pendingBet) {
          if (pendingBet.paymentStatus === 'paid') {
            clearInterval(pollInterval);
            setPaymentStep('paid');
            queryClient.invalidateQueries({ queryKey: ['userBetsInCurrentRound'] });
            queryClient.invalidateQueries({ queryKey: ['currentRound'] });
            setTimeout(() => {
              setShowPaymentModal(false);
              setPendingBetItems([]);
              setPendingBetId(null);
              setPaymentStep('confirm');
              setSelectedDirection(null);
              setBetAmount('');
            }, 1500);
          } else if (
            pendingBet.paymentStatus === 'expired' ||
            pendingBet.paymentStatus === 'failed' ||
            pendingBet.paymentStatus === 'refunded'
          ) {
            clearInterval(pollInterval);
            setPaymentStep('failed');
            setPaymentError(
              pendingBet.paymentStatus === 'expired'
                ? 'Payment expired. Please try again.'
                : pendingBet.paymentStatus === 'refunded'
                  ? 'Round closed. Payment refunded to your wallet.'
                  : 'Payment failed. Please try again.'
            );
          }
        }
      } catch {
        // Ignore transient polling errors, keep trying
      }

      if (pollCount >= maxPolls) {
        clearInterval(pollInterval);
        setPaymentStep('failed');
        setPaymentError('Payment timeout. Check your wallet and try again.');
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [pendingBetId, paymentStep, userNametag, queryClient]);

  // Validate nametag
  const validateNametag = useCallback(async (nametag: string) => {
    if (!nametag || nametag.length < 2) {
      setNametagStatus('idle');
      setNametagError(null);
      return;
    }
    setNametagStatus('checking');
    setNametagError(null);
    try {
      await gameApi.validateNametag(nametag);
      setNametagStatus('valid');
      setNametagError(null);
    } catch (error: unknown) {
      setNametagStatus('invalid');
      const axiosError = error as { response?: { data?: { error?: string } } };
      setNametagError(axiosError?.response?.data?.error || 'Nametag not found');
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => validateNametag(userNametag), 500);
    return () => clearTimeout(timer);
  }, [userNametag, validateNametag]);

  // Round countdown timer
  useEffect(() => {
    if (!round?.startTime || !round?.roundDurationSeconds) return;

    const calculateRemaining = (): number => {
      const startTime = new Date(round.startTime).getTime();
      const endTime = startTime + round.roundDurationSeconds! * 1000;
      return Math.max(0, Math.floor((endTime - Date.now()) / 1000));
    };

    setTimeRemaining(calculateRemaining());
    const interval = setInterval(() => setTimeRemaining(calculateRemaining()), 1000);
    return () => clearInterval(interval);
  }, [round?.startTime, round?.roundDurationSeconds]);

  const handleNametagChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const value = e.target.value.trim();
    setUserNametag(value);
    saveNametag(value);
  };

  const handleSelectDirection = (direction: Direction): void => {
    if (round?.status !== 'open') return;
    setSelectedDirection(direction);
  };

  const handlePlaceCall = (): void => {
    if (nametagStatus !== 'valid') {
      setShowConnectModal(true);
      return;
    }
    const amount = parseInt(betAmount, 10);
    if (!selectedDirection || isNaN(amount) || amount <= 0) return;

    setPendingBetItems([{ direction: selectedDirection, amount }]);
    setPaymentStep('confirm');
    setShowPaymentModal(true);
  };

  const handleConfirmBet = (): void => {
    if (pendingBetItems.length === 0) return;
    setPaymentStep('awaiting');
    setPaymentError(null);

    placeBetMutation.mutate(
      { userNametag, bets: pendingBetItems },
      {
        onSuccess: (data) => {
          setPendingBetId(data.bet._id);
        },
        onError: (error: unknown) => {
          setPaymentStep('failed');
          const axiosError = error as { response?: { data?: { error?: string } } };
          setPaymentError(axiosError?.response?.data?.error || 'Failed to place your call. Please try again.');
        },
      }
    );
  };

  const closePaymentModal = (): void => {
    if (paymentStep === 'awaiting') return; // Don't allow closing mid-payment
    setShowPaymentModal(false);
    setPendingBetItems([]);
    setPendingBetId(null);
    setPaymentStep('confirm');
    setPaymentError(null);
  };

  const isRoundOpen = round?.status === 'open';
  const myUpTotal = (myCurrentRoundBets ?? []).reduce(
    (sum, bet) => sum + bet.bets.filter((b) => b.direction === 'up').reduce((s, b) => s + b.amount, 0),
    0
  );
  const myDownTotal = (myCurrentRoundBets ?? []).reduce(
    (sum, bet) => sum + bet.bets.filter((b) => b.direction === 'down').reduce((s, b) => s + b.amount, 0),
    0
  );
  const hasLockedBetThisRound = myUpTotal > 0 || myDownTotal > 0;

  const priceDelta = round?.startPrice && livePrice ? livePrice - round.startPrice : null;
  const priceDeltaPct =
    round?.startPrice && priceDelta !== null ? (priceDelta / round.startPrice) * 100 : null;
  const totalBetAmount = pendingBetItems.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="lottery-container min-h-screen bg-linear-to-br from-[#0a0a0f] via-[#1a1a2e] to-[#0f0f1a] text-white font-rajdhani relative">
      <div className="scanline" />
      <div className="grid-bg" />

      {/* Header */}
      <header className="relative px-6 py-4 flex justify-between items-center border-b border-white/5 bg-black/30">
        <div>
          <h1 className="text-xl font-bold font-orbitron text-[#00ff88] tracking-wider">
            {config.appName}
          </h1>
          <p className="text-xs text-gray-500">{config.appSubtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowHowToPlayModal(true)}
            className="p-2 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-white/30 transition-colors"
            aria-label="How it works"
          >
            <HelpCircle size={18} />
          </button>
          <Link
            to="/history"
            className="p-2 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-white/30 transition-colors"
            aria-label="Round history"
          >
            <HistoryIcon size={18} />
          </Link>
          <button
            onClick={() => setShowConnectModal(true)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
              nametagStatus === 'valid'
                ? 'bg-[#00ff88]/10 border border-[#00ff88]/40 text-[#00ff88]'
                : 'bg-white/5 border border-white/10 text-gray-400 hover:text-white'
            }`}
          >
            <Wallet size={16} />
            {nametagStatus === 'valid' ? `@${userNametag}` : 'Connect'}
          </button>
        </div>
      </header>

      <main className="relative max-w-md mx-auto p-4 pb-24">
        {/* Round result banner */}
        {roundResult && (
          <div
            className={`animate-slide-up mb-4 rounded-xl p-4 text-center border ${
              roundResult.won
                ? 'bg-[#00ff88]/10 border-[#00ff88]/40 text-[#00ff88]'
                : 'bg-[#ff6b6b]/10 border-[#ff6b6b]/40 text-[#ff6b6b]'
            }`}
          >
            <div className="font-orbitron font-bold text-lg tracking-wide">
              {roundResult.won ? 'YOU CALLED IT RIGHT! 🎉' : 'NOT THIS ROUND'}
            </div>
            <div className="text-xs mt-1 opacity-80">
              You called {roundResult.direction.toUpperCase()}
            </div>
          </div>
        )}

        {/* Price ticker card */}
        <div className="rounded-2xl p-5 mb-4 bg-white/5 border border-white/10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-400 font-orbitron tracking-widest">
              {round?.asset ?? '...'}/USD
            </span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                isRoundOpen ? 'bg-[#00ff88]/20 text-[#00ff88]' : 'bg-yellow-500/20 text-yellow-400'
              }`}
            >
              {round?.status?.toUpperCase() ?? '...'}
            </span>
          </div>

          <div className="text-3xl font-bold font-orbitron mb-1">
            {livePrice !== null
              ? `$${livePrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
              : round?.startPrice
                ? `$${round.startPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                : '...'}
          </div>

          {priceDelta !== null && priceDeltaPct !== null && (
            <div className={`text-sm font-semibold ${priceDelta >= 0 ? 'text-[#00ff88]' : 'text-[#ff6b6b]'}`}>
              {priceDelta >= 0 ? '▲' : '▼'} {Math.abs(priceDeltaPct).toFixed(3)}% since round open
            </div>
          )}

          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-gray-500">Round #{round?.roundNumber ?? '...'} closes in</span>
            <span className="font-orbitron font-bold text-[#ffd700]">
              {timeRemaining !== null ? formatTime(timeRemaining) : '--:--'}
            </span>
          </div>
        </div>

        {/* Up / Down selection */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <button
            onClick={() => handleSelectDirection('up')}
            disabled={!isRoundOpen}
            className={`flex flex-col items-center gap-2 py-6 rounded-2xl border-2 transition-all disabled:opacity-40 ${
              selectedDirection === 'up'
                ? 'bg-[#00ff88]/15 border-[#00ff88]'
                : 'bg-white/5 border-white/10 hover:border-[#00ff88]/40'
            }`}
          >
            <TrendingUp size={32} className="text-[#00ff88]" />
            <span className="font-orbitron font-bold text-[#00ff88] tracking-widest">UP</span>
          </button>
          <button
            onClick={() => handleSelectDirection('down')}
            disabled={!isRoundOpen}
            className={`flex flex-col items-center gap-2 py-6 rounded-2xl border-2 transition-all disabled:opacity-40 ${
              selectedDirection === 'down'
                ? 'bg-[#ff6b6b]/15 border-[#ff6b6b]'
                : 'bg-white/5 border-white/10 hover:border-[#ff6b6b]/40'
            }`}
          >
            <TrendingDown size={32} className="text-[#ff6b6b]" />
            <span className="font-orbitron font-bold text-[#ff6b6b] tracking-widest">DOWN</span>
          </button>
        </div>

        {/* Amount input */}
        <div className="rounded-2xl p-4 mb-4 bg-white/5 border border-white/10">
          <label className="text-xs text-gray-500 mb-2 block">Amount ({config.tokenSymbol})</label>
          <input
            type="text"
            inputMode="numeric"
            value={betAmount}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '' || /^\d{0,6}$/.test(v)) setBetAmount(v);
            }}
            placeholder="0"
            className="w-full bg-transparent text-2xl font-bold font-orbitron outline-none placeholder-gray-700"
          />
        </div>

        {hasLockedBetThisRound && (
          <div className="text-center text-xs text-gray-500 mb-4">
            You've called {myUpTotal > 0 ? `UP (${myUpTotal} ${config.tokenSymbol})` : ''}
            {myUpTotal > 0 && myDownTotal > 0 ? ' + ' : ''}
            {myDownTotal > 0 ? `DOWN (${myDownTotal} ${config.tokenSymbol})` : ''} this round
          </div>
        )}

        <button
          onClick={handlePlaceCall}
          disabled={!isRoundOpen || !selectedDirection || !betAmount || parseInt(betAmount, 10) <= 0}
          className="w-full py-4 rounded-2xl font-orbitron font-bold tracking-widest text-[#0a0a0f] disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            background: 'linear-gradient(135deg, #ffd700 0%, #ffaa00 100%)',
            boxShadow: '0 4px 20px #ffd70033',
          }}
        >
          {isRoundOpen ? 'PLACE CALL' : 'ROUND CLOSED'}
        </button>

        {/* Total pool */}
        <div className="flex justify-between text-sm text-gray-500 mt-4 px-1">
          <span>Pool this round</span>
          <span className="text-[#ffd700] font-semibold">
            {round?.totalPool ?? 0} {config.tokenSymbol}
          </span>
        </div>

        {/* Previous round result */}
        {previousRound && previousRound.winningDirection && (
          <div className="mt-6 rounded-xl p-4 bg-white/5 border border-white/10 text-sm">
            <div className="text-gray-500 mb-1">Last round #{previousRound.roundNumber}</div>
            <div className="flex items-center justify-between">
              <span
                className={`font-orbitron font-bold ${
                  previousRound.winningDirection === 'up' ? 'text-[#00ff88]' : 'text-[#ff6b6b]'
                }`}
              >
                {previousRound.winningDirection === 'up' ? '▲ UP' : previousRound.winningDirection === 'down' ? '▼ DOWN' : '– FLAT'}
              </span>
              {previousRound.startPrice !== null && previousRound.endPrice !== null && (
                <span className="text-gray-500 text-xs">
                  ${previousRound.startPrice.toLocaleString()} → ${previousRound.endPrice.toLocaleString()}
                </span>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer nav */}
      {nametagStatus === 'valid' && (
        <Link
          to={`/mybets/${userNametag}`}
          className="fixed bottom-4 right-4 px-4 py-3 rounded-full bg-[#00ff88] text-[#0a0a0f] font-orbitron font-bold text-sm shadow-lg z-40"
        >
          My Calls
        </Link>
      )}

      {/* Connect nametag modal */}
      {showConnectModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 px-4">
          <div className="relative w-full max-w-sm bg-linear-to-br from-[#0a0a0f] via-[#12121a] to-[#0a0a0f] rounded-2xl border border-white/10 p-6">
            <button
              onClick={() => setShowConnectModal(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-white"
              aria-label="Close"
            >
              <X size={20} />
            </button>
            <h2 className="text-lg font-bold font-orbitron text-[#00ff88] mb-1">Connect Nametag</h2>
            <p className="text-xs text-gray-500 mb-4">Enter your Sphere nametag to place calls</p>
            <input
              type="text"
              value={userNametag}
              onChange={handleNametagChange}
              placeholder="your-nametag"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#00ff88]/50 mb-2"
            />
            {nametagStatus === 'checking' && (
              <p className="text-xs text-gray-500">Checking...</p>
            )}
            {nametagStatus === 'valid' && (
              <p className="text-xs text-[#00ff88] flex items-center gap-1">
                <Check size={14} /> Nametag verified
              </p>
            )}
            {nametagStatus === 'invalid' && (
              <p className="text-xs text-[#ff6b6b]">{nametagError}</p>
            )}
            <button
              onClick={() => setShowConnectModal(false)}
              disabled={nametagStatus !== 'valid'}
              className="w-full mt-4 py-3 rounded-xl font-orbitron font-bold text-[#0a0a0f] disabled:opacity-30"
              style={{ background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)' }}
            >
              DONE
            </button>
          </div>
        </div>
      )}

      {/* How to play modal */}
      {showHowToPlayModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 px-4">
          <div className="relative w-full max-w-sm bg-linear-to-br from-[#0a0a0f] via-[#12121a] to-[#0a0a0f] rounded-2xl border border-white/10 p-6">
            <button
              onClick={() => setShowHowToPlayModal(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-white"
              aria-label="Close"
            >
              <X size={20} />
            </button>
            <h2 className="text-lg font-bold font-orbitron text-[#00ff88] mb-4">How It Works</h2>
            <ol className="text-sm text-gray-400 space-y-3 list-decimal list-inside">
              <li>Each round captures the live {round?.asset ?? 'asset'} price the moment it opens.</li>
              <li>Call whether the price will be UP or DOWN when the round closes.</li>
              <li>When the round ends, the live price is checked again to resolve the winning side.</li>
              <li>Winners split the pool proportionally, minus a small house fee.</li>
            </ol>
          </div>
        </div>
      )}

      {/* Payment modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 px-4">
          <div
            className="relative w-full max-w-sm bg-linear-to-br from-[#0a0a0f] via-[#12121a] to-[#0a0a0f] rounded-2xl overflow-hidden"
            style={{ boxShadow: '0 0 60px #00ff8822, 0 0 100px #00ff8811, inset 0 1px 0 #ffffff08' }}
          >
            <div className="relative px-6 py-6">
              {paymentStep === 'confirm' ? (
                <>
                  <div className="text-center mb-6">
                    <div
                      className="w-14 h-14 mx-auto mb-3 rounded-xl flex items-center justify-center"
                      style={{
                        background:
                          pendingBetItems[0]?.direction === 'up'
                            ? 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)'
                            : 'linear-gradient(135deg, #ff6b6b 0%, #cc4444 100%)',
                      }}
                    >
                      {pendingBetItems[0]?.direction === 'up' ? (
                        <TrendingUp size={28} className="text-[#0a0a0f]" />
                      ) : (
                        <TrendingDown size={28} className="text-white" />
                      )}
                    </div>
                    <h2 className="text-lg font-bold text-white font-orbitron tracking-widest">
                      CONFIRM CALL
                    </h2>
                    <p className="text-xs text-gray-500 mt-1">Round #{round?.roundNumber}</p>
                  </div>

                  <div className="text-center py-3 rounded-xl mb-6 bg-white/5 border border-white/10">
                    <div className="text-sm text-gray-400 mb-1">
                      Calling {round?.asset} to go{' '}
                      <span
                        className={
                          pendingBetItems[0]?.direction === 'up' ? 'text-[#00ff88]' : 'text-[#ff6b6b]'
                        }
                      >
                        {pendingBetItems[0]?.direction?.toUpperCase()}
                      </span>
                    </div>
                    <span className="text-2xl font-bold font-orbitron text-[#ffd700]">
                      {totalBetAmount}
                    </span>
                    <span className="text-sm text-gray-400 ml-1">{config.tokenSymbol}</span>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={closePaymentModal}
                      className="flex-1 px-4 py-3 bg-transparent border-2 border-[#333] rounded-xl text-gray-400 text-sm font-orbitron font-semibold tracking-widest hover:border-[#444]"
                    >
                      CANCEL
                    </button>
                    <button
                      onClick={handleConfirmBet}
                      className="flex-1 px-4 py-3 rounded-xl text-[#0a0a0f] text-sm font-orbitron font-bold tracking-widest"
                      style={{ background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)' }}
                    >
                      CONFIRM
                    </button>
                  </div>
                </>
              ) : paymentStep === 'awaiting' ? (
                <div className="text-center py-4">
                  <div className="w-16 h-16 mx-auto mb-4 relative">
                    <div
                      className="absolute inset-0 rounded-full border-4 border-transparent animate-spin"
                      style={{ borderTopColor: '#00ff88', borderRightColor: '#00ff8866', animationDuration: '1s' }}
                    />
                    <div className="absolute inset-2 rounded-full flex items-center justify-center">
                      <div className="w-6 h-6 rounded-full bg-[#00ff88] animate-pulse" />
                    </div>
                  </div>
                  <h2 className="text-base font-bold text-[#00ff88] font-orbitron tracking-widest mb-2">
                    AWAITING PAYMENT
                  </h2>
                  <p className="text-sm text-gray-400 mb-1">Check your wallet for the payment request</p>
                  <p className="text-xs text-gray-600">Waiting for confirmation...</p>
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <span className="text-gray-500 text-sm">Amount: </span>
                    <span className="text-lg font-bold font-orbitron text-[#ffd700]">{totalBetAmount}</span>
                    <span className="text-sm text-gray-400 ml-1">{config.tokenSymbol}</span>
                  </div>
                </div>
              ) : paymentStep === 'paid' ? (
                <div className="text-center py-4">
                  <div
                    className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)' }}
                  >
                    <Check size={32} className="text-[#0a0a0f]" />
                  </div>
                  <h2 className="text-base font-bold text-[#00ff88] font-orbitron tracking-widest mb-2">
                    CALL PLACED!
                  </h2>
                  <p className="text-sm text-gray-400">Good luck — check back when the round closes</p>
                </div>
              ) : (
                <div className="text-center py-4">
                  <div
                    className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #ff6b6b 0%, #cc4444 100%)' }}
                  >
                    <X size={32} className="text-white" />
                  </div>
                  <h2 className="text-base font-bold text-[#ff6b6b] font-orbitron tracking-widest mb-2">
                    PAYMENT FAILED
                  </h2>
                  <p className="text-sm text-gray-400 mb-4">{paymentError}</p>
                  <button
                    onClick={closePaymentModal}
                    className="w-full py-3 rounded-xl font-orbitron font-bold text-gray-300 border border-white/10"
                  >
                    CLOSE
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
