import { initializeApp } from "firebase/app";
import { getMessaging } from "firebase/messaging";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyDbU6WzpDzjiDGm491YCOi_TQlUgw7rZNU",
  authDomain: "parapothexam.firebaseapp.com",
  databaseURL: "https://parapothexam-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "parapothexam",
  storageBucket: "parapothexam.firebasestorage.app",
  messagingSenderId: "597075104838",
  appId: "1:597075104838:web:708a5d53c39794cf282647",
  measurementId: "G-97VXVMSBQV"
};

export const app = initializeApp(firebaseConfig);
export const analytics = typeof window !== "undefined" ? getAnalytics(app) : null;

// Service worker চেকিং করে মেসেজিং ইনিশিয়ালাইজ করা (নোটিফিকেশন ফিচারের জন্য)
export const messaging = typeof window !== "undefined" && 'serviceWorker' in navigator 
  ? getMessaging(app) 
  : null;
