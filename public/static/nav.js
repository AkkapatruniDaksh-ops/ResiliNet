// Shared nav: shows the signed-in user's first name instead of "Login".
fetch('/api/auth/me').then(r => r.json()).then(j => {
  const a = document.getElementById('nav-auth');
  if (!a) return;
  if (j.user) { a.textContent = j.user.first_name || 'My account'; a.href = '/account'; a.title = 'My alerts & profile'; }
  else { a.textContent = 'Login'; a.href = '/login?mode=login&next=' + encodeURIComponent(location.pathname + location.search); }
}).catch(() => {});
