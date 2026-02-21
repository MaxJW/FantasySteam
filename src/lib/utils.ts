import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
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
