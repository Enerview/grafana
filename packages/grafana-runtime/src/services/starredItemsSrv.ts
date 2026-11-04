/**
 * Kind of a starred item.
 * - `dashboard` is a regular Grafana dashboard star (same as the star button in the dashboard toolbar).
 * - `link` is any other in-app page (e.g. an app plugin page) shown in the Starred section of the nav.
 *
 * @public
 */
export type StarredItemKind = 'dashboard' | 'link';

/**
 * Item shown in the Starred section of the nav.
 *
 * @public
 */
export interface StarredItem {
  kind: StarredItemKind;
  /** Dashboard UID for dashboards, any stable identifier (e.g. the page path) for links */
  id: string;
  /** Title displayed in the nav */
  title: string;
  /** Url relative to the app sub url. Ignored for dashboards. */
  url: string;
}

/**
 * Allows plugins to read and change the current user's starred items.
 * Starred items are ordered by the time they were starred.
 *
 * @public
 */
export interface StarredItemsSrv {
  getStarredItems(): Promise<StarredItem[]>;
  setStarred(item: StarredItem, isStarred: boolean): Promise<void>;
  /**
   * Update title and url of already starred links (e.g. after a page rename) keeping their order.
   * Items that are not starred are ignored.
   */
  updateStarredItems(items: StarredItem[]): Promise<void>;
}

let singletonInstance: StarredItemsSrv | undefined;

/**
 * Used during startup by Grafana to register the starred items service.
 *
 * @internal
 */
export function setStarredItemsSrv(instance: StarredItemsSrv): void {
  singletonInstance = instance;
}

/**
 * Used to retrieve the starred items service.
 *
 * @public
 */
export function getStarredItemsSrv(): StarredItemsSrv {
  if (!singletonInstance) {
    throw new Error('getStarredItemsSrv() can only be used after the Grafana instance has started.');
  }
  return singletonInstance;
}
