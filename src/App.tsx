import {
  CSSProperties,
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Boxes,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Database,
  Download,
  FileText,
  LayoutDashboard,
  LineChart,
  Menu,
  Moon,
  Package2,
  Paperclip,
  Search,
  Send,
  Settings,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  UploadCloud,
  Users,
  X,
  Zap,
  DollarSign,
  Activity,
} from 'lucide-react'
import { anomalies, channelData, customers, expenses, inventory, products, revenueData, weeklyRevenue } from './data'
import { downloadExecutiveReport } from './report'

/* ═══════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════ */

type Page = 'overview' | 'analytics' | 'customers' | 'inventory' | 'reports'
type MessageKind = 'profit' | 'churn' | 'actions' | 'inventory'
type Message = { role: 'assistant' | 'user'; content: string; kind?: MessageKind }

const sidebarNav: { id: Page | 'copilot' | 'revenue' | 'operations' | 'settings'; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'analytics', label: 'Command Center', icon: Target },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'revenue', label: 'Revenue', icon: DollarSign },
  { id: 'operations', label: 'Operations', icon: Activity },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'copilot', label: 'AI Insights', icon: Sparkles },
  { id: 'settings', label: 'Settings', icon: Settings },
]

const pageNames: Record<Page, string> = {
  overview: 'Command Center',
  analytics: 'Performance Analytics',
  customers: 'Customer Intelligence',
  inventory: 'Inventory Planning',
  reports: 'Executive Reports',
}

const priorityItems = [
  { type: 'Risk 01', tone: 'critical' as const, title: 'Customer retention risk', evidence: '17 accounts entered the high-risk band; three have been inactive for 31–48 days.', cause: 'Purchase recency and falling order frequency are the dominant model drivers.', urgency: 'Act within 72 hours', impact: '8,200 TND recoverable', action: 'Open customer plan', page: 'customers' as Page },
  { type: 'Risk 02', tone: 'warning' as const, title: 'Campaign cost anomaly', evidence: 'Campaign X spend is 31% above its rolling 30-day baseline.', cause: 'Cost per acquisition rose while marketplace conversion fell below trend.', urgency: 'Review today', impact: '4,200 TND at risk', action: 'Inspect performance', page: 'analytics' as Page },
  { type: 'Opportunity 03', tone: 'opportunity' as const, title: 'Product demand opportunity', evidence: 'Smart POS demand velocity increased 19% in seven days.', cause: 'Direct and e-commerce orders are accelerating ahead of forecast.', urgency: 'Reorder by 16 Sep', impact: '12,600 TND protected', action: 'Review reorder', page: 'inventory' as Page },
]

const healthSystems = [
  { label: 'Revenue', score: 91, factor: '14.2% monthly growth', color: '#2C956A' },
  { label: 'Customers', score: 76, factor: '17 accounts require attention', color: '#7C5CFC' },
  { label: 'Inventory', score: 88, factor: '92% lines in healthy range', color: '#2C956A' },
  { label: 'Cash flow', score: 71, factor: '4.2% above operating plan', color: '#B79A70' },
  { label: 'Operations', score: 84, factor: '6.4× stock turnover', color: '#2F6F6D' },
]

/* ═══════════════════════════════════════════════════════════════
   Reveal System — IntersectionObserver-based scroll animations
   ═══════════════════════════════════════════════════════════════ */

function useReveal(containerRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { root: null, rootMargin: '0px 0px -40px 0px', threshold: 0.08 }
    )
    const elements = root.querySelectorAll('.reveal')
    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [containerRef])
}

/* ═══════════════════════════════════════════════════════════════
   Shared Components
   ═══════════════════════════════════════════════════════════════ */

function StatusDot({ state = 'idle' }: { state?: 'idle' | 'thinking' }) {
  return <span className={`status-dot ${state === 'thinking' ? 'status-dot--thinking' : ''}`} aria-hidden="true"><i /><i /><i /></span>
}

