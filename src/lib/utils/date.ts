/** Format date as "Jan 15" (short month + day). */
export function formatDate(dateStr: string): string {
	if (!dateStr) return '';
	const date = new Date(dateStr);
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Format date as "Jan 15, 2025" or "—" if null. */
export function formatDateShort(dateStr: string | null): string {
	if (!dateStr) return '—';
	const d = new Date(dateStr);
	if (Number.isNaN(d.getTime())) return dateStr;
	return d.toLocaleDateString(undefined, {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
}

/** Format date as short month + day for display (e.g. "Jan 15"). */
export function formatDateShortDisplay(dateStr: string | null): string {
	if (!dateStr) return '';
	const d = new Date(dateStr);
	if (Number.isNaN(d.getTime())) return dateStr;
	return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Returns relative date string: "Released", "Tomorrow", "3d", "2w", "3mo".
 */
export function getRelativeDate(dateStr: string): string {
	if (!dateStr) return '';
	const now = new Date();
	const target = new Date(dateStr);
	const diffMs = target.getTime() - now.getTime();
	const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
	if (diffDays <= 0) return 'Released';
	if (diffDays === 1) return 'Tomorrow';
	if (diffDays <= 7) return `${diffDays}d`;
	if (diffDays <= 30) return `${Math.ceil(diffDays / 7)}w`;
	return `${Math.ceil(diffDays / 30)}mo`;
}
