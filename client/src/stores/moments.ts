import { defineStore } from 'pinia';

import { fetchMomentFeed, fetchMoments } from '../api/gallery';
import { i18n } from '../locales';
import type { FeedItem, FeedRailKind, MomentCapsule } from '../types/api';
import { updateCaptionInItems } from '../utils/caption';

const THIS_WEEK_RADIUS_DAYS = 7;
const LAST_YEAR_RADIUS_DAYS = 45;

interface MomentsState {
  railKind: FeedRailKind;
  railTitle: string;
  railDescription: string;
  railSingularLabel: string;
  items: MomentCapsule[];
  loadingList: boolean;
  listError: string | null;
  currentMoment: MomentCapsule | null;
  currentImages: FeedItem[];
  currentPage: number;
  currentLimit: number;
  currentHasMore: boolean;
  loadingMoment: boolean;
  momentError: string | null;
}

function parseLeadingCount(value: string): number | null {
  const match = value.match(/^(\d+)/);
  if (!match) {
    return null;
  }

  return Number.parseInt(match[1], 10);
}

function localizeRailLabels(kind: FeedRailKind) {
  void i18n.global.locale.value;

  if (kind === 'highlights') {
    return {
      title: i18n.global.t('moments.rails.highlights.title'),
      description: i18n.global.t('moments.rails.highlights.description'),
      singularLabel: i18n.global.t('moments.rails.highlights.singularLabel')
    };
  }

  return {
    title: i18n.global.t('moments.rails.moments.title'),
    description: i18n.global.t('moments.rails.moments.description'),
    singularLabel: i18n.global.t('moments.rails.moments.singularLabel')
  };
}

function getCurrentLocale() {
  return i18n.global.locale.value;
}

function formatLocalizedMonthDay(date: Date) {
  return new Intl.DateTimeFormat(getCurrentLocale(), {
    month: 'long',
    day: 'numeric'
  }).format(date);
}

function formatLocalizedMonthYear(date: Date) {
  return new Intl.DateTimeFormat(getCurrentLocale(), {
    month: 'long',
    year: 'numeric'
  }).format(date);
}

function formatLocalizedDateRange(startDate: Date, endDate: Date) {
  const formatter = new Intl.DateTimeFormat(getCurrentLocale(), {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  if (typeof formatter.formatRange === 'function') {
    return formatter.formatRange(startDate, endDate);
  }

  return `${formatter.format(startDate)} - ${formatter.format(endDate)}`;
}

function localizeCapsule(capsule: MomentCapsule, railKind: FeedRailKind): MomentCapsule {
  void i18n.global.locale.value;

  switch (capsule.id) {
    case 'on-this-day': {
      const date = formatLocalizedMonthDay(new Date());

      return {
        ...capsule,
        title: i18n.global.t('moments.capsules.onThisDay.title'),
        subtitle: i18n.global.t('moments.capsules.onThisDay.subtitle', { date }),
        dateContext: date
      };
    }
    case 'this-week-previous-years': {
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - THIS_WEEK_RADIUS_DAYS);
      const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + THIS_WEEK_RADIUS_DAYS);
      const range = formatLocalizedDateRange(startDate, endDate);

      return {
        ...capsule,
        title: i18n.global.t('moments.capsules.thisWeekPreviousYears.title'),
        subtitle: i18n.global.t('moments.capsules.thisWeekPreviousYears.subtitle', { range }),
        dateContext: range
      };
    }
    case 'from-last-year': {
      const referenceDate = new Date();
      referenceDate.setFullYear(referenceDate.getFullYear() - 1);

      const startDate = new Date(referenceDate);
      startDate.setDate(startDate.getDate() - LAST_YEAR_RADIUS_DAYS);
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(referenceDate);
      endDate.setDate(endDate.getDate() + LAST_YEAR_RADIUS_DAYS);
      endDate.setHours(23, 59, 59, 999);

      return {
        ...capsule,
        title: i18n.global.t('moments.capsules.fromLastYear.title'),
        subtitle: i18n.global.t('moments.capsules.fromLastYear.subtitle', {
          monthYear: formatLocalizedMonthYear(referenceDate)
        }),
        dateContext: formatLocalizedDateRange(startDate, endDate)
      };
    }
    case 'highlight-recent-batches': {
      const count = parseLeadingCount(capsule.dateContext) ?? 0;

      return {
        ...capsule,
        title: i18n.global.t('moments.capsules.highlightRecentBatches.title'),
        subtitle: i18n.global.t('moments.capsules.highlightRecentBatches.subtitle'),
        dateContext:
          count === 1
            ? i18n.global.t('moments.capsules.highlightRecentBatches.dateContextOne', { count })
            : i18n.global.t('moments.capsules.highlightRecentBatches.dateContextOther', { count })
      };
    }
    case 'highlight-forgotten-favorites':
      return {
        ...capsule,
        title: i18n.global.t('moments.capsules.highlightForgottenFavorites.title'),
        subtitle: i18n.global.t('moments.capsules.highlightForgottenFavorites.subtitle'),
        dateContext: i18n.global.t('moments.capsules.highlightForgottenFavorites.dateContext')
      };
    case 'highlight-deep-cuts':
      return {
        ...capsule,
        title: i18n.global.t('moments.capsules.highlightDeepCuts.title'),
        subtitle: i18n.global.t('moments.capsules.highlightDeepCuts.subtitle'),
        dateContext: i18n.global.t('moments.capsules.highlightDeepCuts.dateContext')
      };
    case 'highlight-lucky-dip':
      return {
        ...capsule,
        title: i18n.global.t('moments.capsules.highlightLuckyDip.title'),
        subtitle: i18n.global.t('moments.capsules.highlightLuckyDip.subtitle'),
        dateContext: i18n.global.t('moments.capsules.highlightLuckyDip.dateContext')
      };
    default:
      return railKind === 'highlights' ? capsule : capsule;
  }
}

