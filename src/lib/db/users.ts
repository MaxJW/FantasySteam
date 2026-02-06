import { doc, getDoc } from 'firebase/firestore';
import { db } from '$lib/firebase';
import type { UserProfile } from './types';

export async function getUserProfile(
	userId: string
): Promise<(UserProfile & { id: string }) | null> {
	const snap = await getDoc(doc(db, 'users', userId));
	if (!snap.exists()) return null;
	return { id: snap.id, ...snap.data() } as UserProfile & { id: string };
}

export async function getDisplayNames(userIds: string[]): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	await Promise.all(
		userIds.map(async (uid) => {
			const profile = await getUserProfile(uid);
			map.set(uid, profile?.displayName?.trim() || '');
		})
	);
	return map;
}
