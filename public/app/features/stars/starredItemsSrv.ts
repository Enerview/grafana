import { BehaviorSubject } from 'rxjs';

import { generatedAPI as legacyUserAPI } from '@grafana/api-clients/internal/rtkq/legacy/user';
import { API_GROUP as DASHBOARD_API_GROUP } from '@grafana/api-clients/rtkq/dashboard/v0alpha1';
import { type IconName, locationUtil } from '@grafana/data';
import { config, type StarredItem, type StarredItemsSrv as StarredItemsSrvType } from '@grafana/runtime';
import { UserStorage } from '@grafana/runtime/internal';
import { collectionsAPIv1alpha1 } from 'app/api/clients/collections/v1alpha1';
import { setStarred } from 'app/core/reducers/navBarTree';
import { contextSrv } from 'app/core/services/context_srv';
import { starredFoldersEnabled } from 'app/features/browse-dashboards/utils/dashboards';
import { getGrafanaSearcher } from 'app/features/search/service/searcher';
import { getIconForKind } from 'app/features/search/service/utils';
import { dispatch } from 'app/store/store';

import { findStarredNames, userStarsFieldSelector } from './utils';

/**
 * Starred non-dashboard page (e.g. an app plugin page)
 */
export interface StarredLink {
  id: string;
  title: string;
  url: string;
  starredAt: number;
}

/**
 * Starred items data kept in the user storage
 */
export interface StarredItemsState {
  links: StarredLink[];
  /** Time when dashboards/folders were starred, keyed by uid. Items starred before tracking have no entry. */
  starredAt: Record<string, number>;
}

const STORAGE_SERVICE = 'grafana-starred-items';
const LINKS_KEY = 'links';
const STARRED_AT_KEY = 'starred-at';

/**
 * Icon for starred links. Kinds are only distinguished by icon when folders can be starred too.
 */
export const getStarredLinkIcon = (): IconName | undefined => (starredFoldersEnabled() ? 'apps' : undefined);

const parse = <T>(value: string | null, fallback: T): T => {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) ?? fallback;
  } catch {
    return fallback;
  }
};

let storage: UserStorage | undefined;
const getStorage = () => {
  if (!storage) {
    storage = new UserStorage(STORAGE_SERVICE);
  }
  return storage;
};

/**
 * Starred items state, undefined until loaded
 */
export const starredItemsState$ = new BehaviorSubject<StarredItemsState | undefined>(undefined);

let loadPromise: Promise<StarredItemsState> | undefined;

/**
 * Resets the starred items state. Used for testing purposes.
 * @internal
 */
export const _resetStarredItemsState = () => {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('_resetStarredItemsState() function can only be called from tests.');
  }
  loadPromise = undefined;
  storage = undefined;
  starredItemsState$.next(undefined);
};

/**
 * Load starred items state once per session
 */
export const loadStarredItemsState = (): Promise<StarredItemsState> => {
  if (!loadPromise) {
    loadPromise = (async () => {
      const [links, starredAt] = await Promise.all([
        getStorage().getItem(LINKS_KEY),
        getStorage().getItem(STARRED_AT_KEY),
      ]);
      const state: StarredItemsState = {
        links: parse<StarredLink[]>(links, []),
        starredAt: parse<Record<string, number>>(starredAt, {}),
      };
      starredItemsState$.next(state);
      return state;
    })().catch((error) => {
      loadPromise = undefined;
      throw error;
    });
  }
  return loadPromise;
};

/**
 * Remember when a dashboard or folder was starred so the nav can order items by addition time.
 * Returns the stored time.
 */
export const recordStarredAt = async (uid: string, isStarred: boolean): Promise<number | undefined> => {
  const state = await loadStarredItemsState().catch(() => undefined);
  if (!state) {
    return undefined;
  }

  const starredAt = { ...state.starredAt };
  if (isStarred) {
    starredAt[uid] = Date.now();
  } else {
    delete starredAt[uid];
  }

  starredItemsState$.next({ ...state, starredAt });
  loadPromise = Promise.resolve({ ...state, starredAt });
  await getStorage().setItem(STARRED_AT_KEY, JSON.stringify(starredAt));

  return starredAt[uid];
};

