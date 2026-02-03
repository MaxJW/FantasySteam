import {
	GoogleAuthProvider,
	signInWithPopup,
	signOut as firebaseSignOut,
	onAuthStateChanged as firebaseOnAuthStateChanged,
	type User
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { get } from 'svelte/store';
import { writable } from 'svelte/store';
import { auth, db } from './firebase';

export const currentUser = writable<User | null>(undefined);

let initialized = false;

firebaseOnAuthStateChanged(auth, async (user) => {
	currentUser.set(user ?? null);
	if (user && !initialized) {
		initialized = true;
		await ensureUserProfile(user);
	}
});

export async function ensureUserProfile(user: User): Promise<void> {
	const ref = doc(db, 'users', user.uid);
	const snap = await getDoc(ref);
	if (!snap.exists()) {
		await setDoc(ref, {
			displayName: user.displayName ?? '',
			email: user.email ?? '',
			avatarUrl: user.photoURL ?? null,
			createdAt: serverTimestamp()
		});
	} else {
		await setDoc(
			ref,
			{
				displayName: user.displayName ?? '',
				email: user.email ?? '',
				avatarUrl: user.photoURL ?? null
			},
			{ merge: true }
		);
	}
}

export async function signInWithGoogle(): Promise<void> {
	const provider = new GoogleAuthProvider();
	await signInWithPopup(auth, provider);
	const user = auth.currentUser;
	if (user) await ensureUserProfile(user);
}

export async function signOut(): Promise<void> {
	await firebaseSignOut(auth);
}

export function getCurrentUser(): User | null {
	return get(currentUser);
}
