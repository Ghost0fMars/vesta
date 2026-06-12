// Firebase compat SDK loaded via CDN in index.html before this script
const firebaseConfig = {
  apiKey: "AIzaSyA_063oG3YeDf1sd-ccn5cGWi_5joGWxGc",
  authDomain: "vesta-alacle.firebaseapp.com",
  projectId: "vesta-alacle",
  storageBucket: "vesta-alacle.firebasestorage.app",
  messagingSenderId: "289543448485",
  appId: "1:289543448485:web:e3582c6ad78f06152cea4c"
};

firebase.initializeApp(firebaseConfig);

window.fbAuth = firebase.auth();
window.fbDb   = firebase.firestore();

window.fbLoadState = async function(uid) {
  try {
    const snap = await window.fbDb.collection('users').doc(uid).get();
    return snap.exists ? snap.data() : null;
  } catch (e) {
    console.error('fbLoadState error:', e);
    return null;
  }
};

window.fbSaveState = function(uid, state) {
  window.fbDb.collection('users').doc(uid).set(state)
    .catch(e => console.error('fbSaveState error:', e));
};

window.fbLogin    = (email, pw) => window.fbAuth.signInWithEmailAndPassword(email, pw);
window.fbRegister = (email, pw) => window.fbAuth.createUserWithEmailAndPassword(email, pw);
window.fbLogout   = () => window.fbAuth.signOut();
window.fbOnAuth   = (cb) => window.fbAuth.onAuthStateChanged(cb);