const setStarredLink = async (item: StarredItem, isStarred: boolean) => {
  const state = await loadStarredItemsState();
  const links = state.links.filter((link) => link.id !== item.id);
  const link: StarredLink = { id: item.id, title: item.title, url: item.url, starredAt: Date.now() };

  if (isStarred) {
    links.push(link);
  }

  await getStorage().setItem(LINKS_KEY, JSON.stringify(links));
  starredItemsState$.next({ ...state, links });
  loadPromise = Promise.resolve({ ...state, links });

  dispatch(
    setStarred({
      id: link.id,
      title: link.title,
      url: locationUtil.assureBaseUrl(link.url),
      icon: getStarredLinkIcon(),
      sortWeight: link.starredAt,
      isStarred,
    })
  );
};

const setStarredDashboard = async (item: StarredItem, isStarred: boolean) => {
  if (config.featureToggles.starsFromAPIServer) {
    const args = { id: item.id, name: `user-${contextSrv.user.uid}`, group: DASHBOARD_API_GROUP, kind: 'Dashboard' };
    await dispatch(
      isStarred
        ? collectionsAPIv1alpha1.endpoints.addStar.initiate(args)
        : collectionsAPIv1alpha1.endpoints.removeStar.initiate(args)
    ).unwrap();
  } else {
    const args = { dashboardUid: item.id };
    await dispatch(
      isStarred
        ? legacyUserAPI.endpoints.starDashboardByUid.initiate(args)
        : legacyUserAPI.endpoints.unstarDashboardByUid.initiate(args)
    ).unwrap();
  }

  const starredAt = await recordStarredAt(item.id, isStarred);

  dispatch(
    setStarred({
      id: item.id,
      title: item.title,
      url: locationUtil.assureBaseUrl(`/d/${item.id}`),
      icon: starredFoldersEnabled() ? getIconForKind('dashboard') : undefined,
      sortWeight: starredAt,
      isStarred,
    })
  );
};

const getStarredDashboardUids = async (): Promise<string[]> => {
  if (config.featureToggles.starsFromAPIServer) {
    const stars = await dispatch(
      collectionsAPIv1alpha1.endpoints.listStars.initiate(
        { fieldSelector: userStarsFieldSelector() },
        { subscribe: false, forceRefetch: true }
      )
    ).unwrap();
    return findStarredNames(stars, DASHBOARD_API_GROUP, 'Dashboard');
  }

  return dispatch(
    legacyUserAPI.endpoints.getStars.initiate(undefined, { subscribe: false, forceRefetch: true })
  ).unwrap();
};

const collator = new Intl.Collator();

/**
 * Compare starred items by addition time, items without a known time go first alphabetically
 */
export const compareByStarredAt = (
  a: { starredAt?: number; title: string },
  b: { starredAt?: number; title: string }
) => (a.starredAt ?? 0) - (b.starredAt ?? 0) || collator.compare(a.title, b.title);

/**
 * Starred items service exposed to plugins
 */
export class StarredItemsSrv implements StarredItemsSrvType {
  async getStarredItems(): Promise<StarredItem[]> {
    const [state, dashboardUids] = await Promise.all([loadStarredItemsState(), getStarredDashboardUids()]);

    const titles = new Map<string, string>();
    if (dashboardUids.length) {
      const response = await getGrafanaSearcher().search({ name: dashboardUids, kind: ['dashboard'] });
      for (let i = 0; i < response.view.length; i++) {
        const row = response.view.get(i);
        titles.set(row.uid, row.name);
      }
    }

    return [
      ...dashboardUids.map((uid) => ({
        kind: 'dashboard' as const,
        id: uid,
        title: titles.get(uid) ?? uid,
        url: `/d/${uid}`,
        starredAt: state.starredAt[uid],
      })),
      ...state.links.map((link) => ({ kind: 'link' as const, ...link })),
    ]
      .sort(compareByStarredAt)
      .map(({ kind, id, title, url }) => ({ kind, id, title, url }));
  }

  async setStarred(item: StarredItem, isStarred: boolean): Promise<void> {
    if (item.kind === 'dashboard') {
      return setStarredDashboard(item, isStarred);
    }
    return setStarredLink(item, isStarred);
  }
}
