import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyA59rW3nWXuou_95VQdfMUSvAqfUj5VYYA",
  authDomain: "project-992c3.firebaseapp.com",
  projectId: "project-992c3",
  storageBucket: "project-992c3.firebasestorage.app",
  messagingSenderId: "528055833033",
  appId: "1:528055833033:web:bcc3339a2ca8f3fd24d818",
  measurementId: "G-HB4EBJH440"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export default app;
