/**
 * A refined "send to Catalyst" flourish: a small document card lifts off the
 * clicked control, glides along a smooth eased arc toward the Catalyst chat
 * composer with a soft accent glow, and settles in with a gentle ring pulse.
 * Purely cosmetic — it never blocks the Catalyst launch and is a no-op under
 * reduced-motion or SSR.
 */

/** The Catalyst composer ("chat bar") — the flourish's landing target. */
const COMPOSER_SELECTOR = '#tour-ai-chat'

export interface FlyToCatalystOptions {
  /** Fired the moment the card lands in the composer (after the arc). Use it to
   *  reveal the attachment in the chat bar so it appears *after* the drop. */
  onLand?: () => void
}

export function flyToCatalyst(origin?: HTMLElement | null, opts: FlyToCatalystOptions = {}) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (reduced || typeof document.body.animate !== 'function') {
    // Still deliver the attachment, just without the flourish — but give the
    // panel a beat to mount and register its attach listener first.
    if (opts.onLand) window.setTimeout(opts.onLand, 350)
    return
  }

  // Capture the launch point now, before the panel opening shifts layout.
  const rect = origin?.getBoundingClientRect()
  const startX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2
  const startY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2

  // Wait briefly for the Catalyst panel to slide in, then land on its composer.
  // Fall back to the upper-right area if the composer never appears.
  resolveComposerRect((target) => {
    const endX = target ? target.left + target.width / 2 : window.innerWidth - 56
    const endY = target
      ? target.top + Math.min(target.height / 2, 38)
      : Math.min(Math.max(window.innerHeight * 0.32, 120), window.innerHeight - 96)
    runFlight(startX, startY, endX, endY, opts.onLand)
  })
}