function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand-lockup ${compact ? 'brand-lockup--compact' : ''}`}>
      <img src="/atlasyn-logo.png" alt="" />
      {!compact && <span><strong>ATLASYN</strong><small>INSIGHT</small></span>}
    </span>
  )
}

function BootSequence({ onComplete }: { onComplete: () => void }) {
  const [dismissing, setDismissing] = useState(false)
  useEffect(() => {
    const showTimer = window.setTimeout(() => setDismissing(true), 1100)
    const doneTimer = window.setTimeout(onComplete, 1600)
    return () => { window.clearTimeout(showTimer); window.clearTimeout(doneTimer) }
  }, [onComplete])
  return (
    <div className={`boot-sequence ${dismissing ? 'dismissing' : ''}`} role="status" aria-label="Loading ATLASYN Insight">
      <div className="boot-logo"><img src="/atlasyn-logo.png" alt="ATLASYN" /></div>
      <p>Connecting intelligence…</p>
    </div>
  )
}

function SectionLabel({ index, children }: { index: string; children: ReactNode }) {
  return <span className="section-label"><i>{index}</i>{children}</span>
}

function DateControl({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="date-control">
      <CalendarDays size={14} />
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label="Date range">
        <option>Last 30 days</option>
        <option>Last quarter</option>
        <option>Year to date</option>
      </select>
      <ChevronDown size={12} aria-hidden="true" />
    </label>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Sidebar Navigation (New Premium Layout)
   ═══════════════════════════════════════════════════════════════ */

function Sidebar({ page, onNavigate, onCopilot }: { page: Page; onNavigate: (page: Page) => void; onCopilot: () => void }) {
  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <div className="sidebar-brand">
        <BrandLockup />
      </div>
      <nav className="sidebar-nav">
        {sidebarNav.map(({ id, label, icon: Icon }) => (
          <button
            key={label}
            className={id !== 'copilot' && id !== 'revenue' && id !== 'operations' && id !== 'settings' && page === id ? 'active' : ''}
            aria-current={id !== 'copilot' && id !== 'revenue' && id !== 'operations' && id !== 'settings' && page === id ? 'page' : undefined}
            onClick={() => {
              if (id === 'copilot') onCopilot()
              else if (id === 'revenue' || id === 'operations' || id === 'settings') onNavigate('analytics')
              else onNavigate(id)
            }}
          >
            {id === 'copilot' ? <Sparkles size={18} strokeWidth={1.7} /> : <Icon size={18} strokeWidth={1.7} />}
            {label}
          </button>
        ))}
      </nav>

      {/* Promo card */}
      <div className="sidebar-promo">
        <h3>Turn data into growth.</h3>
        <p>Smarter insights for a stronger tomorrow.</p>
        <button aria-label="Learn more"><ArrowRight size={16} /></button>
      </div>

      {/* User */}
      <div className="sidebar-user">
        <span className="sidebar-avatar">AB</span>
        <div className="sidebar-user-info">
          <strong>Amine</strong>
          <span>Admin</span>
        </div>
      </div>
    </aside>
  )
}

function MobileNavigation({ open, page, onClose, onNavigate, onCopilot }: { open: boolean; page: Page; onClose: () => void; onNavigate: (page: Page) => void; onCopilot: () => void }) {
  const panelRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const frame = window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('button')?.focus())
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') { onClose(); return }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled])'))
      const first = focusable[0]; const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => { window.cancelAnimationFrame(frame); document.removeEventListener('keydown', keydown); previous?.focus() }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="mobile-nav-layer">
      <button className="mobile-nav-backdrop" aria-label="Close navigation" onClick={onClose} />
      <aside id="mobile-navigation" ref={panelRef} className="mobile-nav" aria-label="Mobile navigation">
        <header>
          <BrandLockup />
          <button onClick={onClose} aria-label="Close navigation"><X size={18} /></button>
        </header>
        <p>Nexa Trade / workspace</p>
        <nav>
          {sidebarNav.map(({ id, label, icon: Icon }) => (
            <button
              key={label}
              className={id !== 'copilot' && id !== 'revenue' && id !== 'operations' && id !== 'settings' && page === id ? 'active' : ''}
              onClick={() => {
                if (id === 'copilot') onCopilot()
                else if (id === 'revenue' || id === 'operations' || id === 'settings') onNavigate('analytics')
                else onNavigate(id)
                onClose()
              }}
            >
              {id === 'copilot' ? <Sparkles size={18} /> : <Icon size={18} />}
              <span>{label}</span>
              <ChevronRight size={14} />
            </button>
          ))}
        </nav>
        <footer><span className="live-pulse" /> ERP, CRM, finance and inventory live</footer>
      </aside>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Top Header (Redesigned)
   ═══════════════════════════════════════════════════════════════ */

function TopHeader({ page, dateRange, mobileOpen, notificationsOpen, onDateChange, onMenu, onCopilot, onNotifications }: {
  page: Page; dateRange: string; mobileOpen: boolean; notificationsOpen: boolean;
  onDateChange: (value: string) => void; onMenu: () => void; onCopilot: () => void; onNotifications: () => void
}) {
  return (
    <header className="top-header">
      <div className="header-left">
        <button className="mobile-menu-button" onClick={onMenu} aria-label="Open navigation" aria-expanded={mobileOpen} aria-controls="mobile-navigation">
          <Menu size={18} />
        </button>
        <div className="header-breadcrumb">
          <Search size={14} />
          <span>/ {pageNames[page]}</span>
        </div>
        <label className="header-search">
          <Search size={15} />
          <input placeholder="Search anything..." aria-label="Search" />
          <kbd>⌘ K</kbd>
        </label>
      </div>
      <div className="header-right">
        <DateControl value={dateRange} onChange={onDateChange} />
        <button className="ask-insight-btn" onClick={onCopilot}>
          <Sparkles size={15} /> Ask Insight
        </button>
        <button className="header-icon notification-trigger" onClick={onNotifications} aria-label="Open notifications" aria-expanded={notificationsOpen}>
          <Bell size={17} /><span className="notification-dot" />
        </button>
        <button className="header-icon" aria-label="Toggle theme">
          <Moon size={17} />
        </button>
      </div>
    </header>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Floating Analytics Cards (Hero)
   ═══════════════════════════════════════════════════════════════ */

function FloatingCards() {
  return (
    <div className="floating-cards">
      {/* Revenue Card */}
      <div className="float-card float-card--revenue">
        <span className="float-card-label">Revenue</span>
        <span className="float-card-change"><TrendingUp size={12} /> +14.2%</span>
        <div className="float-card-mini-chart">
          <i style={{ height: '40%' }} />
          <i style={{ height: '55%' }} />
          <i style={{ height: '45%' }} />
          <i style={{ height: '65%' }} />
          <i style={{ height: '60%' }} />
          <i style={{ height: '80%' }} />
          <i style={{ height: '95%' }} />
        </div>
      </div>

      {/* Customers Card */}
      <div className="float-card float-card--customers">
        <span className="float-card-label">Customers</span>
        <span className="float-card-value">1,284</span>
        <span className="float-card-change"><TrendingUp size={12} /> +98 this month</span>
      </div>

      {/* Profit Margin Card */}
      <div className="float-card float-card--profit">
        <span className="float-card-label">Profit Margin</span>
        <span className="float-card-value">26.9%</span>
        <div className="float-card-mini-line">
          <svg viewBox="0 0 100 30">
            <path d="M0 25 C15 22 25 18 35 20 S55 10 70 12 S85 5 100 3" />
          </svg>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Overview Dashboard (Redesigned)
   ═══════════════════════════════════════════════════════════════ */

function OverviewDashboard({ dateRange, onNavigate, onCopilot, onExport }: {
  dateRange: string; onNavigate: (page: Page) => void; onCopilot: () => void; onExport: () => void
}) {
  const [selectedSystem, setSelectedSystem] = useState(0)
  const [selectedPoint, setSelectedPoint] = useState(5)
  const dashRef = useRef<HTMLElement>(null)
  useReveal(dashRef)

  const metrics = useMemo(() =>
    dateRange === 'Year to date'
      ? { revenue: '1.12M TND', profit: '302,800 TND', customers: '1,284', expenses: '817,200 TND' }
      : dateRange === 'Last quarter'
        ? { revenue: '375,100 TND', profit: '101,640 TND', customers: '1,284', expenses: '259,900 TND' }
        : { revenue: '142,500 TND', profit: '38,420 TND', customers: '1,284', expenses: '97,680 TND' },
    [dateRange]
  )

  const system = healthSystems[selectedSystem]

  // Revenue chart data
  const points = revenueData.map((point, index) => {
    const value = point.actual ?? point.forecast ?? 0
    return {
      ...point,
      value,
      x: 6 + (index / (revenueData.length - 1)) * 88,
      y: 82 - ((value - 88) / 90) * 66,
      forecastPoint: point.actual == null,
    }
  })
  const currentPoint = points[selectedPoint]
  const actualPath = points.slice(0, 6).map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const forecastPath = points.slice(5).map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

  const topPriority = priorityItems[0]

  return (
    <main className="dashboard" ref={dashRef}>
      {/* Hero Section */}
      <section className="hero-section reveal" data-delay="0">
        <div className="hero-content">
          <div className="hero-live-badge">
            <span className="live-dot" />
            Live · 4 sources connected
          </div>
          <h1>Good morning, <em>Amine.</em></h1>
          <p>Revenue is accelerating, but retention and campaign efficiency need decisions today.</p>
          <div className="hero-actions">
            <button className="primary-action" onClick={onExport}><Download size={15} /> Export brief</button>
            <button className="text-action" onClick={onCopilot}><Sparkles size={15} /> Ask a question</button>
          </div>
        </div>
        <div className="hero-scene">
          <img src="/hero-avatar.jpg" alt="ATLASYN Intelligence" />
          <FloatingCards />
        </div>
      </section>

      {/* Priority Alert */}
      <div className="priority-alert reveal" data-delay="1">
        <AlertTriangle size={18} />
        <div className="priority-alert-content">
          <span>Priority · {topPriority.urgency}</span>
          <strong>{topPriority.title} — {topPriority.impact}</strong>
        </div>
        <button onClick={() => onNavigate(topPriority.page)}>{topPriority.action} <ArrowRight size={13} /></button>
        <button className="alert-close" aria-label="Dismiss alert"><X size={14} /></button>
      </div>

      {/* KPI Metric Cards */}
      <div className="kpi-grid reveal" data-delay="2">
        <div className="kpi-card">
          <div className="kpi-header">
            <span><LineChart size={14} /> Net revenue</span>
            <span className="kpi-badge positive">+14.2%</span>
          </div>
          <strong className="kpi-value">{metrics.revenue.split(' ')[0]} <small>TND</small></strong>
          <span className="kpi-subtitle">↗ 14.2% vs previous</span>
          <div className="kpi-sparkline">
            <svg viewBox="0 0 120 32">
              <path className="area" d="M0 28 L15 24 L30 26 L45 20 L60 22 L75 16 L90 18 L105 10 L120 8 L120 32 L0 32 Z" fill="rgba(44,149,106,0.08)" />
              <path className="line" d="M0 28 L15 24 L30 26 L45 20 L60 22 L75 16 L90 18 L105 10 L120 8" stroke="#2C956A" />
            </svg>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span><DollarSign size={14} /> Gross profit</span>
            <span className="kpi-badge neutral">+6.7%</span>
          </div>
          <strong className="kpi-value">{metrics.profit.split(' ')[0]} <small>TND</small></strong>
          <span className="kpi-subtitle">↗ 6.7% · 26.9% margin</span>
          <div className="kpi-sparkline">
            <svg viewBox="0 0 120 32">
              <path className="area" d="M0 26 L20 22 L40 24 L60 18 L80 20 L100 14 L120 12 L120 32 L0 32 Z" fill="rgba(183,154,112,0.08)" />
              <path className="line" d="M0 26 L20 22 L40 24 L60 18 L80 20 L100 14 L120 12" stroke="#B79A70" />
            </svg>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span><Users size={14} /> Active customers</span>
            <span className="kpi-badge positive">+98</span>
          </div>
          <strong className="kpi-value">{metrics.customers}</strong>
          <span className="kpi-subtitle">↗ 98 added this month</span>
          <div className="kpi-sparkline">
            <svg viewBox="0 0 120 32">
              <path className="area" d="M0 30 L15 28 L30 24 L45 26 L60 20 L75 22 L90 16 L105 14 L120 10 L120 32 L0 32 Z" fill="rgba(124,92,252,0.08)" />
              <path className="line" d="M0 30 L15 28 L30 24 L45 26 L60 20 L75 22 L90 16 L105 14 L120 10" stroke="#7C5CFC" />
            </svg>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span><Zap size={14} /> Operating expense</span>
            <span className="kpi-badge negative">+4.2%</span>
          </div>
          <strong className="kpi-value">{metrics.expenses.split(' ')[0]} <small>TND</small></strong>
          <span className="kpi-subtitle">↗ 4.2% over plan</span>
          <div className="kpi-sparkline">
            <svg viewBox="0 0 120 32">
              <path className="area" d="M0 24 L20 22 L40 20 L60 18 L80 16 L100 12 L120 10 L120 32 L0 32 Z" fill="rgba(231,107,104,0.08)" />
              <path className="line" d="M0 24 L20 22 L40 20 L60 18 L80 16 L100 12 L120 10" stroke="#E76B68" />
            </svg>
          </div>
        </div>
      </div>

      {/* Revenue + Health Grid */}
      <div className="dashboard-content reveal" data-delay="3">
        {/* Revenue Chart */}
        <div className="revenue-panel">
          <div className="revenue-panel-header">
            <div>
              <SectionLabel index="02">Revenue forecast</SectionLabel>
              <h2>Actual vs projected revenue</h2>
            </div>
            <div className="chart-controls">
              <div className="chart-legend">
                <span><i className="actual" /> Actual</span>
                <span><i className="forecast" /> Forecast</span>
              </div>
            </div>
          </div>

          <div className="revenue-chart-container" aria-label="Actual and forecast revenue from April to December">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Revenue rises from 94k TND in April to a forecast 171.2k TND in December">
              <defs>
                <linearGradient id="actual-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#171923" stopOpacity=".06" />
                  <stop offset="1" stopColor="#171923" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="forecast-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#B79A70" stopOpacity=".08" />
                  <stop offset="1" stopColor="#B79A70" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* Grid lines */}
              {[20, 40, 60, 80].map((y) => (
                <line key={y} className="chart-grid-line" x1="4" y1={y} x2="96" y2={y} />
              ))}
              {/* Confidence band */}
              <path className="confidence-band" d="M61 42 L72 30 L83 20 L94 8 L94 30 L83 38 L72 46 L61 55 Z" />
              {/* Areas */}
              <path className="actual-area" d={`${actualPath} L ${points[5].x} 92 L ${points[0].x} 92 Z`} fill="url(#actual-fill)" />
              <path className="forecast-area" d={`${forecastPath} L ${points[8].x} 92 L ${points[5].x} 92 Z`} fill="url(#forecast-fill)" />
              {/* Lines */}
              <path className="actual-line" d={actualPath} />
              <path className="forecast-line" d={forecastPath} />
            </svg>
            <div className="chart-points">
              {points.map((point, index) => (
                <button
                  key={point.month}
                  className={`${point.forecastPoint ? 'forecast' : ''} ${selectedPoint === index ? 'active' : ''}`}
                  style={{ '--point-x': `${point.x}%`, '--point-y': `${point.y}%` } as CSSProperties}
                  onMouseEnter={() => setSelectedPoint(index)}
                  onFocus={() => setSelectedPoint(index)}
                  onClick={() => setSelectedPoint(index)}
                  aria-label={`${point.month}: ${point.value} thousand TND${point.forecastPoint ? ' forecast' : ''}`}
                >
                  <i />
                  <span>{point.month}</span>
                </button>
              ))}
            </div>
            <div className="chart-tooltip" style={{ '--tooltip-x': `${currentPoint.x}%`, '--tooltip-y': `${currentPoint.y}%` } as CSSProperties}>
              <span>{currentPoint.month} / {currentPoint.forecastPoint ? 'Forecast' : 'Actual'}</span>
              <strong>{currentPoint.value.toFixed(currentPoint.value % 1 ? 1 : 0)}k TND</strong>
              <p>{currentPoint.forecastPoint ? 'Projection based on order velocity and 18 months of sales history.' : 'Posted revenue from ERP sales ledgers.'}</p>
            </div>
          </div>

          <div className="forecast-summary">
            <div>
              <span>October forecast</span>
              <strong>155,900 TND</strong>
            </div>
            <div>
              <span>Model confidence</span>
              <em>87%</em>
            </div>
            <div className="forecast-actions">
              <button className="ghost-action" onClick={() => onNavigate('analytics')}>
                <LineChart size={14} /> View detailed analysis <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </div>

        {/* Health Panel */}
        <div className="health-panel">
          <div className="health-panel-header">
            <div>
              <SectionLabel index="01">Business health</SectionLabel>
              <h2>System status</h2>
            </div>
            <div className="health-score">
              <strong>82</strong><small>/100</small>
              <span className="health-dot" />
              <span className="health-label">Healthy</span>
            </div>
          </div>
          <div className="system-list">
            {healthSystems.map((item, index) => (
              <button
                key={item.label}
                className={`system-item ${selectedSystem === index ? 'active' : ''}`}
                onClick={() => setSelectedSystem(index)}
              >
                <i style={{ background: item.color }} />
                <span>{item.label}</span>
                <strong>{item.score}</strong>
                <ChevronRight size={14} />
              </button>
            ))}
          </div>
          <div className="health-signal">
            <TrendingUp size={14} />
            Contributing signal: {system.factor}
          </div>
        </div>
      </div>
    </main>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Workspace Pages
   ═══════════════════════════════════════════════════════════════ */

function WorkspaceHeading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return (
    <header className="workspace-heading">
      <div>
        <SectionLabel index={eyebrow}>Intelligence workspace</SectionLabel>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="workspace-actions">{actions}</div>}
    </header>
  )
}

function StatStrip({ items }: { items: { label: string; value: string; note: string; tone?: string }[] }) {
  return (
    <div className="stat-strip">
      {items.map((item, index) => (
        <div key={item.label}>
          <span>0{index + 1} / {item.label}</span>
          <strong>{item.value}</strong>
          <small className={item.tone}>{item.note}</small>
        </div>
      ))}
    </div>
  )
}

function AnalyticsPage({ dateRange, onDateChange, onExport, onCopilot }: { dateRange: string; onDateChange: (value: string) => void; onExport: () => void; onCopilot: () => void }) {
  const maxWeekly = Math.max(...weeklyRevenue.flatMap((item) => [item.revenue, item.target]))
  const pageRef = useRef<HTMLElement>(null)
  useReveal(pageRef)
  return (
    <main className="workspace-page" ref={pageRef}>
      <div className="reveal" data-delay="0">
      <WorkspaceHeading
        eyebrow="AN / 02"
        title="Performance, without the noise."
        description="Follow the signals driving revenue, margin and operational spend across Nexa Trade."
        actions={<>
          <DateControl value={dateRange} onChange={onDateChange} />
          <button className="secondary-action" onClick={onExport}><Download size={15} /> Export</button>
        </>}
      />
      </div>
      <div className="reveal" data-delay="1">
      <StatStrip items={[
        { label: 'Average order', value: '312 TND', note: '↑ 5.4% vs previous' },
        { label: 'Gross margin', value: '26.9%', note: '↑ 1.8 pts above target' },
        { label: 'Acquisition', value: '84 TND', note: '↓ 7.2% lower is better' },
        { label: 'Budget variance', value: '+4.2%', note: '2.1 pts above plan', tone: 'negative-text' },
      ]} />
      </div>
      <section className="insight-ribbon reveal" data-delay="2">
        <Sparkles size={17} />
        <p>
          <span>Insight for this period</span>
          Growth is concentrated in direct and e-commerce sales. Marketplace is the only channel below trend.
        </p>
        <button onClick={onCopilot}>Interrogate signal <ArrowRight size={14} /></button>
      </section>
      <div className="analytics-layout reveal" data-delay="3">
        <section className="editorial-panel weekly-performance">
          <div className="panel-heading">
            <div>
              <SectionLabel index="LIVE / 7D">Daily performance</SectionLabel>
              <h2>Revenue against target</h2>
            </div>
            <span className="panel-unit">TND / 000</span>
          </div>
          <div className="weekly-bars" aria-label="Daily revenue compared with target">
            {weeklyRevenue.map((item) => (
              <div key={item.day}>
                <span className="bar-value">{item.revenue}k</span>
                <div>
                  <i style={{ height: `${(item.target / maxWeekly) * 100}%` }} />
                  <b style={{ height: `${(item.revenue / maxWeekly) * 100}%` }} />
                </div>
                <small>{item.day}</small>
              </div>
            ))}
          </div>
          <div className="chart-key">
            <span><i /> Actual revenue</span>
            <span><i /> Target</span>
          </div>
        </section>
        <section className="editorial-panel channel-performance">
          <div className="panel-heading">
            <div>
              <SectionLabel index="MIX / 04">Contribution</SectionLabel>
              <h2>Sales channels</h2>
            </div>
          </div>
          {channelData.map((channel, index) => (
            <div className="channel-row" key={channel.channel}>
              <span>0{index + 1}</span>
              <p>
                <strong>{channel.channel}</strong>
                <small>{channel.revenue}k TND</small>
              </p>
              <i><b style={{ width: `${(channel.revenue / 60) * 100}%` }} /></i>
              <em className={channel.growth < 0 ? 'negative-text' : 'positive-text'}>
                {channel.growth > 0 ? '+' : ''}{channel.growth}%
              </em>
            </div>
          ))}
        </section>
      </div>
      <div className="analytics-layout lower">
        <section className="editorial-panel product-performance">
          <div className="panel-heading">
            <div>
              <SectionLabel index="MIX / PRODUCT">Product performance</SectionLabel>
              <h2>Where growth is coming from</h2>
            </div>
          </div>
          <div className="data-list-head">
            <span>Product</span><span>Revenue</span><span>Growth</span><span>Margin</span>
          </div>
          {products.map((product, index) => (
            <div className="data-list-row" key={product.name}>
              <span>0{index + 1}</span>
              <strong>{product.name}</strong>
              <b>{product.revenue}k</b>
              <em className={product.growth < 0 ? 'negative-text' : 'positive-text'}>
                {product.growth > 0 ? '+' : ''}{product.growth}%
              </em>
              <small>{product.margin}%</small>
            </div>
          ))}
        </section>
        <section className="editorial-panel expense-performance">
          <div className="panel-heading">
            <div>
              <SectionLabel index="CONTROL / COST">Expense movement</SectionLabel>
              <h2>Current vs previous</h2>
            </div>
          </div>
          {expenses.map((expense) => (
            <div className="expense-row" key={expense.name}>
              <span>{expense.name}</span>
              <div>
                <i style={{ width: `${expense.previous * 2.2}%` }} />
                <b style={{ width: `${expense.current * 2.2}%` }} />
              </div>
              <strong>{expense.current}k</strong>
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}

function CustomersPage({ onCopilot }: { onCopilot: () => void }) {
  const [query, setQuery] = useState('')
  const [highRiskOnly, setHighRiskOnly] = useState(false)
  const [selected, setSelected] = useState(customers[0])
  const visible = customers.filter(
    (customer) => customer.name.toLowerCase().includes(query.toLowerCase()) && (!highRiskOnly || customer.risk >= 75)
  )
  return (
    <main className="workspace-page">
      <WorkspaceHeading
        eyebrow="CU / 03"
        title="Relationships in motion."
        description="Identify retention risk before valuable customers disconnect from the business."
        actions={<button className="primary-action" onClick={onCopilot}><Sparkles size={15} /> Build retention plan</button>}
      />
      <StatStrip items={[
        { label: 'High risk', value: '17', note: '+5 this month', tone: 'negative-text' },
        { label: 'Revenue exposure', value: '32,450 TND', note: '22.7% of monthly revenue' },
        { label: 'Retention rate', value: '91.8%', note: '↑ 1.2 pts vs last month' },
      ]} />
      <section className="relationship-workspace">
        <div className="relationship-list">
          <div className="list-toolbar">
            <div>
              <SectionLabel index="MODEL / 87%">Prediction queue</SectionLabel>
              <h2>Customers requiring action</h2>
            </div>
            <div>
              <label>
                <Search size={14} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customers" aria-label="Search customers" />
              </label>
              <button aria-pressed={highRiskOnly} className={highRiskOnly ? 'active' : ''} onClick={() => setHighRiskOnly((v) => !v)}>
                <SlidersHorizontal size={14} /> {highRiskOnly ? 'High risk' : 'All risk'}
              </button>
            </div>
          </div>
          <div className="relationship-columns">
            <span>Relationship</span><span>Value</span><span>Recency</span><span>Risk</span>
          </div>
          {visible.length ? visible.map((customer, index) => (
            <button className={`relationship-row ${selected.name === customer.name ? 'active' : ''}`} key={customer.name} onClick={() => setSelected(customer)}>
              <span className="relationship-id">0{index + 1}</span>
              <span className="customer-monogram">{customer.initials}</span>
              <strong>{customer.name}<small>Active since 2024</small></strong>
              <b>{customer.value}</b>
              <span>{customer.last}</span>
              <i style={{ '--risk': `${customer.risk}%` } as CSSProperties}><b /></i>
              <em>{customer.risk}%</em>
            </button>
          )) : (
            <div className="empty-state">
              <Search size={20} />
              <strong>No relationships found</strong>
              <p>Adjust the search or risk filter.</p>
            </div>
          )}
        </div>
        <aside className="relationship-brief">
          <SectionLabel index="SELECTED">Relationship brief</SectionLabel>
          <span className="large-monogram">{selected.initials}</span>
          <h2>{selected.name}</h2>
          <p>{selected.risk}% churn probability driven mainly by purchase recency.</p>
          <dl>
            <div><dt>Lifetime value</dt><dd>{selected.value}</dd></div>
            <div><dt>Last purchase</dt><dd>{selected.last}</dd></div>
            <div><dt>Recommended window</dt><dd>Next 72 hours</dd></div>
          </dl>
          <div className="model-drivers">
            <span>Purchase recency <i><b style={{ width: '84%' }} /></i><strong>84%</strong></span>
            <span>Order frequency <i><b style={{ width: '68%' }} /></i><strong>68%</strong></span>
            <span>Support sentiment <i><b style={{ width: '41%' }} /></i><strong>41%</strong></span>
          </div>
          <button className="primary-action" onClick={onCopilot}>Draft outreach strategy <ArrowRight size={14} /></button>
        </aside>
      </section>
    </main>
  )
}

function InventoryPage({ onPlan, onExport, onToast }: { onPlan: () => void; onExport: () => void; onToast: (message: string) => void }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'All statuses' | 'Needs action' | 'Healthy'>('All statuses')
  const [selected, setSelected] = useState(inventory[0])
  const visible = inventory.filter(
    (item) => `${item.product} ${item.sku}`.toLowerCase().includes(query.toLowerCase()) &&
      (status === 'All statuses' || (status === 'Healthy' ? item.status === 'Healthy' : item.status !== 'Healthy'))
  )
  return (
    <main className="workspace-page">
      <WorkspaceHeading
        eyebrow="IN / 04"
        title="Stock, read as a system."
        description="Balance availability and working capital with demand-aware recommendations."
        actions={<>
          <button className="secondary-action" onClick={onExport}><Download size={15} /> Export plan</button>
          <button className="primary-action" onClick={onPlan}><Sparkles size={15} /> Optimize stock</button>
        </>}
      />
      <StatStrip items={[
        { label: 'Inventory value', value: '218,420 TND', note: '↑ 3.8%' },
        { label: 'Stock turnover', value: '6.4×', note: 'Industry median 5.1×' },
        { label: 'Items at risk', value: '8 SKUs', note: '3 critical', tone: 'negative-text' },
        { label: 'Opportunity', value: '18,900 TND', note: 'Recommended orders' },
      ]} />
      <section className="inventory-workspace">
        <div className="inventory-list-panel">
          <div className="list-toolbar">
            <div>
              <SectionLabel index="DEMAND / 89%">Stock model</SectionLabel>
              <h2>Demand-aware recommendations</h2>
            </div>
            <div>
              <label>
                <Search size={14} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search SKU or product" aria-label="Search inventory" />
              </label>
              <label className="select-filter">
                <SlidersHorizontal size={14} />
                <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Inventory status">
                  <option>All statuses</option>
                  <option>Needs action</option>
                  <option>Healthy</option>
                </select>
                <ChevronDown size={12} />
              </label>
            </div>
          </div>
          <div className="inventory-columns">
            <span>Product</span><span>On hand</span><span>Demand</span><span>Coverage</span><span>Status</span>
          </div>
          {visible.length ? visible.map((item, index) => (
            <button className={`inventory-row ${selected.sku === item.sku ? 'active' : ''}`} key={item.sku} onClick={() => setSelected(item)}>
              <span>0{index + 1}</span>
              <strong>{item.product}<small>{item.sku}</small></strong>
              <b>{item.stock}</b>
              <b>{item.demand}</b>
              <span>{item.days} days</span>
              <em className={item.status.toLowerCase()}>{item.status}</em>
            </button>
          )) : (
            <div className="empty-state">
              <Package2 size={20} />
              <strong>No inventory lines found</strong>
              <p>Adjust the search or status filter.</p>
            </div>
          )}
        </div>
        <aside className="inventory-order-panel">
          <SectionLabel index={`SELECTED / ${selected.sku}`}>Demand directive</SectionLabel>
          <div className="order-symbol">
            <Package2 size={24} />
            <span className={selected.status.toLowerCase()} />
          </div>
          <h2>{selected.product}</h2>
          <p>{selected.stock} units on hand against {selected.demand} predicted in the next 30 days.</p>
          <div className="stock-threshold">
            <span style={{ width: `${Math.min(100, (selected.stock / selected.demand) * 100)}%` }} />
            <i style={{ left: `${Math.min(96, (selected.stock / selected.demand) * 100)}%` }}>{selected.stock} units</i>
          </div>
          <div className="demand-curve" aria-label="Demand forecast rises over six weeks">
            <svg viewBox="0 0 260 90" preserveAspectRatio="none">
              <path d="M0 80 C44 74 55 62 92 64 S138 42 168 45 S214 22 260 10" />
              <path d="M0 80 C44 74 55 62 92 64 S138 42 168 45 S214 22 260 10 L260 90 L0 90 Z" />
            </svg>
            <span>W1</span><span>W6</span>
          </div>
          <dl>
            <div><dt>Recommended order</dt><dd>{selected.reorder || 0} units</dd></div>
            <div><dt>Order by</dt><dd>{selected.reorder ? '16 Sep' : 'No action'}</dd></div>
            <div><dt>Revenue protected</dt><dd>{selected.reorder ? '12,600 TND' : '—'}</dd></div>
          </dl>
          {selected.reorder ? (
            <div className="reorder-directive">
              <AlertTriangle size={16} />
              <p>
                <span>AI recommendation</span>
                <strong>Reorder {selected.reorder} units</strong>
                <small>Protect {selected.product === 'Smart POS Terminal' ? '12,600' : '4,800'} TND in forecast sales.</small>
              </p>
            </div>
          ) : (
            <div className="reorder-directive healthy">
              <CheckCircle2 size={16} />
              <p>
                <span>AI recommendation</span>
                <strong>Hold current position</strong>
                <small>Stock remains inside the optimal operating range.</small>
              </p>
            </div>
          )}
          <button className="primary-action" onClick={() =>
            selected.reorder
              ? onToast(`Draft purchase order created for ${selected.reorder} ${selected.product} units.`)
              : onToast(`${selected.product} is already inside the healthy stock range.`)
          }>
            {selected.reorder ? 'Create draft order' : 'Confirm healthy position'} <ArrowRight size={14} />
          </button>
        </aside>
      </section>
    </main>
  )
}

function ReportsPage({ onGenerate, onUpload, onShare }: { onGenerate: () => void; onUpload: (name: string) => void; onShare: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  function stage(file?: File) { if (file) { setFileName(file.name); onUpload(file.name) } }
  return (
    <main className="workspace-page reports-page">
      <WorkspaceHeading
        eyebrow="RP / 06"
        title="Intelligence, made portable."
        description="Generate a decision-ready brief from live ERP, CRM, finance and inventory signals."
        actions={<button className="primary-action" onClick={onGenerate}><Sparkles size={15} /> Generate PDF</button>}
      />
      <div className="reports-layout">
        <article className="report-sheet">
          <header>
            <BrandLockup />
            <div>
              <span>WEEKLY INTELLIGENCE</span>
              <strong>07—13 SEP 2026</strong>
            </div>
          </header>
          <div className="report-hero">
            <span>EXECUTIVE BRIEF / #37</span>
            <h2>Growth is holding.<br />Retention needs a decision.</h2>
            <p>Prepared from connected operational systems for Nexa Trade.</p>
          </div>
          <div className="report-metrics">
            <div>
              <span>Revenue</span>
              <strong>+12.4%</strong>
              <small>week over week</small>
            </div>
            <div>
              <span>Gross margin</span>
              <strong>26.9%</strong>
              <small>+1.8 pts</small>
            </div>
            <div>
              <span>Health score</span>
              <strong>82/100</strong>
              <small>Healthy</small>
            </div>
          </div>
          <section>
            <span>01</span>
            <div>
              <h3>Executive summary</h3>
              <p>Revenue accelerated across direct and e-commerce channels, led by Smart POS Terminal demand. Higher campaign and logistics costs limited profit growth while 17 customers entered the high-risk band.</p>
            </div>
          </section>
          <section>
            <span>02</span>
            <div>
              <h3>Priority actions</h3>
              {priorityItems.map((item, index) => (
                <p className="report-action" key={item.title}>
                  <b>0{index + 1}</b>
                  <span><strong>{item.title}</strong>{item.impact}</span>
                </p>
              ))}
            </div>
          </section>
          <footer>
            <StatusDot />
            <span>AI outlook: revenue is forecast to grow 9.4% in October.</span>
          </footer>
        </article>
        <aside className="reports-console">
          <section>
            <SectionLabel index="EXPORT">Report controls</SectionLabel>
            <h2>Weekly Intelligence #37</h2>
            <p>Generated from four connected source systems with 87% aggregate model confidence.</p>
            <button className="primary-action" onClick={onGenerate}><Download size={15} /> Download branded PDF</button>
            <button className="secondary-action full" onClick={onShare}><Share2 size={15} /> Copy share link</button>
          </section>
          <section>
            <SectionLabel index="CONTEXT">Add source context</SectionLabel>
            <input ref={inputRef} type="file" accept=".pdf,.csv,.xlsx" hidden onChange={(e) => stage(e.target.files?.[0])} />
            <button
              className={`upload-zone ${fileName ? 'staged' : ''}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); stage(e.dataTransfer.files[0]) }}
            >
              <UploadCloud size={20} />
              <strong>{fileName || 'Stage a document'}</strong>
              <span>{fileName ? 'Ready for processing connector' : 'PDF, CSV or XLSX · up to 10 MB'}</span>
            </button>
            <p className="security-note"><ShieldCheck size={12} />Files remain local in this frontend prototype.</p>
          </section>
          <section className="report-history">
            <SectionLabel index="ARCHIVE / 03">Recent reports</SectionLabel>
            {['Weekly Intelligence #36', 'August Board Review', 'Q3 Inventory Outlook'].map((name) => (
              <button key={name} onClick={onGenerate}>
                <FileText size={15} />
                <span><strong>{name}</strong><small>PDF · Ready</small></span>
                <Download size={13} />
              </button>
            ))}
          </section>
        </aside>
      </div>
    </main>
  )
}

