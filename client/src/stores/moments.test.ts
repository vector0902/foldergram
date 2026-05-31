import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_LOCALE, i18n } from '../locales';
import type { FeedItem, MomentCapsule } from '../types/api';
import { useMomentsStore } from './moments';

function createFeedItem(id: number): FeedItem {
  return {
    id,
    folderId: 2,
    folderSlug: 'weekend-trip',
    folderName: 'Weekend Trip',
    folderPath: 'weekend-trip',
    folderBreadcrumb: null,
    filename: `capsule-${id}.jpg`,
    width: 1080,
    height: 1080,
    mediaType: 'image',
    durationMs: null,
    isAnimated: false,
    thumbnailUrl: `/thumbs/${id}.webp`,
    previewUrl: `/previews/${id}.webp`,
    sortTimestamp: 1_777_100_000_000 + id,
    takenAt: 1_777_100_000_000 + id
  };
}

function createCapsule(id: string, title: string, subtitle: string, dateContext: string): MomentCapsule {
  return {
    id,
    title,
    subtitle,
    dateContext,
    imageCount: 2,
    coverImage: createFeedItem(1)
  };
}

function formatRange(locale: string, startDate: Date, endDate: Date) {
  const formatter = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  if (typeof formatter.formatRange === 'function') {
    return formatter.formatRange(startDate, endDate);
  }

  return `${formatter.format(startDate)} - ${formatter.format(endDate)}`;
}

describe('useMomentsStore localization', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    i18n.global.locale.value = DEFAULT_LOCALE;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-29T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('localizes highlight rails and static capsule titles from their ids', () => {
    const store = useMomentsStore();

    store.$patch({
      railKind: 'highlights',
      items: [
        createCapsule('highlight-recent-batches', 'Recent Batches', 'Latest runs gathered into one set', '2 batches'),
        createCapsule('highlight-lucky-dip', 'Lucky Dip', 'A playful mix from across the library', 'Stable for today')
      ],
      currentMoment: createCapsule(
        'highlight-recent-batches',
        'Recent Batches',
        'Latest runs gathered into one set',
        '2 batches'
      )
    });

    i18n.global.locale.value = 'zh';

    expect(store.displayRailTitle).toBe('故事');
    expect(store.displayRailSingularLabel).toBe('故事');
    expect(store.localizedItems[0]?.title).toBe('近期批次');
    expect(store.localizedItems[0]?.subtitle).toBe('将最近几次拍摄合并为一个合集');
    expect(store.localizedItems[0]?.dateContext).toBe('2 个批次');
    expect(store.currentCapsule?.title).toBe('近期批次');
  });

  it('localizes date-based moment capsules without leaving English subtitle or date copy behind', () => {
    const store = useMomentsStore();

    store.$patch({
      railKind: 'moments',
      items: [
        createCapsule('on-this-day', 'On This Day', 'May 29 across previous years', 'May 29'),
        createCapsule('this-week-previous-years', 'This Week', 'May 22-36, 2026 from previous years', 'May 22-36, 2026'),
        createCapsule('from-last-year', 'Last Year Around Now', 'A revisit to May 2025', 'Apr 14, 2025 to Jul 13, 2025')
      ],
      currentMoment: createCapsule('from-last-year', 'Last Year Around Now', 'A revisit to May 2025', 'Apr 14, 2025 to Jul 13, 2025')
    });

    i18n.global.locale.value = 'zh';

    const now = new Date('2026-05-29T12:00:00.000Z');
    const referenceDate = new Date(now);
    referenceDate.setFullYear(referenceDate.getFullYear() - 1);
    const thisWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    const thisWeekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
    const lastYearStart = new Date(referenceDate);
    lastYearStart.setDate(lastYearStart.getDate() - 45);
    lastYearStart.setHours(0, 0, 0, 0);
    const lastYearEnd = new Date(referenceDate);
    lastYearEnd.setDate(lastYearEnd.getDate() + 45);
    lastYearEnd.setHours(23, 59, 59, 999);

    const expectedMonthDay = new Intl.DateTimeFormat('zh', {
      month: 'long',
      day: 'numeric'
    }).format(now);
    const expectedThisWeekRange = formatRange('zh', thisWeekStart, thisWeekEnd);
    const expectedLastYearMonth = new Intl.DateTimeFormat('zh', {
      month: 'long',
      year: 'numeric'
    }).format(referenceDate);
    const expectedLastYearRange = formatRange('zh', lastYearStart, lastYearEnd);

    expect(store.localizedItems[0]).toMatchObject({
      title: '历史上的今天',
      subtitle: `${expectedMonthDay} 在往年此日`,
      dateContext: expectedMonthDay
    });
    expect(store.localizedItems[1]).toMatchObject({
      title: '本周回顾',
      subtitle: `${expectedThisWeekRange} 的往年回顾`,
      dateContext: expectedThisWeekRange
    });
    expect(store.currentCapsule).toMatchObject({
      title: '去年此时',
      subtitle: `重温 ${expectedLastYearMonth}`,
      dateContext: expectedLastYearRange
    });
  });
});