/** Poll a few animation frames for the composer to mount + settle its layout. */
function resolveComposerRect(done: (rect: DOMRect | null) => void) {
  const deadline = 700 // ms
  const t0 = performance.now()
  const tick = () => {
    const el = document.querySelector<HTMLElement>(COMPOSER_SELECTOR)
    const rect = el?.getBoundingClientRect()
    // Accept once the element is on-screen with a real width (panel expanded).
    if (rect && rect.width > 40 && rect.left < window.innerWidth) {
      // The panel slides/grows in over ~320ms; let that settle so we target the
      // composer's final resting position, not a mid-transition rect.
      window.setTimeout(() => {
        const settled = document.querySelector<HTMLElement>(COMPOSER_SELECTOR)
        done(settled?.getBoundingClientRect() ?? rect)
      }, 360)
      return
    }
    if (performance.now() - t0 > deadline) {
      done(null)
      return
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

/** easeInOutCubic — smooth acceleration then deceleration along the path. */
function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
}

function runFlight(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  onLand?: () => void,
) {
  const dx = endX - startX
  const dy = endY - startY
  // A single control point lifted above the midline gives a clean, readable arc
  // (lift up and over, then settle) rather than a flat dart across the screen.
  const cx = startX + dx * 0.5
  const cy = startY + dy * 0.5 - Math.min(220, Math.abs(dx) * 0.3 + 120)
  const at = (t: number) => {
    const mt = 1 - t
    return {
      x: mt * mt * startX + 2 * mt * t * cx + t * t * endX,
      y: mt * mt * startY + 2 * mt * t * cy + t * t * endY,
    }
  }

  const styles = getComputedStyle(document.documentElement)
  const accent = styles.getPropertyValue('--n9-accent').trim() || '#965034'
  const accentHover = styles.getPropertyValue('--n9-accent-hover').trim() || accent

  // Wrapper rides the path; children handle their own scale/rotate/opacity so
  // transforms compose cleanly without fighting each other.
  const wrap = document.createElement('div')
  wrap.setAttribute('aria-hidden', 'true')
  wrap.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;z-index:9999;pointer-events:none;will-change:transform;'

  const glow = document.createElement('div')
  glow.style.cssText =
    `position:absolute;left:0;top:0;width:96px;height:96px;margin:-48px 0 0 -48px;border-radius:9999px;` +
    `background:radial-gradient(circle, color-mix(in srgb, ${accent} 38%, transparent) 0%, transparent 68%);` +
    `filter:blur(3px);will-change:transform,opacity;`

  const card = document.createElement('div')
  card.style.cssText =
    'position:absolute;left:0;top:0;width:48px;height:60px;margin:-30px 0 0 -24px;will-change:transform,opacity;' +
    'border-radius:8px;background:#fff;overflow:hidden;' +
    'box-shadow:0 10px 22px rgba(28,20,14,0.22),0 3px 6px rgba(28,20,14,0.12);' +
    'border:1px solid rgba(28,20,14,0.06);'
  card.innerHTML =
    `<div style="height:15px;background:linear-gradient(100deg, ${accent}, ${accentHover});"></div>` +
    `<div style="padding:8px 8px 0;">` +
    `<div style="height:3px;border-radius:2px;background:rgba(28,20,14,0.18);margin-bottom:4.5px;"></div>` +
    `<div style="height:3px;border-radius:2px;background:rgba(28,20,14,0.13);margin-bottom:4.5px;width:82%;"></div>` +
    `<div style="height:3px;border-radius:2px;background:rgba(28,20,14,0.13);margin-bottom:4.5px;width:92%;"></div>` +
    `<div style="height:3px;border-radius:2px;background:rgba(28,20,14,0.1);width:58%;"></div>` +
    `</div>`

  wrap.appendChild(glow)
  wrap.appendChild(card)
  document.body.appendChild(wrap)

  const DURATION = 1000

  // Path: many samples with eased progress → smooth curve AND eased velocity.
  const STEPS = 30
  const pathFrames: Keyframe[] = []
  for (let s = 0; s <= STEPS; s++) {
    const p = s / STEPS
    const { x, y } = at(easeInOut(p))
    pathFrames.push({ transform: `translate(${x}px, ${y}px)`, offset: p })
  }
  wrap.animate(pathFrames, { duration: DURATION, easing: 'linear', fill: 'forwards' })

  // Card: anticipation pop → tilt in flight → settle small into the composer.
  card.animate(
    [
      { transform: 'translateZ(0) scale(0.72) rotate(-5deg)', opacity: 0, offset: 0 },
      { transform: 'translateZ(0) scale(1.1) rotate(-2deg)', opacity: 1, offset: 0.16 },
      { transform: 'translateZ(0) scale(1) rotate(4deg)', opacity: 1, offset: 0.55 },
      { transform: 'translateZ(0) scale(0.86) rotate(2deg)', opacity: 1, offset: 0.84 },
      { transform: 'translateZ(0) scale(0.2) rotate(0deg)', opacity: 0, offset: 1 },
    ],
    { duration: DURATION, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' },
  )

  // Glow: a soft accent halo that breathes with the card and fades on arrival.
  const glowAnim = glow.animate(
    [
      { transform: 'scale(0.5)', opacity: 0, offset: 0 },
      { transform: 'scale(0.85)', opacity: 0.55, offset: 0.2 },
      { transform: 'scale(0.7)', opacity: 0.4, offset: 0.7 },
      { transform: 'scale(0.4)', opacity: 0, offset: 1 },
    ],
    { duration: DURATION, easing: 'ease-in-out', fill: 'forwards' },
  )

  const cleanup = () => wrap.remove()
  glowAnim.onfinish = () => {
    cleanup()
    pulseAt(endX, endY, accent)
    onLand?.()
  }
  glowAnim.oncancel = () => {
    cleanup()
    onLand?.()
  }
}

/** An expanding ring + soft glow where the card lands. */
function pulseAt(x: number, y: number, accent: string) {
  const ring = document.createElement('div')
  ring.setAttribute('aria-hidden', 'true')
  ring.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:9998;pointer-events:none;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:9999px;border:2px solid ${accent};`
  document.body.appendChild(ring)

  const glow = document.createElement('div')
  glow.setAttribute('aria-hidden', 'true')
  glow.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:9997;pointer-events:none;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:9999px;background:radial-gradient(circle, color-mix(in srgb, ${accent} 40%, transparent) 0%, transparent 70%);`
  document.body.appendChild(glow)

  const ringAnim = ring.animate(
    [
      { transform: 'scale(0.5)', opacity: 0.7 },
      { transform: 'scale(2.8)', opacity: 0 },
    ],
    { duration: 560, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' },
  )
  const glowAnim = glow.animate(
    [
      { transform: 'scale(0.6)', opacity: 0.7 },
      { transform: 'scale(2.2)', opacity: 0 },
    ],
    { duration: 480, easing: 'ease-out', fill: 'forwards' },
  )
  ringAnim.onfinish = () => ring.remove()
  ringAnim.oncancel = () => ring.remove()
  glowAnim.onfinish = () => glow.remove()
  glowAnim.oncancel = () => glow.remove()
}
