import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/** Returns initials from name/email, e.g. "John Doe" → "JD", "john@example.com" → "J". */
export function getInitials(
	name: string | null | undefined,
	maxLength = 2
): string {
	const s = (name ?? '').trim();
	if (!s) return '?';
	// Email: use first char of local part
	if (s.includes('@')) {
		const local = s.split('@')[0];
		return (local?.[0] ?? '?').toUpperCase();
	}
	// Name: take first N chars from first/last words
	const parts = s.split(/\s+/).filter(Boolean);
	if (parts.length >= 2 && maxLength >= 2) {
		return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, maxLength);
	}
	return s.slice(0, maxLength).toUpperCase();
}

/** Returns default studio name from display name: first name + "'s Studio" (e.g. "John Smith" → "John's Studio") */
export function getDefaultStudioName(displayName: string | null | undefined): string {
	const first = (displayName ?? '').trim().split(/\s+/)[0];
	if (!first) return 'My Studio';
	return `${first}'s Studio`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
