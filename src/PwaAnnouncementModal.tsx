import { useEffect, useRef, useState } from 'react'
import {
  Apple,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Compass,
  Download,
  Laptop,
  Monitor,
  PlusSquare,
  Share,
  Smartphone,
  Sparkles,
  X,
  Zap,
} from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt(): Promise<void>
}

type PlatformTab = 'ios' | 'chrome' | 'android' | 'mac'

function detectDefaultPlatform(): PlatformTab {
  if (typeof window === 'undefined') return 'chrome'
  const ua = window.navigator.userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua)) return 'ios'
  if (/android/.test(ua)) return 'android'
  if (/macintosh|mac os x/.test(ua) && !/chrome|crios/.test(ua) && /safari/.test(ua)) return 'mac'
  return 'chrome'
}

export function isRunningInPwa(): boolean {
  if (typeof window === 'undefined') return false
  const isStandaloneMQ = window.matchMedia('(display-mode: standalone)').matches
  const isIOSStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true
  const isAndroidReferrer = document.referrer.includes('android-app://')
  return isStandaloneMQ || isIOSStandalone || isAndroidReferrer
}

interface PwaAnnouncementModalProps {
  forceOpen?: boolean
  onClose?: () => void
}

export function PwaAnnouncementModal({ forceOpen, onClose }: PwaAnnouncementModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [view, setView] = useState<'announcement' | 'guide'>('announcement')
  const [activeTab, setActiveTab] = useState<PlatformTab>(detectDefaultPlatform())
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installedSuccess, setInstalledSuccess] = useState(false)
  const [tilt, setTilt] = useState({ x: 0, y: 0, glareX: 50, glareY: 50 })
  const cardRef = useRef<HTMLDivElement>(null)

  // Listen for beforeinstallprompt event (Chromium-based browsers)
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // Auto-launch logic: Only if NOT in PWA and not already dismissed in this session
  useEffect(() => {
    if (isRunningInPwa()) {
      return // Never show in PWA mode!
    }

    if (forceOpen) {
      setView('announcement')
      setIsOpen(true)
      return
    }

    const dismissed = sessionStorage.getItem('atlasyn_pwa_v1_2_dismissed')
    if (dismissed === 'true') {
      return
    }

    // Delay showing until 1.8s after initial render for a smooth, high-impact entrance
    const timer = setTimeout(() => {
      setIsOpen(true)
    }, 1800)

    return () => clearTimeout(timer)
  }, [forceOpen])

  // Close handler with session persistence
  const handleClose = () => {
    setIsOpen(false)
    sessionStorage.setItem('atlasyn_pwa_v1_2_dismissed', 'true')
    onClose?.()
  }

  // 3D Parallax Tilt Handler
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left - rect.width / 2
    const y = e.clientY - rect.top - rect.height / 2
    const rotateX = (-y / (rect.height / 2)) * 8
    const rotateY = (x / (rect.width / 2)) * 8
    const glareX = ((e.clientX - rect.left) / rect.width) * 100
    const glareY = ((e.clientY - rect.top) / rect.height) * 100
    setTilt({ x: rotateX, y: rotateY, glareX, glareY })
  }

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0, glareX: 50, glareY: 50 })
  }

  // Primary action: trigger browser prompt if available, and flip to instructions
  const handleAddToHomeScreen = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt()
        const choice = await deferredPrompt.userChoice
        if (choice.outcome === 'accepted') {
          setInstalledSuccess(true)
          setDeferredPrompt(null)
          setTimeout(() => {
            handleClose()
          }, 2400)
          return
        }
      } catch {
        // Fall back to visual guide if direct prompt fails or is dismissed
      }
    }
    // Switch to step-by-step instructions
    setView('guide')
  }

  // If running inside PWA or closed, render nothing
  if (isRunningInPwa() || !isOpen) {
    return null
  }

  return (
    <div
      className="pwa-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-modal-title"
    >
      <div className="pwa-modal-wrapper">
        <div
          ref={cardRef}
          className={`pwa-3d-card ${view === 'guide' ? 'pwa-3d-card--flipped' : ''}`}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{
            transform: `perspective(1200px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          }}
        >
          {/* Ambient 3D Glare Light */}
          <div
            className="pwa-card-glare"
            style={{
              background: `radial-gradient(circle 350px at ${tilt.glareX}% ${tilt.glareY}%, rgba(255, 255, 255, 0.12), transparent 70%)`,
            }}
          />

          {/* Close button */}
          <button className="pwa-close-btn" onClick={handleClose} aria-label="Dismiss PWA update">
            <X size={18} />
          </button>

          {/* ════════════ VIEW 1: 3D ANNOUNCEMENT ════════════ */}
          {view === 'announcement' ? (
            <div className="pwa-card-content">
              {/* 3D Holographic App Icon Stage */}
              <div className="pwa-hologram-stage">
                <div className="pwa-orbit-ring pwa-orbit-ring--outer" />
                <div className="pwa-orbit-ring pwa-orbit-ring--inner" />
                <div className="pwa-hologram-glow" />

                {/* 3D Isometric App Cube / Badge */}
                <div className="pwa-3d-app-badge">
                  <div className="pwa-badge-face pwa-badge-face--front">
                    <img src="/atlasyn-logo.png" alt="Atlasyn Icon" className="pwa-badge-icon" />
                    <div className="pwa-badge-reflection" />
                  </div>
                  <div className="pwa-badge-glow" />
                </div>

                {/* Release Pill Tag */}
                <div className="pwa-version-pill">
                  <span className="pwa-pulse-dot" />
                  <span>v1.2 Official Release</span>
                </div>
              </div>

              {/* Text Header */}
              <div className="pwa-announcement-header">
                <div className="pwa-eyebrow">
                  <Sparkles size={14} className="pwa-sparkle-icon" />
                  <span>NATIVE PWA EXPERIENCE</span>
                </div>
                <h2 id="pwa-modal-title">
                  Atlasyn Insight is now available as a <em>PWA App</em>
                </h2>
                <p>
                  Elevate your executive workflow. Install Atlasyn v1.2 directly to your desktop or mobile device for an ultra-fast, zero-distraction experience.
                </p>
              </div>

              {/* 3 Value Pillars */}
              <div className="pwa-perks-grid">
                <div className="pwa-perk-card">
                  <div className="pwa-perk-icon pwa-perk-icon--teal">
                    <Zap size={18} />
                  </div>
                  <div>
                    <strong>Offline Intelligence</strong>
                    <span>Instant boot without waiting for network loads</span>
                  </div>
                </div>

                <div className="pwa-perk-card">
                  <div className="pwa-perk-icon pwa-perk-icon--gold">
                    <Laptop size={18} />
                  </div>
                  <div>
                    <strong>Standalone Window</strong>
                    <span>Pure fullscreen workspace free of browser tabs</span>
                  </div>
                </div>

                <div className="pwa-perk-card">
                  <div className="pwa-perk-icon pwa-perk-icon--purple">
                    <Smartphone size={18} />
                  </div>
                  <div>
                    <strong>Dock & Home Screen</strong>
                    <span>One-tap access with desktop keyboard shortcuts</span>
                  </div>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pwa-actions-row">
                <button
                  className="pwa-btn pwa-btn--primary pwa-btn--glow"
                  onClick={handleAddToHomeScreen}
                >
                  <PlusSquare size={17} />
                  <span>Add to Home Screen</span>
                  <ArrowRight size={15} className="pwa-arrow-slide" />
                </button>

                <button
                  className="pwa-btn pwa-btn--ghost"
                  onClick={handleClose}
                >
                  Continue in Browser
                </button>
              </div>

              <div className="pwa-footer-hint">
                <span>Free update · Installs in 3 seconds · No App Store required</span>
              </div>
            </div>
          ) : (
            /* ════════════ VIEW 2: STEP-BY-STEP INSTRUCTIONS ════════════ */
            <div className="pwa-card-content pwa-card-content--guide">
              <div className="pwa-guide-header">
                <button
                  className="pwa-back-btn"
                  onClick={() => setView('announcement')}
                  aria-label="Back to announcement"
                >
                  <ArrowLeft size={16} />
                  <span>Back</span>
                </button>
                <div className="pwa-guide-titles">
                  <h2>How to Install Atlasyn v1.2</h2>
                  <p>Select your device below to see exact 3-step instructions</p>
                </div>
              </div>

              {/* Platform Selector Tabs */}
              <div className="pwa-platform-tabs" role="tablist">
                <button
                  className={`pwa-tab-btn ${activeTab === 'ios' ? 'active' : ''}`}
                  onClick={() => setActiveTab('ios')}
                  role="tab"
                  aria-selected={activeTab === 'ios'}
                >
                  <Apple size={15} />
                  <span>iPhone / iPad</span>
                </button>
                <button
                  className={`pwa-tab-btn ${activeTab === 'chrome' ? 'active' : ''}`}
                  onClick={() => setActiveTab('chrome')}
                  role="tab"
                  aria-selected={activeTab === 'chrome'}
                >
                  <Monitor size={15} />
                  <span>Chrome / Edge</span>
                </button>
                <button
                  className={`pwa-tab-btn ${activeTab === 'android' ? 'active' : ''}`}
                  onClick={() => setActiveTab('android')}
                  role="tab"
                  aria-selected={activeTab === 'android'}
                >
                  <Smartphone size={15} />
                  <span>Android</span>
                </button>
                <button
                  className={`pwa-tab-btn ${activeTab === 'mac' ? 'active' : ''}`}
                  onClick={() => setActiveTab('mac')}
                  role="tab"
                  aria-selected={activeTab === 'mac'}
                >
                  <Compass size={15} />
                  <span>Mac Safari</span>
                </button>
              </div>

              {/* Platform Specific Steps */}
              <div className="pwa-steps-container">
                {activeTab === 'ios' && (
                  <div className="pwa-steps-list">
                    <div className="pwa-step-item">
                      <div className="pwa-step-number">1</div>
                      <div className="pwa-step-body">
                        <div className="pwa-step-action-tag">
                          <Share size={15} />
                          <span>Tap Share</span>
                        </div>
                        <p>
                          In Apple Safari, tap the <strong>Share</strong> button (the square with an arrow pointing upward) in the bottom toolbar.
                        </p>
                      </div>
                    </div>

                    <div className="pwa-step-item">
                      <div className="pwa-step-number">2</div>
                      <div className="pwa-step-body">
                        <div className="pwa-step-action-tag">
                          <PlusSquare size={15} />
                          <span>Add to Home Screen</span>
                        </div>
                        <p>
                          Scroll down the share sheet and tap <strong>"Add to Home Screen"</strong> with the square plus icon.
                        </p>
                      </div>
                    </div>

                    <div className="pwa-step-item">
                      <div className="pwa-step-number">3</div>
                      <div className="pwa-step-body">
                        <div className="pwa-step-action-tag">
                          <CheckCircle2 size={15} />
                          <span>Tap "Add"</span>
                        </div>
                        <p>
                          Tap <strong>"Add"</strong> in the top-right corner. ATLASYN Insight will appear on your home screen and run in standalone fullscreen mode!
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'chrome' && (
                  <div className="pwa-steps-list">
                    <div className="pwa-step-item">
                      <div className="pwa-step-number">1</div>
                      <div className="pwa-step-body">
                        <div className="pwa-step-action-tag">
                          <Download size={15} />
                          <span>Look at Address Bar</span>
                        </div>
                        <p>
                          Look at the right side of your browser URL address bar for the <strong>Install</strong> icon (computer or ⊕ icon).
                        </p>
                      </div>
                    </div>

                    <div className="pwa-step-item">
                      <div className="pwa-step-number">2</div>
                      <div className="pwa-step-body">
                        <div className="pwa-step-action-tag">
                          <Monitor size={15} />
                          <span>Click Install</span>
                        </div>
                        <p>
                          Click the icon, or open the browser menu (<strong>⋮</strong> or <strong>…</strong>) and click <strong>"Install ATLASYN Insight..."</strong>.
                        </p>
                      </div>
                    </div>

                    <div className="pwa-step-item">
                      <div className="pwa-step-number">3</div>
                      <div className="pwa-step-body">
                        <div className="pwa-step-action-tag">
                          <CheckCircle2 size={15} />
                          <span>Pin to Dock / Taskbar</span>
                        </div>
                        <p>
                          Confirm <strong>"Install"</strong>. Atlasyn v1.2 will immediately launch in its own native desktop window with high-performance offline caching!
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'android' && (
                  <div className="pwa-steps-list">
                    <div className="pwa-step-item">
                      <div className="pwa-step-number">1</div>
                      <div className="pwa-step-body">
                        <div className="pwa-step-action-tag">
                          <Share size={15} />
                          <span>Open Menu (⋮)</span>
                        </div>
                        <p>
                          In Chrome or your Android browser, tap the <strong>three vertical dots (⋮)</strong> in the upper right corner.
                        </p>
                      </div>
                    </div>

                    <div className="pwa-step-item">
                      <div className="pwa-step-number">2</div>
                      <div className="pwa-step-body">
                        <div className="pwa-step-action-tag">
                          <PlusSquare size={15} />
                          <span>Install app</span>
                        </div>
                        <p>
                          Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong> from the dropdown list.
                        </p>
                      </div>
                    </div>

                    <div className="pwa-step-item">
                      <div className="pwa-step-number">3</div>
                      <div className="pwa-step-body">
                        <div className="pwa-step-action-tag">
                          <CheckCircle2 size={15} />
                          <span>Confirm Installation</span>
                        </div>
                        <p>
                          Tap <strong>"Install"</strong> on the popup. Atlasyn v1.2 is now installed in your app drawer with native push support!
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'mac' && (
                  <div className="pwa-steps-list">
                    <div className="pwa-step-item">
                      <div className="pwa-step-number">1</div>
                      <div className="pwa-step-body">
                        <div className="pwa-step-action-tag">
                          <Share size={15} />
                          <span>Share or File Menu</span>
                        </div>
                        <p>
                          In Safari on macOS Sonoma or later, click the <strong>Share</strong> button in the toolbar, or select <strong>File</strong> in the top menu bar.
                        </p>
                      </div>
                    </div>

                    <div className="pwa-step-item">
                      <div className="pwa-step-number">2</div>
                      <div className="pwa-step-body">
                        <div className="pwa-step-action-tag">
                          <PlusSquare size={15} />
                          <span>Add to Dock</span>
                        </div>
                        <p>
                          Choose <strong>"Add to Dock"</strong> from the menu options.
                        </p>
                      </div>
                    </div>

                    <div className="pwa-step-item">
                      <div className="pwa-step-number">3</div>
                      <div className="pwa-step-body">
                        <div className="pwa-step-action-tag">
                          <CheckCircle2 size={15} />
                          <span>Launch from Dock</span>
                        </div>
                        <p>
                          Click <strong>"Add"</strong>. ATLASYN will now exist as an isolated macOS application in your Dock with notification support!
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Direct Install prompt button if available */}
              {deferredPrompt && (
                <div className="pwa-direct-install-box">
                  <button
                    className="pwa-btn pwa-btn--primary pwa-btn--pulse"
                    onClick={async () => {
                      try {
                        await deferredPrompt.prompt()
                        const choice = await deferredPrompt.userChoice
                        if (choice.outcome === 'accepted') {
                          setInstalledSuccess(true)
                          setTimeout(handleClose, 2000)
                        }
                      } catch {
                        // ignore
                      }
                    }}
                  >
                    <Download size={16} />
                    <span>Trigger 1-Click Direct Install</span>
                  </button>
                </div>
              )}

              {installedSuccess && (
                <div className="pwa-success-banner">
                  <Check size={16} />
                  <span>Installation initiated! Atlasyn v1.2 is ready on your device.</span>
                </div>
              )}

              {/* Bottom Guide Actions */}
              <div className="pwa-actions-row">
                <button className="pwa-btn pwa-btn--primary" onClick={handleClose}>
                  <Check size={16} />
                  <span>Got It, I'll Add It</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
