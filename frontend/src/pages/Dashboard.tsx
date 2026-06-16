import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import client from '../api/client';
import { formatCurrency } from '../utils/formatCurrency';

// ─── Interfaces ────────────────────────────────────────────────────────────────

interface Transaction {
  id: number;
  date: string;
  amount: string;
  category: string;
  description: string;
  is_anomaly?: boolean;
}

interface ForecastPoint {
  date: string;
  predicted_balance: number;
  lower: number;
  upper: number;
}

interface ForecastSnapshot {
  id: number;
  created_at: string;
  forecast_data: {
    forecast: ForecastPoint[];
  };
}

interface DbStats {
  total_spent: number;
  top_category: string;
  anomalies_count: number;
  transaction_count: number;
}

// ─── Module-level cache (survives React navigation, reset on CSV upload) ───────
let cachedDashboardData: {
  transactions: Transaction[];
  forecastSnapshot: ForecastSnapshot | null;
  dbStats: DbStats | null;
} | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('csv-uploaded', () => {
    cachedDashboardData = null;
    console.log('[DEBUG LOG] Dashboard module-level cache cleared via csv-uploaded event.');
  });
}

// ─── Diagnostic metrics ────────────────────────────────────────────────────────
let renderCount = 0;
let apiCallCount = 0;
let invalidationCount = 0;
let refetchCount = 0;

// ─── Constants ─────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 30; // 90 seconds max

// ─── Memoised helper components ────────────────────────────────────────────────

const Spinner = memo(({ className = '' }: { className?: string }) => (
  <svg
    className={`animate-spin ${className}`}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
));