export const useMomentsStore = defineStore('moments', {
  state: (): MomentsState => ({
    railKind: 'moments',
    railTitle: 'Moments',
    railDescription: 'Memory capsules from your library.',
    railSingularLabel: 'Moment',
    items: [],
    loadingList: false,
    listError: null,
    currentMoment: null,
    currentImages: [],
    currentPage: 1,
    currentLimit: 18,
    currentHasMore: true,
    loadingMoment: false,
    momentError: null
  }),
  getters: {
    displayRailTitle: (state) => localizeRailLabels(state.railKind).title,
    displayRailDescription: (state) => localizeRailLabels(state.railKind).description,
    displayRailSingularLabel: (state) => localizeRailLabels(state.railKind).singularLabel,
    localizedItems: (state) => state.items.map((item) => localizeCapsule(item, state.railKind)),
    currentCapsule: (state) => (state.currentMoment ? localizeCapsule(state.currentMoment, state.railKind) : null),
    currentError: (state) => state.momentError
  },
  actions: {
    removeImage(imageId: number) {
      if (this.currentMoment) {
        const existedInMoment = this.currentImages.some((item) => item.id === imageId);
        this.currentImages = this.currentImages.filter((item) => item.id !== imageId);

        if (existedInMoment) {
          const nextCount = Math.max(0, this.currentMoment.imageCount - 1);
          this.currentMoment = nextCount > 0 ? { ...this.currentMoment, imageCount: nextCount } : null;
          this.currentHasMore = nextCount > this.currentImages.length;
        }
      }
    },

    resetForRebuild() {
      this.railKind = 'moments';
      this.railTitle = 'Moments';
      this.railDescription = 'Memory capsules from your library.';
      this.railSingularLabel = 'Moment';
      this.items = [];
      this.loadingList = false;
      this.listError = null;
      this.currentMoment = null;
      this.currentImages = [];
      this.currentPage = 1;
      this.currentHasMore = true;
      this.loadingMoment = false;
      this.momentError = null;
    },

    async fetchMoments(force = false) {
      if (this.loadingList) {
        return;
      }

      if (!force && this.items.length > 0) {
        return;
      }

      this.loadingList = true;
      this.listError = null;

      try {
        const payload = await fetchMoments();
        this.railKind = payload.railKind;
        this.railTitle = payload.railTitle;
        this.railDescription = payload.railDescription;
        this.railSingularLabel = payload.railSingularLabel;
        this.items = payload.items;
      } catch (error) {
        this.listError = error instanceof Error ? error.message : 'Unable to load the home rail';
      } finally {
        this.loadingList = false;
      }
    },

    async loadMoment(id: string, reset = true) {
      if (this.loadingMoment) {
        return;
      }

      if (reset) {
        this.currentMoment = null;
        this.currentImages = [];
        this.currentPage = 1;
        this.currentHasMore = true;
      }

      this.loadingMoment = true;
      this.momentError = null;

      try {
        const payload = await fetchMomentFeed(id, this.currentPage, this.currentLimit);
        this.railKind = payload.railKind;
        this.railTitle = payload.railTitle;
        this.railDescription = payload.railDescription;
        this.railSingularLabel = payload.railSingularLabel;
        this.currentMoment = payload.moment;
        this.currentImages.push(...payload.items);
        this.currentPage += 1;
        this.currentHasMore = payload.hasMore;
      } catch (error) {
        this.currentMoment = null;
        this.momentError = error instanceof Error ? error.message : 'Unable to load this feed capsule';
      } finally {
        this.loadingMoment = false;
      }
    },

    async loadCapsule(id: string, reset = true) {
      await this.loadMoment(id, reset);
    },

    updateImageCaption(id: number, caption: string | null) {
      this.currentImages = updateCaptionInItems(this.currentImages, id, caption);
    }
  }
});