/* ═══════════════════════════════════════════════════════════════
   AI Copilot
   ═══════════════════════════════════════════════════════════════ */

function CopilotAnswer({ kind, content, onCopy, onHelpful }: { kind?: MessageKind; content: string; onCopy: () => void; onHelpful: () => void }) {
  const details = kind === 'profit'
    ? { impact: '−8.7% profit movement', calculation: 'Revenue +14.2% − expense growth 18.6% = margin compression', action: 'Cap Campaign X and review logistics variances.', sources: ['Finance ledger', 'Campaign X', 'ERP invoices'] }
    : kind === 'churn'
      ? { impact: '8,200 TND recoverable', calculation: '3 high-value accounts × weighted recovery probability', action: 'Launch a 72-hour account-owner outreach sequence.', sources: ['CRM activity', 'Sales orders', 'Support sentiment'] }
      : kind === 'inventory'
        ? { impact: '12,600 TND protected', calculation: '510 unit demand − 184 on hand = 326 unit gap', action: 'Reorder 350 Smart POS Terminal units by 16 Sep.', sources: ['Inventory ERP', 'POS orders', 'Demand model'] }
        : { impact: '25,000 TND combined impact', calculation: 'Retention + cost control + available demand opportunity', action: 'Sequence retention, campaign review, then purchase order.', sources: ['CRM', 'Finance', 'Inventory'] }
  return (
    <div className="copilot-answer">
      <p>{content}</p>
      {kind && <>
        <div className="answer-impact">
          <span>Estimated financial impact</span>
          <strong>{details.impact}</strong>
        </div>
        <dl>
          <div><dt>Calculation</dt><dd>{details.calculation}</dd></div>
          <div><dt>Recommended action</dt><dd>{details.action}</dd></div>
        </dl>
        <div className="answer-sources">
          <Database size={12} />
          {details.sources.map((source) => <span key={source}>{source}</span>)}
        </div>
        <div className="answer-tools">
          <button onClick={onCopy}><Copy size={12} /> Copy</button>
          <button onClick={onHelpful}>Helpful?</button>
        </div>
      </>}
    </div>
  )
}

