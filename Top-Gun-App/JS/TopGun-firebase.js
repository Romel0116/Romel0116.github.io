import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBHa3hKBpJb5THgJ_5Mz7maooGyuiyDySo",
  authDomain: "top-gun-soccer-app.firebaseapp.com",
  projectId: "top-gun-soccer-app",
  storageBucket: "top-gun-soccer-app.firebasestorage.app",
  messagingSenderId: "845419611365",
  appId: "1:845419611365:web:bae44a2e7f30275463c00c",
  measurementId: "G-Q878DTSWRG"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);