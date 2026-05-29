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

  // ── Feedback form → user's mail client (mailto) ──
  // Interim: opens the user's email app pre-filled to the team inbox. Automated
  // SES sending is re-enabled once SES production access is granted.
  const form = document.getElementById('feedback-form');
  if (!form) return;

  const statusEl = document.getElementById('feedback-status');
  const successEl = document.getElementById('feedback-success');
  const catWrap = document.getElementById('feedback-categories');
  let category = 'suggestion';

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
    { emptyBody: 'Please write something.', opening: 'Opening your mail app…' },
    window.__FEEDBACK_STRINGS__ || {}
  );
  const CAT_LABELS = { suggestion: 'Suggestion', bug: 'Bug report', praise: 'Praise', other: 'Other' };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = document.getElementById('feedback-body').value.trim();
    if (!msg) { setStatus(S.emptyBody, 'error'); return; }
    const contact = document.getElementById('feedback-contact').value.trim();
    const catLabel = CAT_LABELS[category] || category;
    setStatus(S.opening, '');
    try {
      const ep = ['focustown1314', 'gmail.com'].join('@');
      const lines = '[Category] ' + catLabel + '\n\n[Message]\n' + msg + '\n\n[Contact email] ' + (contact || 'not provided');
      const mailto = 'mailto:' + ep
        + '?subject=' + encodeURIComponent('[LBT feedback] ' + catLabel)
        + '&body=' + encodeURIComponent(lines);
      window.location.href = mailto;
      form.hidden = true;
      successEl.hidden = false;
    } catch (err) {
      setStatus('Please email focustown1314 [at] gmail.com directly.', 'error');
    }
  });
})();
