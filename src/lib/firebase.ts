import { getAuth } from 'firebase/auth';
import {
	initializeFirestore,
	persistentLocalCache,
	persistentMultipleTabManager
} from 'firebase/firestore';
import { initializeApp } from 'firebase/app';

const firebaseConfig = {
	apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyBrEhrUk4JBGe7fD3dyA11LxszjJtg7Ync',
	authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'tga-league.firebaseapp.com',
	projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID ?? 'tga-league',
	storageBucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'tga-league.firebasestorage.app',
	messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '24048122768',
	appId: import.meta.env.PUBLIC_FIREBASE_APP_ID ?? '1:24048122768:web:e99d28cf6a54bb4f7f9115'
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
	localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
