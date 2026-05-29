/* Landing page interactions — minimal vanilla JS.
   Three concerns: (1) nav burger close-on-click, (2) IntersectionObserver
   reveals, (3) the feedback form POST. Everything else is CSS. */

(function () {
  'use strict';

  // ── Smooth scroll for in-page anchors ──────────────────────
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href').slice(1);
      if (!id) return;
      const target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const toggle = document.getElementById('nav-menu-toggle');
      if (toggle && toggle.checked) toggle.checked = false;
      if (id === 'feedback') {
        const body = document.getElementById('feedback-body');
        if (body) setTimeout(() => body.focus(), 500);
      }
    });
  });

  // ── Section reveal on scroll ───────────────────────────────
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    },
    { rootMargin: '-8% 0px -8% 0px', threshold: 0.04 }
  );
  document.querySelectorAll('.reveal, .reveal--left, .reveal--right, .reveal--scale').forEach((el) => io.observe(el));

  // ── Nav scroll-progress bar (JS fallback for browsers without
  //     native CSS animation-timeline: scroll(root)). ────────────────
  const supportsScrollTimeline =
    typeof CSS !== 'undefined' && CSS.supports && CSS.supports('animation-timeline', 'scroll(root)');
  const progress = document.querySelector('.scroll-progress');
  if (progress && !supportsScrollTimeline) {
    let rafPending = false;
    const updateProgress = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      const pct = max > 0 ? Math.max(0, Math.min(1, h.scrollTop / max)) : 0;
      progress.style.transform = `scaleX(${pct})`;
      rafPending = false;
    };
    window.addEventListener('scroll', () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(updateProgress);
    }, { passive: true });
    updateProgress();
  }

  // ── Stat counter animation ─────────────────────────────────
  function animateCounter(el) {
    const raw = el.getAttribute('data-target') || el.textContent.replace(/,/g, '');
    const target = parseInt(raw, 10);
    if (isNaN(target)) return;
    const duration = 1600;
    const start = performance.now();
    const fmt = (n) => n >= 1000 ? n.toLocaleString() : String(n);
    function step(now) {
      const pct = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - pct, 3);
      el.textContent = fmt(Math.round(ease * target));
      if (pct < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  const counterObs = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.querySelectorAll('[data-counter]').forEach(animateCounter);
          counterObs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.3 }
  );
  document.querySelectorAll('.live-stats-bar').forEach((el) => counterObs.observe(el));

  // ── Feedback form → our backend (POST /api/v1/feedback) ──
  // The endpoint stores the submission in Postgres and fires an admin email
  // via SES. Cross-origin from www.lowbatterytown.com → the apex app host;
  // CORS on the backend whitelists this origin. Override with
  // window.__FEEDBACK_API__ to point at a local/dev backend while testing.
  const API_URL = window.__FEEDBACK_API__ || 'https://lowbatterytown.com/api/v1/feedback';
  const form = document.getElementById('feedback-form');
  if (!form) return;

  const statusEl = document.getElementById('feedback-status');
  const submitBtn = document.getElementById('feedback-submit');
  const successEl = document.getElementById('feedback-success');
  const catWrap = document.getElementById('feedback-categories');
  let category = '建議';

  if (catWrap) {
    catWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.feedback-cat-btn');
      if (!btn) return;
      category = btn.dataset.cat;
      catWrap.querySelectorAll('.feedback-cat-btn').forEach((b) =>
        b.classList.toggle('active', b === btn)
      );
    });
  }

  function setStatus(msg, kind) {
    statusEl.textContent = msg || '';
    statusEl.className = 'feedback-status' + (kind ? ' ' + kind : '');
  }

  const S = Object.assign(
    {
      emptyBody: '請輸入內容',
      tooLong: '內容過長（上限 4000 字）',
      badEmail: '請輸入有效的 Email，或留空。',
      sending: '送出中...',
      sendFailed: '送出失敗，請稍後再試。',
      networkError: '網路錯誤，請稍後再試。',
      sendCta: '▸ 送出',
    },
    window.__FEEDBACK_STRINGS__ || {}
  );

  // Locale is required by the backend (2–8 chars); derive it from the page
  // <html lang> ("zh-Hant" → "zh", "en" → "en") and fall back to "zh".
  const locale = (document.documentElement.lang || 'zh').slice(0, 2);
  // Mirror the backend's EmailStr just enough to avoid a 422 on a typo.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitBtn.disabled) return;

    const body = document.getElementById('feedback-body').value.trim();
    const contact = document.getElementById('feedback-contact').value.trim();
    if (!body) { setStatus(S.emptyBody, 'error'); return; }
    if (body.length > 4000) { setStatus(S.tooLong, 'error'); return; }
    if (contact && !EMAIL_RE.test(contact)) { setStatus(S.badEmail, 'error'); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = S.sending;
    setStatus('', '');

    // Match FeedbackSubmitRequest. Omit contact_email entirely when blank —
    // sending an invalid/placeholder string would fail EmailStr validation.
    const payload = {
      category,
      body,
      locale,
      app_version: 'landing',
      context: { source: 'landing-page' },
    };
    if (contact) payload.contact_email = contact;

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setStatus(S.sendFailed, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = S.sendCta;
        return;
      }
      form.hidden = true;
      successEl.hidden = false;
    } catch (err) {
      setStatus(S.networkError, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = S.sendCta;
    }
  });
})();
