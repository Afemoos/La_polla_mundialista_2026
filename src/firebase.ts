import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA-97druvjgXmPyPri3vSQJokktRqo5KSY",
  authDomain: "la-polla-mundialista-5f3f5.firebaseapp.com",
  projectId: "la-polla-mundialista-5f3f5",
  storageBucket: "la-polla-mundialista-5f3f5.firebasestorage.app",
  messagingSenderId: "443987046127",
  appId: "1:443987046127:web:b0e24f508ff793e4c7b51a",
  measurementId: "G-63HNDGC4NM"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const db = getFirestore(app);
export const auth = getAuth(app);
