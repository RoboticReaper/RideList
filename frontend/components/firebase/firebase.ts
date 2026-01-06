// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getMessaging, getToken } from "firebase/messaging";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBQTf11FYB8WDQs4OjxWOcefFrrvPO8jb8",
  authDomain: "ridelist-e9048.firebaseapp.com",
  projectId: "ridelist-e9048",
  storageBucket: "ridelist-e9048.firebasestorage.app",
  messagingSenderId: "898027842198",
  appId: "1:898027842198:web:11fcf4b1bc24648c9970b7",
  measurementId: "G-1CWS12QM2J"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
if (await isSupported()) {
  const analytics = getAnalytics(app);
}
