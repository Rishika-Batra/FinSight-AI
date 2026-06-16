import { useState, useEffect, useRef, useCallback } from 'react';
import type { ChangeEvent } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import client from '../api/client';
import { formatCurrency } from '../utils/formatCurrency';

interface Transaction {
  id: number;
  date: string;
  amount: string;
  category: string;
  description: string;
  is_anomaly?: boolean;
}

interface Toast {
  id: number;
  type: 'success' | 'error';
  message: string;
}

// ── Spinner ─────────────────────────────────────────────────────────────────
const Spinner = ({ className = '' }: { className?: string }) => (
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
);

// ── Toast notification ───────────────────────────────────────────────────────
const ToastContainer = ({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) => {
  if (toasts.length === 0) return null;
  return (
    <div
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full"
      aria-live="polite"
      id="toast-container"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`
            flex items-start gap-3 px-4 py-3 border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E]
            font-retro-mono font-bold text-sm text-[#1A1A2E]
            ${t.type === 'success' ? 'bg-[#FFDE4D]' : 'bg-[#FF7676]'}
          `}
          role="alert"
          id={`toast-${t.id}`}
        >
          {/* Icon */}
          <span className="shrink-0 text-base leading-none mt-0.5">
            {t.type === 'success' ? '✓' : '⚠'}
          </span>

          {/* Message */}
          <span className="flex-1 text-xs uppercase tracking-wide leading-relaxed">
            {t.message}
          </span>

          {/* Dismiss button */}
          <button
            onClick={() => onDismiss(t.id)}
            className="shrink-0 text-[#1A1A2E]/60 hover:text-[#1A1A2E] font-bold leading-none ml-1"
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
};

// ── Main component ───────────────────────────────────────────────────────────
export default function Transactions() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryParam = searchParams.get('category') || '';

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [count, setCount] = useState(0);

  // CSV upload state
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Toast state
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  // Set page title for SEO
  useEffect(() => {
    document.title = 'Transactions | FinSight AI';
  }, []);

  // ── Fetch transactions ─────────────────────────────────────────────────────
  const fetchTransactions = useCallback(async (targetPage: number = page) => {
    try {
      setLoading(true);
      setError(null);

      const params: Record<string, string | number> = {
        page: targetPage,
        page_size: 10,
      };
      if (categoryParam) {
        params.category = categoryParam;
      }

      const res = await client.get('/transactions/', { params });

      if (Array.isArray(res.data)) {
        setTransactions(res.data);
        setCount(res.data.length);
        setTotalPages(1);
      } else if (res.data && Array.isArray(res.data.results)) {
        setTransactions(res.data.results);
        setCount(res.data.count);
        setTotalPages(Math.ceil(res.data.count / 10));
      }
    } catch (err: any) {
      console.error('Error fetching transactions:', err);
      setError(err.response?.data?.detail || 'Failed to fetch transactions.');
    } finally {
      setLoading(false);
    }
  }, [categoryParam, page]);

  useEffect(() => {
    fetchTransactions(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryParam, page]);

  // ── Toast helpers ─────────────────────────────────────────────────────────
  const addToast = useCallback((type: 'success' | 'error', message: string) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── CSV upload handler ────────────────────────────────────────────────────
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset input so the same file can be re-uploaded if needed
    e.target.value = '';

    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      addToast('error', 'Please select a .csv file.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploading(true);
      const res = await client.post('/transactions/upload/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const msg: string =
        res.data?.message ?? `Uploaded ${file.name} successfully.`;
      addToast('success', msg);
      
      // Store CSV upload flags for synchronization across other modules
      localStorage.setItem('csv_uploaded_dashboard', 'true');
      localStorage.setItem('csv_uploaded_budget', 'true');

      // Dispatch event to clear module cache/trigger live refresh if other routes are mounted
      window.dispatchEvent(new CustomEvent('csv-uploaded'));

      // Refetch from page 1 so newly added rows appear immediately
      setPage(1);
      await fetchTransactions(1);
    } catch (err: any) {
      const apiErr =
        err.response?.data?.error ||
        (Array.isArray(err.response?.data?.errors)
          ? err.response.data.errors.slice(0, 2).join(' • ')
          : null) ||
        err.response?.data?.detail ||
        'Upload failed. Check the file format and try again.';
      addToast('error', apiErr);
    } finally {
      setUploading(false);
    }
  };

  // ── Filter helpers ────────────────────────────────────────────────────────
  const handleCategoryChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setPage(1);
    if (val) {
      setSearchParams({ category: val });
    } else {
      setSearchParams({});
    }
  };

  const clearFilters = () => {
    setPage(1);
    setSearchParams({});
  };

  const categories = [
    'Food', 'Transport', 'Entertainment', 'Utilities',
    'Shopping', 'Health', 'Rent', 'Salary', 'Other',
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Fixed toast layer */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        id="csv-file-input"
        onChange={handleFileChange}
        aria-hidden="true"
      />

      <div className="max-w-7xl mx-auto space-y-6 relative z-10 text-[#1A1A2E]" id="transactions-page-root">
        {/* ── Header ── */}
        <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/budget')}
                className="px-3 py-1.5 bg-[#FFDE4D] text-[#1A1A2E] border-2 border-[#1A1A2E] font-retro-title text-[9px] uppercase shadow-[2px_2px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[0px_0px_0px_#1A1A2E] flex items-center gap-1 transition-all cursor-pointer"
                id="back-to-budget-btn"
              >
                ← Back
              </button>
            </div>
            <h1 className="text-3xl font-bold font-retro-title uppercase tracking-tight text-[#FF6FB5] mt-2" id="transactions-title">
              Transactions
            </h1>
          </div>

          {/* Upload CSV button */}
          <button
            onClick={handleUploadClick}
            disabled={uploading}
            id="upload-csv-btn"
            className={`
              self-start sm:self-auto flex items-center gap-2 px-5 py-3 text-xs font-retro-title uppercase
              border-2 border-[#1A1A2E] transition-all duration-200 whitespace-nowrap cursor-pointer
              ${uploading
                ? 'bg-white/40 text-slate-400 cursor-not-allowed shadow-[0px_0px_0px_#1a1a2e]'
                : 'bg-[#00B4D8] text-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] hover:bg-[#00B4D8]/80 active:translate-x-1 active:translate-y-1 active:shadow-[0px_0px_0px_#1A1A2E]'
              }
            `}
          >
            {uploading ? (
              <>
                <Spinner className="w-4 h-4 text-[#1A1A2E] shrink-0" />
                Uploading…
              </>
            ) : (
              <>
                {/* Upload icon */}
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Upload CSV
              </>
            )}
          </button>
        </header>

        {/* ── CSV format hint ── */}
        <aside
          className="bg-[#F5EBE6] border-2 border-[#1A1A2E] border-dashed px-4 py-2.5 flex flex-wrap items-center gap-2 text-[10px] font-retro-mono font-bold text-[#1A1A2E]/70 uppercase tracking-wide"
          id="csv-format-hint"
        >
          <span className="text-[#1A1A2E]/40">📄</span>
          <span>CSV format:</span>
          <code className="bg-white border border-[#1A1A2E]/30 px-1.5 py-0.5 font-retro-mono text-[#1A1A2E] not-italic">
            date, amount, category, description
          </code>
          <span className="text-[#1A1A2E]/50">— date must be YYYY-MM-DD, amounts in INR.</span>
        </aside>

        {/* ── Filters panel ── */}
        <section className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="category-select" className="text-xs font-bold font-retro-title text-[#1A1A2E] uppercase">
              Filter:
            </label>
            <select
              id="category-select"
              value={categoryParam}
              onChange={handleCategoryChange}
              className="bg-white border-2 border-[#1A1A2E] text-xs font-retro-mono font-bold text-[#1A1A2E] px-3 py-1.5 outline-none focus:bg-[#FFDE4D]/20 transition-colors"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            {categoryParam && (
              <button
                onClick={clearFilters}
                className="px-3 py-1.5 bg-[#FF7676] text-[#1A1A2E] border-2 border-[#1A1A2E] font-retro-title text-[9px] uppercase shadow-[2px_2px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[0px_0px_0px_#1A1A2E] cursor-pointer"
                id="clear-filter-btn"
              >
                Clear
              </button>
            )}
          </div>
          <div className="text-xs font-bold font-retro-mono text-[#1A1A2E]/70 uppercase">
            Total items: <span className="text-[#FF6FB5] font-bold">{count}</span>
          </div>
        </section>

        {/* ── List Content ── */}
        {loading ? (
          <div className="space-y-4" id="transactions-table-loading">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 bg-white border-2 border-[#1A1A2E] animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] overflow-hidden max-w-md mx-auto" id="transactions-table-error">
            <div className="bg-[#FF7676] px-4 py-2 border-b-2 border-[#1A1A2E] font-retro-title text-[10px] text-[#1A1A2E] uppercase">
              ERROR.EXE
            </div>
            <div className="p-6 text-center space-y-4">
              <p className="font-retro-mono font-bold text-[#1A1A2E]">Failure: {error}</p>
              <button
                onClick={() => fetchTransactions(page)}
                className="px-4 py-2 bg-[#FFDE4D] text-[#1A1A2E] font-retro-title text-[9px] uppercase border-2 border-[#1A1A2E] shadow-[3px_3px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[0px_0px_0px_#1A1A2E]"
              >
                Retry
              </button>
            </div>
          </div>
        ) : transactions.length === 0 ? (
          <div className="bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] p-12 text-center space-y-4" id="transactions-empty">
            <div className="text-4xl">📥</div>
            <h3 className="text-lg font-bold font-retro-title uppercase">Empty Folder</h3>
            <p className="font-retro-mono font-bold uppercase tracking-wider text-slate-500 text-xs max-w-sm mx-auto">
              No transactions match the selected filter. Try choosing another category or uploading your transactions via CSV.
            </p>
            <button
              onClick={handleUploadClick}
              disabled={uploading}
              className="px-5 py-2.5 bg-[#00B4D8] text-[#1A1A2E] border-2 border-[#1A1A2E] font-retro-title text-[9px] uppercase shadow-[3px_3px_0px_#1A1A2E] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[0px_0px_0px_#1A1A2E] cursor-pointer disabled:opacity-40"
              id="empty-upload-csv-btn"
            >
              Upload CSV
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Desktop Table View */}
            <div className="bg-white border-2 border-[#1A1A2E] shadow-[6px_6px_0px_#1A1A2E] overflow-hidden hidden md:block">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-[#1A1A2E] text-[10px] font-retro-title uppercase text-[#1A1A2E] bg-[#FFDE4D]/30">
                    <th className="py-3 px-6 border-r-2 border-[#1A1A2E]">Date</th>
                    <th className="py-3 px-6 border-r-2 border-[#1A1A2E]">Description</th>
                    <th className="py-3 px-6 border-r-2 border-[#1A1A2E]">Category</th>
                    <th className="py-3 px-6 border-r-2 border-[#1A1A2E]">Anomaly Status</th>
                    <th className="py-3 px-6 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1A1A2E] text-xs font-bold">
                  {transactions.map((t) => (
                    <tr
                      key={t.id}
                      className={`hover:bg-[#FF6FB5]/5 transition-colors ${t.is_anomaly ? 'bg-[#FF7676]/5' : ''}`}
                    >
                      <td className="py-4 px-6 text-[#1A1A2E]/80 font-retro-mono text-base border-r-2 border-[#1A1A2E]/30">{t.date}</td>
                      <td className="py-4 px-6 border-r-2 border-[#1A1A2E]/30">{t.description || '—'}</td>
                      <td className="py-4 px-6 border-r-2 border-[#1A1A2E]/30">
                        <span className="px-2 py-1 border border-[#1A1A2E] bg-white font-retro-mono text-xs uppercase">
                          {t.category || 'Unclassified'}
                        </span>
                      </td>
                      <td className="py-4 px-6 border-r-2 border-[#1A1A2E]/30">
                        {t.is_anomaly ? (
                          <span className="px-2.5 py-1 bg-[#FF7676] border border-[#1A1A2E] text-[9px] font-retro-title text-[#1A1A2E] uppercase">
                            ⚠️ ANOMALY
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 bg-[#38B000] border border-[#1A1A2E] text-[9px] font-retro-title text-white uppercase">
                            ✓ NORMAL
                          </span>
                        )}
                      </td>
                      <td className={`py-4 px-6 text-right font-retro-mono text-base ${t.category?.toLowerCase() === 'salary' ? 'text-[#38B000]' : 'text-[#1A1A2E]'}`}>
                        {formatCurrency(parseFloat(t.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="grid grid-cols-1 gap-4 md:hidden">
              {transactions.map((t) => (
                <div
                  key={t.id}
                  className={`bg-white border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] p-4 space-y-3 ${t.is_anomaly ? 'bg-[#FF7676]/5 border-[#FF7676]' : ''}`}
                >
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-bold font-retro-mono text-[#1A1A2E]/70">{t.date}</span>
                    <span className={`font-retro-mono text-base font-bold ${t.category?.toLowerCase() === 'salary' ? 'text-[#38B000]' : 'text-[#1A1A2E]'}`}>
                      {formatCurrency(parseFloat(t.amount))}
                    </span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold">{t.description || '—'}</h4>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-[#1A1A2E]/20">
                    <span className="px-2 py-0.5 border border-[#1A1A2E] bg-[#F5EBE6] text-[10px] font-retro-mono font-bold uppercase">
                      {t.category || 'Unclassified'}
                    </span>
                    {t.is_anomaly ? (
                      <span className="text-[9px] font-retro-title text-[#FF7676] uppercase">⚠️ ANOMALY</span>
                    ) : (
                      <span className="text-[9px] font-retro-title text-[#38B000] uppercase">✓ NORMAL</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <section className="flex items-center justify-center gap-4 pt-4" id="pagination-controls">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="px-3.5 py-2 bg-[#FFDE4D] border-2 border-[#1A1A2E] hover:bg-[#FFDE4D]/80 text-xs font-retro-title uppercase shadow-[2px_2px_0px_#1A1A2E] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none transition-all cursor-pointer"
                  id="prev-page-btn"
                >
                  Prev
                </button>
                <span className="text-xs font-bold font-retro-mono uppercase text-[#1A1A2E]/70">
                  Page <span className="text-[#FF6FB5] font-bold">{page}</span> of <span className="text-[#1A1A2E]">{totalPages}</span>
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  className="px-3.5 py-2 bg-[#FFDE4D] border-2 border-[#1A1A2E] hover:bg-[#FFDE4D]/80 text-xs font-retro-title uppercase shadow-[2px_2px_0px_#1A1A2E] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none transition-all cursor-pointer"
                  id="next-page-btn"
                >
                  Next
                </button>
              </section>
            )}
          </div>
        )}
      </div>
    </>
  );
}
