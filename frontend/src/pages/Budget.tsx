import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  Legend as RechartsLegend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import client from '../api/client';

interface Transaction {
  id: number;
  date: string;
  amount: string;
  category: string;
  description: string;
  is_anomaly?: boolean;
}

const COLORS = [
  '#FF6FB5', // Hot Pink
  '#00B4D8', // Cyan
  '#FFDE4D', // Yellow
  '#B5179E', // Purple
  '#FF9F1C', // Amber/Orange
  '#38B000', // Lime/Green
  '#7209B7', // Dark Violet
  '#FF5400', // Red-Orange
];

import { formatCurrency } from '../utils/formatCurrency';


const CustomPieTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border-2 border-[#1A1A2E] p-3 shadow-[3px_3px_0px_#1A1A2E] text-xs font-bold text-[#1A1A2E]">
        <p className="font-retro-mono text-base border-b border-[#1A1A2E] pb-0.5 mb-1">{payload[0].name}</p>
        <p className="text-[#FF6FB5] font-retro-mono text-lg">
          {formatCurrency(payload[0].value)}
        </p>
      </div>
    );
  }
  return null;
};

const CustomBarTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border-2 border-[#1A1A2E] p-3 shadow-[3px_3px_0px_#1A1A2E] text-xs space-y-1 font-bold text-[#1A1A2E]">
        <p className="font-retro-mono text-base border-b border-[#1A1A2E] pb-0.5 mb-1">{label}</p>
        {payload.map((p: any, idx: number) => (
          <div key={idx} className="flex justify-between gap-4 font-retro-mono">
            <span className={p.name === 'This Month' ? 'text-[#FF6FB5]' : 'text-[#00B4D8]'}>
              {p.name}:
            </span>
            <span>
              {formatCurrency(p.value)}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};
let cachedBudgetTransactions: Transaction[] | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('csv-uploaded', () => {
    cachedBudgetTransactions = null;
    console.log('[DEBUG LOG] Budget module-level cache cleared via csv-uploaded event.');
  });
}

export default function Budget() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>(() => cachedBudgetTransactions ?? []);
  const [loading, setLoading] = useState(() => !cachedBudgetTransactions);
  const [error, setError] = useState<string | null>(null);

  // Set page title and meta for SEO
  useEffect(() => {
    document.title = 'Budget Analysis | FinSight AI';
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', 'Analyze your spending habits by category comparing the current month to the last month.');
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    try {
      // Clear cache if a CSV was recently uploaded
      const csvUploaded = localStorage.getItem('csv_uploaded_budget');
      if (csvUploaded === 'true') {
        localStorage.removeItem('csv_uploaded_budget');
        cachedBudgetTransactions = null;
        console.log('[DEBUG LOG] CSV upload detected in Budget page, clearing cache.');
      }

      if (!cachedBudgetTransactions) {
        setLoading(true);
      }
      setError(null);

      let latestDate = new Date();
      try {
        const latestTxRes: any = await client.get('/transactions/?page_size=1');
        const results = latestTxRes.data?.results || latestTxRes.data;
        if (Array.isArray(results) && results.length > 0) {
          latestDate = new Date(results[0].date);
        }
      } catch (err) {
        console.error('[API ERROR] Failed to fetch latest transaction for budget date anchoring:', err);
      }

      const currentYear = latestDate.getFullYear();
      const currentMonth = latestDate.getMonth(); // 0-indexed

      // First day of last month
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

      while (nextUrl) {
        const url: string = nextUrl;
        const res: any = await client.get(url);
        
        const pageCount = res.data?.results?.length || (Array.isArray(res.data) ? res.data.length : 0);
        console.log(`[DEBUG LOG] Budget page fetched transactions segment. Segment count: ${pageCount}`);

        if (Array.isArray(res.data)) {
          allTx = [...allTx, ...res.data];
          nextUrl = null;
        } else if (res.data && Array.isArray(res.data.results)) {
          allTx = [...allTx, ...res.data.results];
          if (res.data.next) {
            try {
              const urlObj: URL = new URL(res.data.next);
              // Strip duplicate /api prefix from the pathname if Axios baseURL already includes it
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

      console.log(`[DEBUG LOG] Budget page total loaded transactions: ${allTx.length}`);
      setTransactions(allTx);
      cachedBudgetTransactions = allTx;
    } catch (err: any) {
      console.error('[API ERROR] Budget page failed to load transactions:', err);
      setError(err.response?.data?.detail || 'Failed to load budget data. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Listen for 'csv-uploaded' event to perform live updates if mounted
  useEffect(() => {
    const handleCsvUploaded = async () => {
      console.log('[DEBUG LOG] Budget component received csv-uploaded event. Refreshing data...');
      cachedBudgetTransactions = null;
      setLoading(true);
      setTransactions([]);
      await fetchAllData();
    };

    window.addEventListener('csv-uploaded', handleCsvUploaded);
    return () => {
      window.removeEventListener('csv-uploaded', handleCsvUploaded);
    };
  }, [fetchAllData]);

  // Timezone-safe classification of transactions
  // Timezone-safe classification of transactions relative to the latest transaction in the dataset
  const { thisMonthTx, lastMonthTx } = useMemo(() => {
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

    const targetLastMonth = targetMonth === 0 ? 11 : targetMonth - 1;
    const targetLastYear = targetMonth === 0 ? targetYear - 1 : targetYear;

    const tMonthTx: Transaction[] = [];
    const lMonthTx: Transaction[] = [];

    transactions.forEach(t => {
      if (!t.date) return;
      const parts = t.date.split('-');
      if (parts.length < 2) return;
      const yr = parseInt(parts[0], 10);
      const mo = parseInt(parts[1], 10) - 1; // 0-indexed

      if (yr === targetYear && mo === targetMonth) {
        tMonthTx.push(t);
      } else if (yr === targetLastYear && mo === targetLastMonth) {
        lMonthTx.push(t);
      }
    });

    return { thisMonthTx: tMonthTx, lastMonthTx: lMonthTx };
  }, [transactions]);

  // Aggregated Category Data
  const aggregatedData = useMemo(() => {
    const categoryMap = new Map<string, { thisMonth: number; lastMonth: number }>();

    thisMonthTx.forEach(t => {
      const cat = t.category || 'Other';
      const amount = parseFloat(t.amount) || 0;
      const current = categoryMap.get(cat) || { thisMonth: 0, lastMonth: 0 };
      categoryMap.set(cat, { ...current, thisMonth: current.thisMonth + amount });
    });

    lastMonthTx.forEach(t => {
      const cat = t.category || 'Other';
      const amount = parseFloat(t.amount) || 0;
      const current = categoryMap.get(cat) || { thisMonth: 0, lastMonth: 0 };
      categoryMap.set(cat, { ...current, lastMonth: current.lastMonth + amount });
    });

    return Array.from(categoryMap.entries()).map(([category, totals]) => ({
      category,
      'This Month': Math.round(totals.thisMonth * 100) / 100,
      'Last Month': Math.round(totals.lastMonth * 100) / 100,
    })).sort((a, b) => b['This Month'] - a['This Month']);
  }, [thisMonthTx, lastMonthTx]);

  // Data for the Pie Chart (spending this month)
  const pieData = useMemo(() => {
    return aggregatedData
      .filter(item => item['This Month'] > 0)
      .map(item => ({
        name: item.category,
        value: item['This Month'],
      }));
  }, [aggregatedData]);

  // Highlight Stats calculations
  const stats = useMemo(() => {
    const totalSpentThisMonth = thisMonthTx.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    const totalSpentLastMonth = lastMonthTx.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);

    const anomaliesCount = thisMonthTx.filter(t => t.is_anomaly).length;

    let highestCat = 'N/A';
    let highestCatAmount = 0;
    aggregatedData.forEach(item => {
      if (item['This Month'] > highestCatAmount) {
        highestCatAmount = item['This Month'];
        highestCat = item.category;
      }
    });

    const percentChange = totalSpentLastMonth > 0
      ? ((totalSpentThisMonth - totalSpentLastMonth) / totalSpentLastMonth) * 100
      : 0;

    return {
      thisMonthTotal: totalSpentThisMonth,
      lastMonthTotal: totalSpentLastMonth,
      highestCategory: highestCat,
      highestCatAmount,
      anomalies: anomaliesCount,
      percentChange,
    };
  }, [thisMonthTx, lastMonthTx, aggregatedData]);

  const handlePieClick = (data: any) => {
    if (data && data.name) {
      navigate(`/transactions?category=${encodeURIComponent(data.name)}`);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-8 animate-pulse text-[#1A1A2E]" id="budget-page-loading">
        <div className="space-y-2">
          <div className="h-8 bg-slate-300 rounded w-1/4"></div>
          <div className="h-4 bg-slate-300 rounded w-1/3"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-slate-300 border-2 border-[#1A1A2E]"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="h-96 bg-slate-300 border-2 border-[#1A1A2E]"></div>
          <div className="h-96 bg-slate-300 border-2 border-[#1A1A2E]"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] overflow-hidden" id="budget-page-error">
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
            id="reload-budget-btn"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const isEmpty = transactions.length === 0;

  return (
    <div className="max-w-7xl mx-auto space-y-8 relative z-10 text-[#1A1A2E]" id="budget-page-root">
      {/* Page Header */}
      <header className="space-y-1">
        <h1 className="text-3xl font-bold font-retro-title uppercase tracking-tight text-[#FF6FB5]" id="budget-title">
          Budget Overview
        </h1>
        <p className="font-retro-mono font-bold uppercase tracking-wider text-[#1A1A2E]/70 text-sm">
          Analyze category-wise spending totals and compare performance with last month.
        </p>
      </header>

      {isEmpty ? (
        <div className="bg-white border-2 border-[#1A1A2E] shadow-[6px_6px_0px_#1A1A2E] overflow-hidden max-w-xl mx-auto" id="budget-empty-state">
          <div className="bg-[#FFDE4D] px-4 py-2 border-b-2 border-[#1A1A2E] font-retro-title text-[10px] text-[#1A1A2E] uppercase">
            EMPTY_STATE.SYS
          </div>
          <div className="p-8 text-center space-y-4">
            <div className="text-5xl">📊</div>
            <h2 className="text-xl font-bold font-retro-title">No History Yet</h2>
            <p className="font-retro-mono font-bold uppercase tracking-wider text-slate-500 text-xs leading-relaxed">
              We couldn't find any transaction records for the current or previous month. Please add or upload some transactions first to unlock your spending analysis.
            </p>
            <button
              onClick={() => navigate('/transactions')}
              className="px-5 py-3 bg-[#FFDE4D] text-[#1A1A2E] font-retro-title text-[9px] uppercase border-2 border-[#1A1A2E] shadow-[3px_3px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[0px_0px_0px_#1A1A2E] cursor-pointer"
              id="empty-nav-transactions-btn"
            >
              Go to Transactions
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Top Stat Cards Section */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6" id="budget-stats-container">
            {/* Stat Card 1: Total Spent */}
            <div className="bg-[#F5EBE6] border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] overflow-hidden flex flex-col justify-between hover:-translate-y-0.5 transition-all">
              <div className="bg-[#FFDE4D] border-b-2 border-[#1A1A2E] px-4 py-1.5 font-retro-title text-[9px] uppercase font-bold text-[#1A1A2E]">
                SPENT_THIS_MONTH.TXT
              </div>
              <div className="p-6">
                <span className="text-[#1A1A2E]/60 text-xs font-bold uppercase font-retro-mono tracking-wider">
                  Spent This Month
                </span>
                <h3 className="text-3xl font-bold font-retro-mono text-[#1A1A2E] mt-1">
                  {formatCurrency(stats.thisMonthTotal)}
                </h3>
                <div className="mt-4 flex items-center gap-2">
                  <span className={`text-[10px] font-retro-title border border-[#1A1A2E] px-2 py-0.5 uppercase font-bold ${
                    stats.percentChange > 0 
                      ? 'bg-[#FF7676] text-[#1A1A2E]' 
                      : stats.percentChange < 0 
                        ? 'bg-[#38B000] text-white' 
                        : 'bg-white text-slate-500'
                  }`}>
                    {stats.percentChange > 0 ? '↑' : '↓'} {Math.abs(stats.percentChange).toFixed(1)}%
                  </span>
                  <span className="text-slate-500 text-xs font-bold font-retro-mono">VS LAST MONTH</span>
                </div>
              </div>
            </div>

            {/* Stat Card 2: Highest Spending Category */}
            <div className="bg-[#F5EBE6] border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] overflow-hidden flex flex-col justify-between hover:-translate-y-0.5 transition-all">
              <div className="bg-[#FF6FB5] border-b-2 border-[#1A1A2E] px-4 py-1.5 font-retro-title text-[9px] uppercase font-bold text-[#1A1A2E]">
                TOP_BUDGET_CAT.TXT
              </div>
              <div className="p-6">
                <span className="text-[#1A1A2E]/60 text-xs font-bold uppercase font-retro-mono tracking-wider">
                  Top Category
                </span>
                <h3 className="text-3xl font-bold font-retro-mono text-[#1A1A2E] mt-1 truncate">
                  {stats.highestCategory}
                </h3>
                <div className="mt-4 text-xs font-bold font-retro-mono text-slate-500 flex items-center gap-1.5">
                  <span className="text-[#FF6FB5]">
                    {formatCurrency(stats.highestCatAmount)}
                  </span>
                  <span>SPENT THIS MONTH</span>
                </div>
              </div>
            </div>

            {/* Stat Card 3: Anomalies */}
            <div className="bg-[#F5EBE6] border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] overflow-hidden flex flex-col justify-between hover:-translate-y-0.5 transition-all">
              <div className="bg-[#00B4D8] border-b-2 border-[#1A1A2E] px-4 py-1.5 font-retro-title text-[9px] uppercase font-bold text-[#1A1A2E]">
                WARNINGS.EXE
              </div>
              <div className="p-6">
                <span className="text-[#1A1A2E]/60 text-xs font-bold uppercase font-retro-mono tracking-wider">
                  Anomalies Detected
                </span>
                <h3 className={`text-3xl font-bold font-retro-mono mt-1 ${stats.anomalies > 0 ? 'text-[#FF7676]' : 'text-[#38B000]'}`}>
                  {stats.anomalies}
                </h3>
                <div className="mt-4 text-xs font-bold font-retro-mono text-slate-500">
                  {stats.anomalies > 0 
                    ? 'UNUSUAL ACTIVITY FLAGGED' 
                    : 'ALL ACTIVITY NORMAL'}
                </div>
              </div>
            </div>
          </section>

          {/* Visualisations Section */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Pie Chart spending breakdown */}
            <div className="lg:col-span-7 bg-white border-2 border-[#1A1A2E] shadow-[6px_6px_0px_#1A1A2E] overflow-hidden flex flex-col justify-between" id="pie-chart-card">
              <div className="bg-[#FFDE4D] border-b-2 border-[#1A1A2E] px-4 py-2">
                <span className="font-retro-title text-[10px] text-[#1A1A2E] uppercase tracking-wider">
                  SPENDING_BREAKDOWN_PIE.EXE
                </span>
              </div>
              <div className="p-6 bg-white flex-1">
                <div>
                  <h3 className="text-lg font-bold font-retro-title text-[#1A1A2E] uppercase">This Month's Spending</h3>
                  <p className="font-retro-mono font-bold uppercase tracking-wider text-slate-500 text-xs mt-0.5">Click on a category slice to filter transaction list.</p>
                </div>
                <div className="h-80 w-full mt-4 flex items-center justify-center relative">
                  {pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={105}
                          innerRadius={65}
                          paddingAngle={2}
                          onClick={handlePieClick}
                          className="cursor-pointer focus:outline-none"
                        >
                          {pieData.map((_, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={COLORS[index % COLORS.length]} 
                              stroke="#1A1A2E" 
                              strokeWidth={2}
                              className="transition-all duration-300 hover:opacity-85"
                            />
                          ))}
                        </Pie>
                        <RechartsTooltip content={<CustomPieTooltip />} />
                        <RechartsLegend 
                          verticalAlign="bottom" 
                          height={36} 
                          iconType="square"
                          iconSize={10}
                          formatter={(value) => <span className="text-xs font-bold uppercase font-retro-mono text-[#1A1A2E]">{value}</span>}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <span className="font-retro-mono font-bold uppercase text-slate-500 text-sm">No positive spending records this month</span>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Detailed Spending List with visual progress trackers */}
            <div className="lg:col-span-5 bg-white border-2 border-[#1A1A2E] shadow-[6px_6px_0px_#1A1A2E] overflow-hidden flex flex-col justify-between" id="category-list-card">
              <div className="bg-[#FF6FB5] border-b-2 border-[#1A1A2E] px-4 py-2 text-[#1A1A2E]">
                <span className="font-retro-title text-[10px] text-[#1A1A2E] uppercase tracking-wider">
                  CATEGORY_DETAIL_TABLE.EXE
                </span>
              </div>
              <div className="p-6 bg-white flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-bold font-retro-title text-[#1A1A2E] uppercase">Category Detail</h3>
                  <p className="font-retro-mono font-bold uppercase tracking-wider text-slate-500 text-xs mt-0.5">Comparison of spending limits this month.</p>
                </div>
                <div className="mt-4 space-y-4 flex-1 overflow-y-auto max-h-[310px] pr-2 custom-scrollbar">
                  {aggregatedData.map((item, idx) => {
                    const ratio = stats.thisMonthTotal > 0 ? (item['This Month'] / stats.thisMonthTotal) * 100 : 0;
                    return (
                      <div key={item.category} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-bold">
                          <span 
                            onClick={() => navigate(`/transactions?category=${encodeURIComponent(item.category)}`)}
                            className="text-[#1A1A2E] hover:text-[#FF6FB5] cursor-pointer transition-colors"
                          >
                            {item.category}
                          </span>
                          <span className="text-[#1A1A2E] font-retro-mono font-bold text-sm">
                            {formatCurrency(item['This Month'])}
                          </span>
                        </div>
                        <div className="w-full h-3.5 bg-[#F5EBE6] border border-[#1A1A2E] overflow-hidden">
                          <div 
                            className="h-full border-r border-[#1A1A2E] transition-all duration-500" 
                            style={{ 
                              width: `${Math.max(ratio, 1.5)}%`, 
                              backgroundColor: COLORS[idx % COLORS.length] 
                            }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] font-bold font-retro-mono text-[#1A1A2E]/70">
                          <span>{ratio.toFixed(0)}% OF TOTAL</span>
                          <span>LAST MONTH: {formatCurrency(item['Last Month'])}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* Bottom Section: Grouped Bar Chart comparing this month vs last month */}
          <section className="bg-white border-2 border-[#1A1A2E] shadow-[6px_6px_0px_#1A1A2E] overflow-hidden" id="bar-chart-card">
            <div className="bg-[#FFDE4D] border-b-2 border-[#1A1A2E] px-4 py-2">
              <span className="font-retro-title text-[10px] text-[#1A1A2E] uppercase tracking-wider">
                MOM_COMPARISON_BARS.EXE
              </span>
            </div>
            <div className="p-6 bg-white">
              <div className="mb-6">
                <h3 className="text-lg font-bold font-retro-title text-[#1A1A2E] uppercase">Month-over-Month Comparison</h3>
                <p className="font-retro-mono font-bold uppercase tracking-wider text-slate-500 text-xs mt-0.5">Grouped view comparing current month vs previous month spending by category.</p>
              </div>
              <div className="h-96 w-full">
                {aggregatedData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={aggregatedData}
                      margin={{ top: 20, right: 10, left: 10, bottom: 20 }}
                      barGap={6}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1A1A2E" strokeOpacity={0.15} vertical={false} />
                      <XAxis 
                        dataKey="category" 
                        stroke="#1A1A2E" 
                        fontSize={11}
                        tickLine={true}
                        axisLine={true}
                        dy={10}
                      />
                      <YAxis 
                        stroke="#1A1A2E" 
                        fontSize={11}
                        tickLine={true}
                        axisLine={true}
                        tickFormatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`}
                        dx={-10}
                      />
                      <RechartsTooltip content={<CustomBarTooltip />} />
                      <RechartsLegend 
                        verticalAlign="top" 
                        align="right" 
                        height={40}
                        iconType="square"
                        iconSize={10}
                        formatter={(value) => <span className="text-xs font-bold uppercase font-retro-mono text-[#1A1A2E]">{value}</span>}
                      />
                      <Bar 
                        dataKey="This Month" 
                        fill="#FF6FB5" 
                        stroke="#1A1A2E"
                        strokeWidth={2}
                        maxBarSize={40}
                        onClick={(data: any) => {
                          if (data && data.category) {
                            navigate(`/transactions?category=${encodeURIComponent(data.category)}`);
                          }
                        }}
                        className="cursor-pointer hover:opacity-85 transition-opacity"
                      />
                      <Bar 
                        dataKey="Last Month" 
                        fill="#00B4D8" 
                        stroke="#1A1A2E"
                        strokeWidth={2}
                        maxBarSize={40}
                        onClick={(data: any) => {
                          if (data && data.category) {
                            navigate(`/transactions?category=${encodeURIComponent(data.category)}`);
                          }
                        }}
                        className="cursor-pointer hover:opacity-85 transition-opacity"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center font-retro-mono font-bold uppercase text-slate-500 text-sm">
                    No data to compare
                  </div>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