const CustomTooltip = memo(({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const isActual = data.actual !== null;

    return (
      <div className="bg-white border-2 border-[#1A1A2E] p-4 shadow-[3px_3px_0px_#1A1A2E] text-xs space-y-1.5 min-w-[200px] text-[#1A1A2E]">
        <p className="font-bold font-retro-mono text-base border-b border-[#1A1A2E] pb-1 mb-1">
          {new Date(data.date).toLocaleDateString('en-IN', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'UTC',
          })}
        </p>
        {isActual ? (
          <div className="flex justify-between items-center font-bold">
            <span className="text-[#FF6FB5] flex items-center gap-1.5">■ Actual:</span>
            <span className="font-retro-mono text-sm">{formatCurrency(data.actual)}</span>
          </div>
        ) : (
          <div className="space-y-1.5 font-bold">
            <div className="flex justify-between items-center">
              <span className="text-[#00B4D8] flex items-center gap-1.5">■ Predicted:</span>
              <span className="font-retro-mono text-sm">{formatCurrency(data.predicted)}</span>
            </div>
            {data.lower !== null && data.upper !== null && (
              <div className="flex justify-between items-center text-[10px] text-slate-500 pt-0.5 border-t border-[#1A1A2E]/30">
                <span>Range:</span>
                <span className="font-retro-mono">
                  {formatCurrency(data.lower)} – {formatCurrency(data.upper)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
  return null;
});

// Memoised chart — only re-renders when chartData reference changes
const ForecastChart = memo(({ chartData, refreshing, navigate }: {
  chartData: any[];
  refreshing: boolean;
  navigate: (to: string) => void;
}) => {
  const hasForecast = chartData.some(d => d.predicted !== null);
  return (
    <section className="bg-white border-2 border-[#1A1A2E] shadow-[6px_6px_0px_#1A1A2E] overflow-hidden" id="dashboard-chart-card">
      <div className="bg-[#FFDE4D] border-b-2 border-[#1A1A2E] px-4 py-2">
        <span className="font-retro-title text-[10px] text-[#1A1A2E] uppercase tracking-wider">
          FORECAST_SYS_VISUALIZER.EXE
        </span>
      </div>
      <div className="p-6 bg-white">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold font-retro-title text-[#1A1A2E] uppercase">Daily Balance &amp; ML Forecast</h3>
            <p className="font-retro-mono font-bold uppercase tracking-wider text-slate-500 text-xs mt-0.5">
              Historical daily flow for the past 30 days mapped against projected model values.
            </p>
          </div>
          {refreshing && (
            <div className="flex items-center gap-2 text-xs font-retro-title text-slate-500 shrink-0 pt-0.5">
              <Spinner className="w-3.5 h-3.5" />
              POLLING…
            </div>
          )}
        </div>

        {!hasForecast ? (
          <div className="h-80 flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4" id="dashboard-empty-state">
            <div className="text-5xl">🔮</div>
            <h4 className="text-lg font-bold font-retro-title text-[#1A1A2E] uppercase">Forecast Model Offline</h4>
            <p className="font-retro-mono font-bold uppercase tracking-wider text-slate-500 text-xs leading-relaxed">
              FinSight AI requires at least <span className="text-[#FF6FB5] font-bold">30 unique daily transaction data points</span> to
              fit a Prophet forecasting model. Add or upload more transactions, then click{' '}
              <span className="text-[#FFDE4D] font-bold bg-[#1A1A2E] px-1 text-white">Refresh Insights</span> to generate your first forecast.
            </p>
            <button
              onClick={() => navigate('/transactions')}
              className="px-5 py-3 bg-[#FFDE4D] text-[#1A1A2E] font-retro-title text-[9px] uppercase border-2 border-[#1A1A2E] shadow-[3px_3px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[0px_0px_0px_#1A1A2E]"
              id="dashboard-to-tx-btn"
            >
              Go to Transactions
            </button>
          </div>
        ) : (
          <div className="h-96 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1A1A2E" strokeOpacity={0.15} vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#1A1A2E"
                  fontSize={11}
                  tickLine={true}
                  axisLine={true}
                  dy={10}
                  tickFormatter={(date) => {
                    try {
                      return new Date(date).toLocaleDateString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        timeZone: 'UTC',
                      });
                    } catch { return date; }
                  }}
                />
                <YAxis
                  stroke="#1A1A2E"
                  fontSize={11}
                  tickLine={true}
                  axisLine={true}
                  tickFormatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`}
                  dx={-10}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={40}
                  iconType="square"
                  iconSize={10}
                  formatter={(value) => (
                    <span className="text-xs font-bold uppercase font-retro-mono text-[#1A1A2E]">{value}</span>
                  )}
                />
                <Area name="Confidence Band (Upper)" type="monotone" dataKey="upper" stroke="none" fill="#00B4D8" fillOpacity={0.1} activeDot={false} legendType="none" />
                <Area name="Confidence Band (Lower)" type="monotone" dataKey="lower" stroke="none" fill="white" activeDot={false} legendType="none" />
                <Area name="Predicted Daily Net Flow" type="monotone" dataKey="predicted" stroke="#00B4D8" strokeWidth={3} strokeDasharray="4 4" fill="none" connectNulls />
                <Area name="Actual Daily Net Flow" type="monotone" dataKey="actual" stroke="#FF6FB5" strokeWidth={2} fill="none" fillOpacity={0} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
});

// ─── Main Dashboard component ──────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate();

  // Initialise state from module-level cache so navigation back is instant
  const [transactions, setTransactions] = useState<Transaction[]>(
    () => cachedDashboardData?.transactions ?? []
  );
  const [forecastSnapshot, setForecastSnapshot] = useState<ForecastSnapshot | null>(
    () => cachedDashboardData?.forecastSnapshot ?? null
  );
  // Only show skeleton when there is NO cached data at all
  const [loading, setLoading] = useState(() => !cachedDashboardData);
  const [error, setError] = useState<string | null>(null);

  // Refresh Insights state
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshSuccess, setRefreshSuccess] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollAttemptsRef = useRef(0);

  // Diagnostic: log every render
  renderCount += 1;
  console.log(`[METRICS] Dashboard render #${renderCount} | apiCalls=${apiCallCount} | invalidations=${invalidationCount} | refetches=${refetchCount}`);

  useEffect(() => {
    document.title = 'Financial Dashboard | FinSight AI';
  }, []);

  // ── Data fetching ────────────────────────────────────────────────────────────

  const loadDashboardData = useCallback(async () => {
    apiCallCount += 1;
    console.log(`[METRICS] loadDashboardData called (apiCalls=${apiCallCount})`);

    let latestDate = new Date();
    try {
      const latestTxRes: any = await client.get('/transactions/?page_size=1');
      const results = latestTxRes.data?.results || latestTxRes.data;
      if (Array.isArray(results) && results.length > 0) {
        latestDate = new Date(results[0].date);
      }
    } catch (err) {
      console.error('[API ERROR] Failed to fetch latest transaction for dashboard date anchoring:', err);
    }

    const currentYear = latestDate.getFullYear();
    const currentMonth = latestDate.getMonth(); // 0-indexed

    // First day of last month relative to latest transaction date
    const startOfLastMonth = new Date(currentYear, currentMonth - 1, 1);
    const formatDateStr = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const dateAfter = formatDateStr(startOfLastMonth);
    let allTx: Transaction[] = [];
    let nextUrl: string | null = `/transactions/?date_after=${dateAfter}&page_size=100`;

    // Paginated fetch of transactions relative to latest transaction date
    try {
      while (nextUrl) {
        const res: any = await client.get(nextUrl);
        if (Array.isArray(res.data)) {
          allTx = [...allTx, ...res.data];
          nextUrl = null;
        } else if (res.data && Array.isArray(res.data.results)) {
          allTx = [...allTx, ...res.data.results];
          if (res.data.next) {
            try {
              const urlObj = new URL(res.data.next);
              nextUrl = urlObj.pathname.replace(/^\/api/, '') + urlObj.search;
            } catch {
              nextUrl = null;
            }
          } else {
            nextUrl = null;
          }
        } else {
          nextUrl = null;
        }
      }
    } catch (err) {
      console.error('[API ERROR] Failed to fetch paginated transactions for dashboard:', err);
    }

    const [forecastRes, statsRes] = await Promise.allSettled([
      client.get('/forecasts/latest/'),
      client.get('/transactions/stats/'),
    ]);

    let latestForecast: ForecastSnapshot | null = null;
    if (forecastRes.status === 'fulfilled') {
      latestForecast = forecastRes.value.data;
    } else if (forecastRes.reason?.response?.status !== 404) {
      console.error('[API ERROR] Failed to load forecast:', forecastRes.reason);
    }

    let statsData: DbStats | null = null;
    if (statsRes.status === 'fulfilled') {
      statsData = statsRes.value.data;
      console.log(`[DEBUG LOG] Dashboard stats: total_spent=${statsData?.total_spent}, top_category=${statsData?.top_category}, count=${statsData?.transaction_count}`);
    } else {
      console.error('[API ERROR] Failed to load stats:', statsRes.reason);
    }

    // Write to module-level cache
    cachedDashboardData = { transactions: allTx, forecastSnapshot: latestForecast, dbStats: statsData };

    return { allTx, latestForecast, statsData };
  }, []);

  // ── Polling ──────────────────────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    pollAttemptsRef.current = 0;
    setRefreshing(false);
  }, []);

  const handleRefreshInsights = useCallback(async () => {
    if (refreshing) return;

    refetchCount += 1;
    invalidationCount += 1;
    console.log(`[METRICS] handleRefreshInsights triggered (refetches=${refetchCount}, invalidations=${invalidationCount})`);

    setRefreshing(true);
    setRefreshError(null);
    setRefreshSuccess(false);

    const snapshotIdBefore = forecastSnapshot?.id ?? null;

    try {
      await client.post('/forecasts/generate/');
    } catch (err: any) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.error ||
        'Failed to enqueue refresh tasks. Is the backend running?';
      setRefreshError(msg);
      setRefreshing(false);
      return;
    }

    pollAttemptsRef.current = 0;

    pollTimerRef.current = setInterval(async () => {
      pollAttemptsRef.current += 1;

      try {
        const res = await client.get('/forecasts/latest/');
        const newSnapshot: ForecastSnapshot = res.data;
        const isNew = snapshotIdBefore === null || newSnapshot.id !== snapshotIdBefore;

        if (isNew) {
          // Background reload — does NOT set loading=true, no skeleton flash
          const { allTx, latestForecast } = await loadDashboardData();
          setTransactions(allTx);
          setForecastSnapshot(latestForecast);
          setRefreshSuccess(true);
          stopPolling();
          setTimeout(() => setRefreshSuccess(false), 4000);
          return;
        }
      } catch (err: any) {
        if (err.response?.status !== 404) {
          console.error('[POLLING ERROR]', err);
        }
      }

      if (pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
        stopPolling();
        setRefreshError(
          'Refresh timed out. The forecast may require more transaction history (30+ days) before a model can be generated.'
        );
      }
    }, POLL_INTERVAL_MS);
  }, [refreshing, forecastSnapshot, loadDashboardData, stopPolling]);

  // ── Initial load ─────────────────────────────────────────────────────────────
  // Runs once on mount. If cache exists, setLoading is already false so no skeleton.
  // If cache was invalidated (CSV upload flag), clears cache and shows skeleton.
  useEffect(() => {
    const initialLoad = async () => {
      // Check for CSV-upload invalidation signal
      const csvUploaded = localStorage.getItem('csv_uploaded_dashboard');
      if (csvUploaded === 'true') {
        localStorage.removeItem('csv_uploaded_dashboard');
        cachedDashboardData = null;
        invalidationCount += 1;
        console.log(`[METRICS] Cache invalidated by CSV upload (invalidations=${invalidationCount})`);
        setLoading(true);        // show skeleton since data is stale
        setTransactions([]);
        setForecastSnapshot(null);
      }

      // Skip network fetch entirely if cache is still valid
      if (cachedDashboardData) {
        console.log('[DEBUG LOG] Dashboard loaded from cache, skipping API call.');
        return;
      }

      try {
        setError(null);
        const { allTx, latestForecast } = await loadDashboardData();
        setTransactions(allTx);
        setForecastSnapshot(latestForecast);

        // Auto-start polling if CSV was just uploaded (cache was cleared above)
        if (csvUploaded === 'true') {
          console.log('[DEBUG LOG] Auto-triggering forecast refresh after CSV upload...');
          handleRefreshInsights();
        }
      } catch (err: any) {
        console.error('[API ERROR] Dashboard initial load failed:', err);
        setError('An error occurred while loading the dashboard.');
      } finally {
        setLoading(false);
      }
    };

    initialLoad();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ✅ Empty deps — runs once on mount, no loop

  // Listen for 'csv-uploaded' event to perform live updates if mounted
  useEffect(() => {
    const handleCsvUploaded = async () => {
      console.log('[DEBUG LOG] Dashboard component received csv-uploaded event. Refreshing data...');
      cachedDashboardData = null;
      setLoading(true);
      setTransactions([]);
      setForecastSnapshot(null);
      try {
        setError(null);
        const { allTx, latestForecast } = await loadDashboardData();
        setTransactions(allTx);
        setForecastSnapshot(latestForecast);
        console.log('[DEBUG LOG] Auto-triggering forecast refresh after CSV upload event...');
        handleRefreshInsights();
      } catch (err: any) {
        console.error('[API ERROR] Dashboard update failed after CSV upload event:', err);
        setError('An error occurred while updating the dashboard.');
      } finally {
        setLoading(false);
      }
    };

    window.addEventListener('csv-uploaded', handleCsvUploaded);
    return () => {
      window.removeEventListener('csv-uploaded', handleCsvUploaded);
    };
  }, [loadDashboardData, handleRefreshInsights]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // ── Derived data (memoised) ───────────────────────────────────────────────────

  const stats = useMemo(() => {
    let targetYear = new Date().getFullYear();
    let targetMonth = new Date().getMonth(); // 0-indexed

    if (transactions.length > 0) {
      let maxTime = 0;
      transactions.forEach(t => {
        if (!t.date) return;
        const time = new Date(t.date).getTime();
        if (time > maxTime) {
          maxTime = time;
          const parts = t.date.split('-');
          if (parts.length >= 2) {
            targetYear = parseInt(parts[0], 10);
            targetMonth = parseInt(parts[1], 10) - 1; // 0-indexed
          }
        }
      });
    }

    const thisMonthTx = transactions.filter((t) => {
      if (!t.date) return false;
      const parts = t.date.split('-');
      return parseInt(parts[0], 10) === targetYear && parseInt(parts[1], 10) - 1 === targetMonth;
    });

    const totalSpentThisMonth = thisMonthTx.reduce(
      (s, t) => s + (parseFloat(t.amount) || 0),
      0
    );
    const anomaliesCount = thisMonthTx.filter((t) => t.is_anomaly).length;

    const catMap = new Map<string, number>();
    thisMonthTx.forEach((t) => {
      const cat = t.category || 'Other';
      catMap.set(cat, (catMap.get(cat) || 0) + (parseFloat(t.amount) || 0));
    });

    let topCategory = 'N/A';
    let maxAmt = 0;
    catMap.forEach((amt, cat) => {
      if (amt > maxAmt) { maxAmt = amt; topCategory = cat; }
    });

    let predictedIn30Days = 0;
    const fp = forecastSnapshot?.forecast_data?.forecast ?? [];
    if (fp.length > 0) predictedIn30Days = fp[fp.length - 1].predicted_balance;

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const targetMonthName = transactions.length > 0 ? `${monthNames[targetMonth]} ${targetYear}` : 'Most Recent Month';

    return { totalSpentThisMonth, topCategory, anomaliesCount, predictedIn30Days, targetMonthName };
  }, [transactions, forecastSnapshot]);

  const chartData = useMemo(() => {
    let latestDate = new Date();
    if (transactions.length > 0) {
      let maxTime = 0;
      transactions.forEach(t => {
        if (!t.date) return;
        const time = new Date(t.date).getTime();
        if (time > maxTime) {
          maxTime = time;
          latestDate = new Date(t.date);
        }
      });
    }

    const dates: string[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(latestDate);
      d.setDate(d.getDate() - i);
      dates.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      );
    }

    const txByDate = new Map<string, number>();
    transactions.forEach((t) => {
      if (t.date) txByDate.set(t.date, (txByDate.get(t.date) || 0) + parseFloat(t.amount));
    });

    const actualData = dates.map((date) => ({
      date,
      actual: Math.round((txByDate.get(date) || 0) * 100) / 100,
      predicted: null,
      lower: null,
      upper: null,
    }));

    const predictedData = (forecastSnapshot?.forecast_data?.forecast ?? []).map((f) => ({
      date: f.date,
      actual: null,
      predicted: f.predicted_balance,
      lower: f.lower,
      upper: f.upper,
    }));

    const mergedMap = new Map<string, {
      date: string;
      actual: number | null;
      predicted: number | null;
      lower: number | null;
      upper: number | null;
    }>();

    actualData.forEach(d => {
      mergedMap.set(d.date, {
        date: d.date,
        actual: d.actual,
        predicted: null,
        lower: null,
        upper: null,
      });
    });

    predictedData.forEach(d => {
      const existing = mergedMap.get(d.date);
      if (existing) {
        existing.predicted = d.predicted;
        existing.lower = d.lower;
        existing.upper = d.upper;
      } else {
        mergedMap.set(d.date, {
          date: d.date,
          actual: null,
          predicted: d.predicted,
          lower: d.lower,
          upper: d.upper,
        });
      }
    });

    const combined = Array.from(mergedMap.values());
    combined.sort((a, b) => a.date.localeCompare(b.date));
    return combined;
  }, [transactions, forecastSnapshot]);

  const hasForecast = useMemo(
    () => !!(forecastSnapshot?.forecast_data?.forecast?.length),
    [forecastSnapshot]
  );

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleDismissError = useCallback(() => setRefreshError(null), []);

  // ── Render guards ─────────────────────────────────────────────────────────────

  // Show skeleton ONLY when loading fresh with no cached data — never during background refreshes
  if (loading && !cachedDashboardData) {
    return (
      <div className="max-w-7xl mx-auto space-y-8 animate-pulse text-[#1A1A2E]" id="dashboard-page-loading">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-8 bg-slate-300 rounded w-48" />
            <div className="h-4 bg-slate-300 rounded w-72" />
          </div>
          <div className="h-10 w-40 bg-slate-300 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-slate-300 border-2 border-[#1A1A2E]" />
          ))}
        </div>
        <div className="h-[400px] bg-slate-300 border-2 border-[#1A1A2E]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] overflow-hidden" id="dashboard-page-error">
        <div className="bg-[#FF7676] px-4 py-2 border-b-2 border-[#1A1A2E] font-retro-title text-[10px] text-[#1A1A2E] uppercase">
          ERROR.EXE
        </div>
        <div className="p-6 text-center space-y-4">
          <div className="text-[#1A1A2E] text-4xl">⚠️</div>
          <h2 className="text-xl font-bold font-retro-title">Load Failure</h2>
          <p className="font-retro-mono font-bold text-[#1A1A2E]/80">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-[#FFDE4D] text-[#1A1A2E] font-retro-title text-[9px] uppercase border-2 border-[#1A1A2E] shadow-[3px_3px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[0px_0px_0px_#1A1A2E]"
            id="reload-dashboard-btn"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto space-y-8 relative z-10 text-[#1A1A2E]" id="dashboard-page-root">
      {/* ── Header ── */}
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-1">
          <h1
            className="text-3xl font-bold font-retro-title uppercase tracking-tight text-[#FF6FB5]"
            id="dashboard-title"
          >
            Financial Dashboard
          </h1>
          <p className="font-retro-mono font-bold uppercase tracking-wider text-[#1A1A2E]/70 text-sm">
            Forecast spending trends and surface balance anomalies over time.
          </p>
        </div>

        <button
          id="refresh-insights-btn"
          onClick={handleRefreshInsights}
          disabled={refreshing}
          className={`
            flex items-center gap-2 px-5 py-3 text-xs font-retro-title uppercase
            border-2 border-[#1A1A2E] transition-all duration-200 whitespace-nowrap self-start sm:self-auto cursor-pointer
            ${refreshing
              ? 'bg-white/40 text-slate-400 cursor-not-allowed shadow-[0px_0px_0px_#1a1a2e]'
              : 'bg-[#FFDE4D] text-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] hover:bg-[#FFDE4D]/80 active:translate-x-1 active:translate-y-1 active:shadow-[0px_0px_0px_#1A1A2E]'
            }
          `}
        >
          {refreshing ? (
            <>
              <Spinner className="w-4 h-4 text-[#1A1A2E] shrink-0" />
              Refreshing…
            </>
          ) : (
            <>
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Refresh Insights
            </>
          )}
        </button>
      </header>

      {/* ── Status banners ── */}
      {refreshSuccess && (
        <div
          id="refresh-success-banner"
          className="flex items-center gap-3 bg-[#FFDE4D] border-2 border-[#1A1A2E] text-[#1A1A2E] text-xs font-bold font-retro-title uppercase px-4 py-3 shadow-[3px_3px_0px_#1A1A2E]"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          SUCCESS: Insights refreshed.
        </div>
      )}

      {refreshError && (
        <div
          id="refresh-error-banner"
          className="flex items-start gap-3 bg-[#FF7676] border-2 border-[#1A1A2E] text-[#1A1A2E] text-xs font-bold font-retro-title uppercase px-4 py-3 shadow-[3px_3px_0px_#1A1A2E]"
        >
          <span className="shrink-0">⚠️ ERROR:</span>
          <span>{refreshError}</span>
          <button
            onClick={handleDismissError}
            className="ml-auto shrink-0 font-bold hover:text-white"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Stat cards ── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" id="dashboard-stats-grid">
        <div className="bg-[#F5EBE6] border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] overflow-hidden flex flex-col justify-between hover:-translate-y-0.5 transition-all">
          <div className="bg-[#FFDE4D] border-b-2 border-[#1A1A2E] px-4 py-1.5 font-retro-title text-[9px] uppercase font-bold text-[#1A1A2E]">
            TOTAL_SPENT.TXT
          </div>
          <div className="p-6">
            <span className="text-[#1A1A2E]/60 text-xs font-bold uppercase font-retro-mono tracking-wider">Total Spent ({stats.targetMonthName})</span>
            <h3 className="text-3xl font-bold font-retro-mono text-[#1A1A2E] mt-1">
              {formatCurrency(stats.totalSpentThisMonth)}
            </h3>
          </div>
        </div>

        <div className="bg-[#F5EBE6] border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] overflow-hidden flex flex-col justify-between hover:-translate-y-0.5 transition-all">
          <div className="bg-[#FF6FB5] border-b-2 border-[#1A1A2E] px-4 py-1.5 font-retro-title text-[9px] uppercase font-bold text-[#1A1A2E]">
            TOP_CAT.TXT
          </div>
          <div className="p-6">
            <span className="text-[#1A1A2E]/60 text-xs font-bold uppercase font-retro-mono tracking-wider">Top Category ({stats.targetMonthName})</span>
            <h3 className="text-3xl font-bold font-retro-mono text-[#1A1A2E] mt-1 truncate">
              {stats.topCategory}
            </h3>
          </div>
        </div>

        <div className="bg-[#F5EBE6] border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] overflow-hidden flex flex-col justify-between hover:-translate-y-0.5 transition-all">
          <div className="bg-[#00B4D8] border-b-2 border-[#1A1A2E] px-4 py-1.5 font-retro-title text-[9px] uppercase font-bold text-[#1A1A2E]">
            ANOMALIES.EXE
          </div>
          <div className="p-6">
            <span className="text-[#1A1A2E]/60 text-xs font-bold uppercase font-retro-mono tracking-wider">Anomalies Detected ({stats.targetMonthName})</span>
            <h3 className={`text-3xl font-bold font-retro-mono mt-1 ${
              stats.anomaliesCount > 0 ? 'text-[#FF7676]' : 'text-emerald-600'
            }`}>
              {stats.anomaliesCount}
            </h3>
          </div>
        </div>

        <div className="bg-[#F5EBE6] border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] overflow-hidden flex flex-col justify-between hover:-translate-y-0.5 transition-all">
          <div className="bg-[#FF9F1C] border-b-2 border-[#1A1A2E] px-4 py-1.5 font-retro-title text-[9px] uppercase font-bold text-[#1A1A2E]">
            FORECAST.SYS
          </div>
          <div className="p-6">
            <span className="text-[#1A1A2E]/60 text-xs font-bold uppercase font-retro-mono tracking-wider">Predicted Flow (30 Days)</span>
            <h3 className="text-3xl font-bold font-retro-mono text-[#00B4D8] mt-1">
              {hasForecast ? formatCurrency(stats.predictedIn30Days) : 'N/A'}
            </h3>
          </div>
        </div>
      </section>

      {/* ── Chart (memoised — does not remount during polling) ── */}
      <ForecastChart chartData={chartData} refreshing={refreshing} navigate={navigate} />
    </div>
  );
}
