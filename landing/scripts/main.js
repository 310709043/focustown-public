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
    { rootMargin: '-10% 0px -10% 0px', threshold: 0.04 }
  );
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  // ── Feedback form ──────────────────────────────────────────
  const API_BASE = window.__FEEDBACK_API__ || 'https://lowbatterytown.com';
  const form = document.getElementById('feedback-form');
  if (!form) return;

  const statusEl = document.getElementById('feedback-status');
  const submitBtn = document.getElementById('feedback-submit');
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
    {
      emptyBody: '請輸入內容',
      tooLong: '內容過長（上限 4000 字）',
      sending: '送出中...',
      rateLimited: '傳送太快了，請稍後再試。',
      sendFailed: '送出失敗，請稍後再試。',
      networkError: '網路錯誤，請稍後再試。',
      sendCta: '▸ 送出',
    },
    window.__FEEDBACK_STRINGS__ || {}
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitBtn.disabled) return;

    const body = document.getElementById('feedback-body').value.trim();
    const contact = document.getElementById('feedback-contact').value.trim();
    if (!body) { setStatus(S.emptyBody, 'error'); return; }
    if (body.length > 4000) { setStatus(S.tooLong, 'error'); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = S.sending;
    setStatus('', '');

    const locale = (navigator.language || 'zh-TW').slice(0, 8);
    const payload = {
      category,
      body,
      contact_email: contact || null,
      locale,
      app_version: 'landing',
      context: {
        url: location.pathname,
        user_agent: navigator.userAgent.slice(0, 200),
      },
    };

    try {
      const res = await fetch(API_BASE + '/api/v1/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.status === 429) {
        setStatus(S.rateLimited, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = S.sendCta;
        return;
      }
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
