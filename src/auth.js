function showAuthTab(tab) {
  document.getElementById('auth-login-form').style.display    = tab === 'login'    ? '' : 'none';
  document.getElementById('auth-register-form').style.display = tab === 'register' ? '' : 'none';
  document.getElementById('tab-login').classList.toggle('active',    tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('auth-err').textContent = '';
}

async function handleLogin() {
  const email = document.getElementById('auth-email').value.trim();
  const pw    = document.getElementById('auth-password').value;
  const btn   = document.getElementById('btn-login');
  const err   = document.getElementById('auth-err');
  if (!email || !pw) { err.textContent = 'Remplissez tous les champs'; return; }
  btn.disabled = true;
  btn.textContent = 'Connexion…';
  try {
    await fbLogin(email, pw);
  } catch (e) {
    err.textContent = authErrMsg(e.code);
    btn.disabled = false;
    btn.textContent = 'Se connecter';
  }
}

async function handleRegister() {
  const email = document.getElementById('reg-email').value.trim();
  const pw    = document.getElementById('reg-password').value;
  const pw2   = document.getElementById('reg-password2').value;
  const btn   = document.getElementById('btn-register');
  const err   = document.getElementById('auth-err');
  if (!email || !pw) { err.textContent = 'Remplissez tous les champs'; return; }
  if (pw !== pw2)    { err.textContent = 'Les mots de passe ne correspondent pas'; return; }
  if (pw.length < 6) { err.textContent = 'Mot de passe trop court (6 caractères minimum)'; return; }
  btn.disabled = true;
  btn.textContent = 'Création…';
  try {
    await fbRegister(email, pw);
  } catch (e) {
    err.textContent = authErrMsg(e.code);
    btn.disabled = false;
    btn.textContent = 'Créer mon compte';
  }
}

async function handleLogout() {
  await fbLogout();
  location.reload();
}

function authErrMsg(code) {
  const msgs = {
    'auth/user-not-found':       'Aucun compte avec cet email',
    'auth/wrong-password':       'Mot de passe incorrect',
    'auth/invalid-email':        'Email invalide',
    'auth/email-already-in-use': 'Cet email est déjà utilisé',
    'auth/too-many-requests':    'Trop de tentatives, réessayez plus tard',
    'auth/invalid-credential':   'Email ou mot de passe incorrect',
    'auth/weak-password':        'Mot de passe trop faible',
  };
  return msgs[code] || ('Erreur : ' + code);
}

document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('keydown', e => {
    const authScreen = document.getElementById('auth-screen');
    if (!authScreen || authScreen.classList.contains('hidden')) return;
    if (e.key !== 'Enter') return;
    const loginForm = document.getElementById('auth-login-form');
    if (loginForm && loginForm.style.display !== 'none') handleLogin();
    else handleRegister();
  });
});
