import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AizaSyBfvj7GCoLyhJx2vPzDQs4pxV_Tpt5kks",
  authDomain: "gradi-gestao.firebaseapp.com",
  projectId: "gradi-gestao",
  storageBucket: "gradi-gestao.firebasestorage.app",
  messagingSenderId: "483471971037",
  appId: "1:483471971037:web:f0ac295c0e79ed9d57c134"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);