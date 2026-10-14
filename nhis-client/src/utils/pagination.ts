export type PageItem = number | 'gap-start' | 'gap-end';

/** Page numbers to display: first, last, and a window around the current page. */
export function pageItems(current: number, total: number, siblings = 1): PageItem[] {
  if (total <= 1) return total === 1 ? [1] : [];
  const pages = new Set<number>([1, total]);
  for (let p = current - siblings; p <= current + siblings; p++) if (p >= 1 && p <= total) pages.add(p);
  const sorted = [...pages].sort((a, b) => a - b);
  const items: PageItem[] = [];
  sorted.forEach((page, index) => {
    const previous = sorted[index - 1];
    if (previous !== undefined && page - previous > 1) {
      if (page - previous === 2) items.push(previous + 1);
      else items.push(index === 1 ? 'gap-start' : 'gap-end');
    }
    items.push(page);
  });
  return items;
}