function Copilot({ open, onClose, dateRange, onToast }: { open: boolean; onClose: () => void; dateRange: string; onToast: (message: string) => void }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Good morning, Amine. I am connected to your sales, customers, finance and inventory. What decision are we working on?' },
  ])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const drawerRef = useRef<HTMLElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [messages, thinking])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const frame = window.requestAnimationFrame(() => drawerRef.current?.querySelector<HTMLElement>('button')?.focus())
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') { onClose(); return }
      if (event.key !== 'Tab' || !drawerRef.current) return
      const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])'))
      if (!focusable.length) return
      const first = focusable[0]; const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => { window.cancelAnimationFrame(frame); document.removeEventListener('keydown', keydown); previous?.focus() }
  }, [open, onClose])

  function answerFor(prompt: string): Message {
    const value = prompt.toLowerCase()
    if (value.includes('profit') || value.includes('expense')) return { role: 'assistant', kind: 'profit', content: 'Profit declined because operating costs grew 4.4 points faster than revenue, led by Campaign X and logistics.' }
    if (value.includes('churn') || value.includes('customer')) return { role: 'assistant', kind: 'churn', content: 'Seventeen customers are high risk. Carthage Distribution, Medina Retail Group and Sahara Logistics carry the clearest recoverable value.' }
    if (value.includes('stock') || value.includes('inventory') || value.includes('product')) return { role: 'assistant', kind: 'inventory', content: 'Smart POS Terminal will cross its safety threshold in 11 days as demand velocity runs 19% above the recent baseline.' }
    return { role: 'assistant', kind: 'actions', content: 'The highest-value sequence this week is retention outreach, Campaign X control and the Smart POS replenishment decision.' }
  }

  function submit(prompt: string) {
    const clean = prompt.trim()
    if (!clean || thinking) return
    setMessages((current) => [...current, { role: 'user', content: clean }])
    setInput('')
    setThinking(true)
    window.setTimeout(() => {
      setMessages((current) => [...current, answerFor(clean)])
      setThinking(false)
    }, 820)
  }

  function handleSubmit(event: FormEvent) { event.preventDefault(); submit(input) }

  async function copyAnswer(content: string) {
    try { await navigator.clipboard.writeText(content); onToast('Copilot answer copied to the clipboard.') }
    catch { onToast('Clipboard access is unavailable in this browser.') }
  }

  if (!open) return null

  return (
    <div className="copilot-layer open">
      <button className="copilot-backdrop" onClick={onClose} aria-label="Close AI Copilot" />
      <aside ref={drawerRef} className="copilot-panel" role="dialog" aria-modal="true" aria-labelledby="copilot-title">
        <header>
          <div className="copilot-icon"><StatusDot state={thinking ? 'thinking' : 'idle'} /></div>
          <div>
            <SectionLabel index="LIVE">Decision interface</SectionLabel>
            <h2 id="copilot-title">AI Copilot</h2>
          </div>
          <button onClick={onClose} aria-label="Close AI Copilot"><X size={18} /></button>
        </header>
        <div className="copilot-context">
          <span><i /> Nexa Trade</span>
          <span>{dateRange}</span>
          <span>4 sources connected</span>
        </div>
        <div className="copilot-messages" aria-live="polite">
          <div className="conversation-time">TODAY / 09:42</div>
          {messages.map((message, index) => message.role === 'user' ? (
            <div className="user-message" key={index}>
              <p>{message.content}</p>
              <span>AB</span>
            </div>
          ) : (
            <div className="assistant-message" key={index}>
              <span><StatusDot /></span>
              <CopilotAnswer
                kind={message.kind}
                content={message.content}
                onCopy={() => { void copyAnswer(message.content) }}
                onHelpful={() => onToast('Feedback captured. Thank you.')}
              />
            </div>
          ))}
          {thinking && (
            <div className="analysis-state" role="status">
              <div className="analysis-orbit"><StatusDot state="thinking" /></div>
              <div>
                <strong>Consulting the business graph</strong>
                <span><i /> CRM activity</span>
                <span><i /> Finance ledger</span>
                <span><i /> Inventory ERP</span>
              </div>
            </div>
          )}
          {messages.length === 1 && (
            <div className="suggested-questions">
              <span>Suggested decisions</span>
              {['Why did profit decrease?', 'Which customers may churn?', 'What inventory needs action?'].map((prompt) => (
                <button key={prompt} onClick={() => submit(prompt)}>
                  {prompt}<ArrowUpRight size={13} />
                </button>
              ))}
            </div>
          )}
          <div ref={endRef} />
        </div>
        <form className="copilot-composer" onSubmit={handleSubmit}>
          <input ref={fileRef} hidden type="file" onChange={(e) => e.target.files?.[0] && onToast(`${e.target.files[0].name} is staged as Copilot context.`)} />
          <div>
            <button type="button" onClick={() => fileRef.current?.click()} aria-label="Attach a document"><Paperclip size={16} /></button>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about a business decision…" aria-label="Ask AI Copilot" />
            <button className="send-button" type="submit" disabled={!input.trim() || thinking} aria-label="Send question"><Send size={15} /></button>
          </div>
          <span>Answers include evidence from connected demo sources. Verify material decisions.</span>
        </form>
      </aside>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Notifications & Toast
   ═══════════════════════════════════════════════════════════════ */

function NotificationPanel({ open, onClose, onToast }: { open: boolean; onClose: () => void; onToast: (message: string) => void }) {
  if (!open) return null
  return (
    <aside className="notification-panel" aria-label="Notifications">
      <header>
        <div>
          <SectionLabel index="SIGNALS / 03">Live anomalies</SectionLabel>
          <h2>Notifications</h2>
        </div>
        <button onClick={onClose} aria-label="Close notifications"><X size={16} /></button>
      </header>
      {anomalies.map((item, index) => (
        <button key={item.title} onClick={() => { onToast(`${item.title} marked for review.`); onClose() }}>
          <span className={`signal-index ${item.severity}`}>0{index + 1}</span>
          <p>
            <strong>{item.title}</strong>
            <small>{item.detail}</small>
            <time>{item.time}</time>
          </p>
          <ChevronRight size={13} />
        </button>
      ))}
      <button className="notification-review" onClick={() => { onToast('All live anomalies are now in your review queue.'); onClose() }}>
        Add all to review queue <ArrowRight size={13} />
      </button>
    </aside>
  )
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 3600)
    return () => window.clearTimeout(timer)
  }, [message, onClose])
  return (
    <div className="toast" role="status">
      <Check size={16} />
      <p>
        <strong>Action complete</strong>
        <span>{message}</span>
      </p>
      <button onClick={onClose} aria-label="Dismiss"><X size={14} /></button>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   App Root
   ═══════════════════════════════════════════════════════════════ */

export default function App() {
  const [page, setPage] = useState<Page>('overview')
  const [dateRange, setDateRange] = useState('Last 30 days')
  const [copilotOpen, setCopilotOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [booting, setBooting] = useState(() => {
    try { return sessionStorage.getItem('atlasyn-boot-seen') !== '1' } catch { return true }
  })

  const closeCopilot = useCallback(() => setCopilotOpen(false), [])
  const closeMobile = useCallback(() => setMobileOpen(false), [])

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setCopilotOpen(true) }
      if (event.key === 'Escape') { setMobileOpen(false); setNotificationsOpen(false) }
    }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [])

  function completeBoot() {
    try { sessionStorage.setItem('atlasyn-boot-seen', '1') } catch { /* storage may be unavailable */ }
    setBooting(false)
  }

  function navigate(next: Page) {
    setPage(next)
    setNotificationsOpen(false)
    setMobileOpen(false)
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }))
  }

  async function exportReport() {
    try { await downloadExecutiveReport(); setToast('The branded executive PDF was added to your downloads.') }
    catch { setToast('The report could not be generated. Please try again.') }
  }

  async function shareReport() {
    try { await navigator.clipboard.writeText(window.location.href); setToast('The report link was copied to your clipboard.') }
    catch { setToast('Clipboard access is unavailable. Copy the current page URL instead.') }
  }

  return (
    <div className={`app-shell ${copilotOpen ? 'copilot-active' : ''}`}>
      <a className="skip-link" href="#primary-content">Skip to main content</a>
      {booting && <BootSequence onComplete={completeBoot} />}
      <Sidebar page={page} onNavigate={navigate} onCopilot={() => setCopilotOpen(true)} />
      <MobileNavigation open={mobileOpen} page={page} onClose={closeMobile} onNavigate={navigate} onCopilot={() => setCopilotOpen(true)} />
      <div className="app-main" id="primary-content" tabIndex={-1}>
        <TopHeader
          page={page}
          dateRange={dateRange}
          mobileOpen={mobileOpen}
          notificationsOpen={notificationsOpen}
          onDateChange={setDateRange}
          onMenu={() => setMobileOpen(true)}
          onCopilot={() => setCopilotOpen(true)}
          onNotifications={() => setNotificationsOpen((v) => !v)}
        />
        {page === 'overview' && <OverviewDashboard dateRange={dateRange} onNavigate={navigate} onCopilot={() => setCopilotOpen(true)} onExport={() => { void exportReport() }} />}
        {page === 'analytics' && <AnalyticsPage dateRange={dateRange} onDateChange={setDateRange} onExport={() => { void exportReport() }} onCopilot={() => setCopilotOpen(true)} />}
        {page === 'customers' && <CustomersPage onCopilot={() => setCopilotOpen(true)} />}
        {page === 'inventory' && <InventoryPage onPlan={() => setCopilotOpen(true)} onExport={() => { void exportReport() }} onToast={setToast} />}
        {page === 'reports' && <ReportsPage onGenerate={() => { void exportReport() }} onUpload={(name) => setToast(`${name} is staged for the document-processing connector.`)} onShare={() => { void shareReport() }} />}
      </div>
      <NotificationPanel open={notificationsOpen} onClose={() => setNotificationsOpen(false)} onToast={setToast} />
      <Copilot open={copilotOpen} onClose={closeCopilot} dateRange={dateRange} onToast={setToast} />
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  )
}
