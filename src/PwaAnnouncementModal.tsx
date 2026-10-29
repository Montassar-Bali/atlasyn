import React, { useEffect, useRef, useState } from 'react'
import {
  Apple,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Compass,
  Download,
  Home,
  Layout,
  Monitor,
  PlusSquare,
  Share,
  ShieldCheck,
  Smartphone,
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

    // Delay showing until 1.8s after initial render for a smooth entrance
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
        <div className="pwa-reference-card">
          {/* Close button in top-right */}
          <button
            className="pwa-clean-close-btn"
            onClick={handleClose}
            aria-label="Close Announcement"
          >
            <X size={17} />
          </button>

          {view === 'announcement' ? (
            /* ════════════ VIEW 1: EXACT REFERENCE ANNOUNCEMENT ════════════ */
            <div className="pwa-split-container">
              {/* Left Column: Typography, Value Pillars, CTA */}
              <div className="pwa-content-column">
                {/* Badges */}
                <div className="pwa-badges-row">
                  <div className="pwa-whats-new-badge">
                    <span className="pwa-green-dot" />
                    <span>WHAT'S NEW</span>
                  </div>
                  <div className="pwa-version-tag">v1.2</div>
                </div>

                {/* Main Heading */}
                <h2 id="pwa-modal-title" className="pwa-reference-heading">
                  Atlasyn Insight<br />
                  is now <strong>available</strong><br />
                  as a <span className="pwa-gold-highlight">PWA App</span>
                </h2>

                {/* Subtitle */}
                <p className="pwa-reference-desc">
                  Get a faster, more focused experience. Install <strong>Atlasyn Insight</strong> on your device and access it instantly, even offline.
                </p>

                {/* 3 Feature Rows */}
                <div className="pwa-feature-rows">
                  <div className="pwa-feature-row">
                    <div className="pwa-feature-icon-box">
                      <Zap size={17} className="text-amber-600" />
                    </div>
                    <div className="pwa-feature-texts">
                      <strong>Instant Access</strong>
                      <span>Open the app directly from your device without a browser.</span>
                    </div>
                  </div>

                  <div className="pwa-feature-row">
                    <div className="pwa-feature-icon-box">
                      <Layout size={17} className="text-amber-600" />
                    </div>
                    <div className="pwa-feature-texts">
                      <strong>Clean Workspace</strong>
                      <span>A dedicated, distraction-free experience.</span>
                    </div>
                  </div>

                  <div className="pwa-feature-row">
                    <div className="pwa-feature-icon-box">
                      <Home size={17} className="text-amber-600" />
                    </div>
                    <div className="pwa-feature-texts">
                      <strong>Dock & Home Screen</strong>
                      <span>Install it on your desktop or mobile device for one-tap access.</span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons Row */}
                <div className="pwa-buttons-row">
                  <button
                    className="pwa-btn-install-primary"
                    onClick={handleAddToHomeScreen}
                  >
                    <Download size={16} />
                    <span>Add to Home Screen</span>
                    <ArrowRight size={15} />
                  </button>

                  <button
                    className="pwa-btn-maybe-later"
                    onClick={handleClose}
                  >
                    Maybe Later
                  </button>
                </div>

                {/* Security & Convenience Footer */}
                <div className="pwa-reference-footer">
                  <ShieldCheck size={14} className="pwa-shield-icon" />
                  <span>Free update · Installs in seconds · No App Store required</span>
                </div>
              </div>

              {/* Right Column: 3D Laptop & iPhone Mockup on Desk */}
              <div className="pwa-visual-column">
                <img
                  src="/pwa-mockup-clean.png"
                  alt="Atlasyn Insight Laptop and Phone Preview"
                  className="pwa-mockup-image"
                />
              </div>
            </div>
          ) : (
            /* ════════════ VIEW 2: STEP-BY-STEP INSTRUCTIONS GUIDE ════════════ */
            <div className="pwa-guide-view">
              <div className="pwa-guide-topbar">
                <button
                  className="pwa-guide-back-btn"
                  onClick={() => setView('announcement')}
                >
                  <ArrowLeft size={16} />
                  <span>Back to Overview</span>
                </button>
                <div className="pwa-guide-heading">
                  <h3>How to Install Atlasyn v1.2</h3>
                  <p>Choose your platform below for simple 3-step instructions</p>
                </div>
              </div>

              {/* Device Selector Tabs */}
              <div className="pwa-platform-tabs">
                <button
                  className={`pwa-tab-button ${activeTab === 'ios' ? 'active' : ''}`}
                  onClick={() => setActiveTab('ios')}
                >
                  <Apple size={15} />
                  <span>iPhone / iPad</span>
                </button>
                <button
                  className={`pwa-tab-button ${activeTab === 'chrome' ? 'active' : ''}`}
                  onClick={() => setActiveTab('chrome')}
                >
                  <Monitor size={15} />
                  <span>Chrome / Edge</span>
                </button>
                <button
                  className={`pwa-tab-button ${activeTab === 'android' ? 'active' : ''}`}
                  onClick={() => setActiveTab('android')}
                >
                  <Smartphone size={15} />
                  <span>Android</span>
                </button>
                <button
                  className={`pwa-tab-button ${activeTab === 'mac' ? 'active' : ''}`}
                  onClick={() => setActiveTab('mac')}
                >
                  <Compass size={15} />
                  <span>Mac Safari</span>
                </button>
              </div>

              {/* Steps List */}
              <div className="pwa-guide-steps-card">
                {activeTab === 'ios' && (
                  <div className="pwa-steps-grid">
                    <div className="pwa-step-card">
                      <div className="pwa-step-num">1</div>
                      <div className="pwa-step-info">
                        <div className="pwa-action-badge">
                          <Share size={14} />
                          <span>Tap Share</span>
                        </div>
                        <p>In Safari, tap the <strong>Share</strong> icon (square with upward arrow) at the bottom toolbar.</p>
                      </div>
                    </div>
                    <div className="pwa-step-card">
                      <div className="pwa-step-num">2</div>
                      <div className="pwa-step-info">
                        <div className="pwa-action-badge">
                          <PlusSquare size={14} />
                          <span>Add to Home Screen</span>
                        </div>
                        <p>Scroll down the share options and tap <strong>"Add to Home Screen"</strong>.</p>
                      </div>
                    </div>
                    <div className="pwa-step-card">
                      <div className="pwa-step-num">3</div>
                      <div className="pwa-step-info">
                        <div className="pwa-action-badge">
                          <CheckCircle2 size={14} />
                          <span>Tap "Add"</span>
                        </div>
                        <p>Tap <strong>"Add"</strong> in the top-right. Atlasyn will install as a standalone native app!</p>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'chrome' && (
                  <div className="pwa-steps-grid">
                    <div className="pwa-step-card">
                      <div className="pwa-step-num">1</div>
                      <div className="pwa-step-info">
                        <div className="pwa-action-badge">
                          <Download size={14} />
                          <span>Address Bar</span>
                        </div>
                        <p>Look at the right side of the address bar for the <strong>Install</strong> icon (computer ⊕).</p>
                      </div>
                    </div>
                    <div className="pwa-step-card">
                      <div className="pwa-step-num">2</div>
                      <div className="pwa-step-info">
                        <div className="pwa-action-badge">
                          <Monitor size={14} />
                          <span>Click Install</span>
                        </div>
                        <p>Click the icon or open browser menu (⋮) and select <strong>"Install ATLASYN Insight..."</strong>.</p>
                      </div>
                    </div>
                    <div className="pwa-step-card">
                      <div className="pwa-step-num">3</div>
                      <div className="pwa-step-info">
                        <div className="pwa-action-badge">
                          <CheckCircle2 size={14} />
                          <span>Confirm & Pin</span>
                        </div>
                        <p>Click <strong>"Install"</strong> to launch Atlasyn in a distraction-free window with offline cache.</p>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'android' && (
                  <div className="pwa-steps-grid">
                    <div className="pwa-step-card">
                      <div className="pwa-step-num">1</div>
                      <div className="pwa-step-info">
                        <div className="pwa-action-badge">
                          <Share size={14} />
                          <span>Menu (⋮)</span>
                        </div>
                        <p>Tap the <strong>three vertical dots (⋮)</strong> in the top-right corner of Chrome.</p>
                      </div>
                    </div>
                    <div className="pwa-step-card">
                      <div className="pwa-step-num">2</div>
                      <div className="pwa-step-info">
                        <div className="pwa-action-badge">
                          <PlusSquare size={14} />
                          <span>Install app</span>
                        </div>
                        <p>Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</p>
                      </div>
                    </div>
                    <div className="pwa-step-card">
                      <div className="pwa-step-num">3</div>
                      <div className="pwa-step-info">
                        <div className="pwa-action-badge">
                          <CheckCircle2 size={14} />
                          <span>Done</span>
                        </div>
                        <p>Confirm <strong>"Install"</strong>. Atlasyn is now in your app drawer with full offline access.</p>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'mac' && (
                  <div className="pwa-steps-grid">
                    <div className="pwa-step-card">
                      <div className="pwa-step-num">1</div>
                      <div className="pwa-step-info">
                        <div className="pwa-action-badge">
                          <Share size={14} />
                          <span>Safari Menu</span>
                        </div>
                        <p>In Safari (macOS Sonoma+), click <strong>File</strong> in the top menu or the <strong>Share</strong> button.</p>
                      </div>
                    </div>
                    <div className="pwa-step-card">
                      <div className="pwa-step-num">2</div>
                      <div className="pwa-step-info">
                        <div className="pwa-action-badge">
                          <PlusSquare size={14} />
                          <span>Add to Dock</span>
                        </div>
                        <p>Select <strong>"Add to Dock"</strong> from the menu options.</p>
                      </div>
                    </div>
                    <div className="pwa-step-card">
                      <div className="pwa-step-num">3</div>
                      <div className="pwa-step-info">
                        <div className="pwa-action-badge">
                          <CheckCircle2 size={14} />
                          <span>Launch from Dock</span>
                        </div>
                        <p>Click <strong>"Add"</strong>. Atlasyn is now an isolated macOS app with dock badge alerts.</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Direct 1-Click Install Button if supported */}
              {deferredPrompt && (
                <div className="pwa-direct-install-banner">
                  <button
                    className="pwa-btn-install-primary"
                    onClick={async () => {
                      try {
                        await deferredPrompt.prompt()
                        const choice = await deferredPrompt.userChoice
                        if (choice.outcome === 'accepted') {
                          setInstalledSuccess(true)
                          setTimeout(handleClose, 2000)
                        }
                      } catch {}
                    }}
                  >
                    <Download size={16} />
                    <span>Trigger 1-Click Direct Install</span>
                  </button>
                </div>
              )}

              {installedSuccess && (
                <div className="pwa-success-alert">
                  <Check size={16} />
                  <span>Installation started! Atlasyn Insight v1.2 is being added to your device.</span>
                </div>
              )}

              {/* Bottom Done Action */}
              <div className="pwa-guide-footer-actions">
                <button className="pwa-btn-install-primary" onClick={handleClose}>
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
