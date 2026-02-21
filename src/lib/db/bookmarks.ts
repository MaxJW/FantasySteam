import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '$lib/firebase';

/**
 * Fetches all bookmarked game IDs for a user.
 */
export async function getBookmarkedGameIds(userId: string): Promise<Set<string>> {
	const ref = collection(db, 'users', userId, 'bookmarks');
	const snap = await getDocs(ref);
	const ids = new Set<string>();
	for (const d of snap.docs) {
		ids.add(d.id);
	}
	return ids;
}

/**
 * Adds a game to the user's bookmarks.
 */
export async function addBookmark(userId: string, gameId: string): Promise<void> {
	const ref = doc(db, 'users', userId, 'bookmarks', gameId);
	await setDoc(ref, {});
}

/**
 * Removes a game from the user's bookmarks.
 */
export async function removeBookmark(userId: string, gameId: string): Promise<void> {
	const ref = doc(db, 'users', userId, 'bookmarks', gameId);
	await deleteDoc(ref);
}
