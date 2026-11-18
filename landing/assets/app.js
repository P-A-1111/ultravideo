// Progressive enhancement only — the pages work without JS.
(function () {
  // Keep the address bar clean after the R2 index fallback redirect.
  if (location.pathname === '/index.html') history.replaceState({}, '', '/');
  else if (location.pathname === '/video/index.html') history.replaceState({}, '', '/video/');

  const reveal = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    reveal.forEach((el) => observer.observe(el));
  } else {
    reveal.forEach((el) => el.classList.add('in'));
  }

  document.querySelectorAll('[data-count]').forEach((el) => {
    const target = Number(el.getAttribute('data-count'));
    const suffix = el.getAttribute('data-suffix') || '';
    let current = 0;
    const step = Math.max(1, Math.ceil(target / 45));
    const timer = setInterval(() => {
      current += step;
      if (current >= target) {
        current = target;
        clearInterval(timer);
      }
      el.textContent = current.toLocaleString('en-US') + suffix;
    }, 24);
  });

  document.addEventListener('mousemove', (event) => {
    const orbs = document.querySelectorAll('.glow');
    const x = event.clientX / window.innerWidth - 0.5;
    const y = event.clientY / window.innerHeight - 0.5;
    orbs.forEach((orb, index) => {
      const depth = index === 0 ? 18 : -12;
      orb.style.translate = `${x * depth}px ${y * depth}px`;
    });
  }, { passive: true });
})();
