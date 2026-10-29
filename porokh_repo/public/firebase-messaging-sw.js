importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyDbU6WzpDzjiDGm491YCOi_TQlUgw7rZNU",
  authDomain: "parapothexam.firebaseapp.com",
  databaseURL: "https://parapothexam-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "parapothexam",
  storageBucket: "parapothexam.firebasestorage.app",
  messagingSenderId: "597075104838",
  appId: "1:597075104838:web:708a5d53c39794cf282647"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Background message: ', payload);
  
  // ব্যাকএন্ড থেকে পাঠানো 'data' পেলোড থেকে ডেটা নিচ্ছি
  const title = payload.data?.title || 'পরোখ';
  
  const notificationOptions = {
    body: payload.data?.body,
    icon: '/icons/header.webp', // এটি ডানপাশের ছোট লোগো হিসেবে কাজ করবে
    image: payload.data?.image_url, // এটি স্ক্রিনশটের মতো বড় ব্যানার ছবি হিসেবে কাজ করবে
    badge: '/icons/header.webp', // স্ট্যাটাস বারে (উপরে) দেখানোর জন্য ছোট আইকন
    data: {
      action_link: payload.data?.action_link || '/',
    },
    // স্ক্রিনশটের মতো Action Buttons
    actions: [
      {
        action: 'open',
        title: 'Open'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  };

  self.registration.showNotification(title, notificationOptions);
});

// নোটিফিকেশনে বা বাটনে ক্লিক করলে কী হবে তার লজিক
self.addEventListener('notificationclick', (event) => {
  event.notification.close(); // নোটিফিকেশন রিমুভ করে দেবে

  // যদি ইউজার 'Dismiss' বাটনে ক্লিক করে, তবে শুধু নোটিফিকেশন ক্লোজ হবে, আর কিছু হবে না
  if (event.action === 'dismiss') {
    return;
  }

  // 'Open' এ ক্লিক করলে বা মূল নোটিফিকেশনে ক্লিক করলে লিংকে রিডাইরেক্ট করবে
  const targetUrl = event.notification.data?.action_link || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // যদি অ্যাপের কোনো ট্যাব ওপেন থাকে, সেটাতেই ফোকাস করবে এবং রাউট চেঞ্জ করবে
      for (const client of clientList) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // যদি কোনো ট্যাব ওপেন না থাকে, নতুন উইন্ডো খুলবে
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
