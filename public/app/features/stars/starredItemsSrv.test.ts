import { setStarred } from 'app/core/reducers/navBarTree';
import { getGrafanaSearcher } from 'app/features/search/service/searcher';
import { dispatch } from 'app/store/store';

import { _resetStarredItemsState, recordStarredAt, StarredItemsSrv, starredItemsState$ } from './starredItemsSrv';

const mockStorage = new Map<string, string>();

jest.mock('@grafana/runtime/internal', () => ({
  ...jest.requireActual('@grafana/runtime/internal'),
  UserStorage: jest.fn().mockImplementation(() => ({
    getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStorage.set(key, value);
    }),
  })),
}));

jest.mock('app/store/store', () => ({
  dispatch: jest.fn(),
}));

jest.mock('app/features/search/service/searcher');

const mockedDispatch = jest.mocked(dispatch);
const mockedGetGrafanaSearcher = jest.mocked(getGrafanaSearcher);

const mockStarredDashboards = (uids: string[], names: Record<string, string> = {}) => {
  mockedDispatch.mockImplementation((action) => {
    if (typeof action === 'function') {
      return { unwrap: () => Promise.resolve(uids) };
    }
    return action;
  });

  mockedGetGrafanaSearcher.mockReturnValue({
    search: jest.fn().mockResolvedValue({
      view: {
        length: uids.length,
        get: (index: number) => ({ uid: uids[index], name: names[uids[index]] ?? uids[index] }),
      },
    }),
  } as unknown as ReturnType<typeof getGrafanaSearcher>);
};

describe('StarredItemsSrv', () => {
  let now = 1000;

  beforeEach(() => {
    mockStorage.clear();
    mockedDispatch.mockReset();
    _resetStarredItemsState();
    now = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => now++);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stars a link, persists it and adds it to the nav ordered by the starred time', async () => {
    const srv = new StarredItemsSrv();

    await srv.setStarred({ kind: 'link', id: '/a/app/page', title: 'Page', url: '/a/app/page' }, true);

    expect(JSON.parse(mockStorage.get('links')!)).toEqual([
      { id: '/a/app/page', title: 'Page', url: '/a/app/page', starredAt: 1000 },
    ]);
    expect(mockedDispatch).toHaveBeenCalledWith(
      setStarred({ id: '/a/app/page', title: 'Page', url: '/a/app/page', sortWeight: 1000, isStarred: true })
    );
    expect(starredItemsState$.getValue()?.links).toHaveLength(1);
  });

  it('unstars a link', async () => {
    const srv = new StarredItemsSrv();

    await srv.setStarred({ kind: 'link', id: '/a/app/page', title: 'Page', url: '/a/app/page' }, true);
    await srv.setStarred({ kind: 'link', id: '/a/app/page', title: 'Page', url: '/a/app/page' }, false);

    expect(JSON.parse(mockStorage.get('links')!)).toEqual([]);
    expect(mockedDispatch).toHaveBeenLastCalledWith(
      setStarred({ id: '/a/app/page', title: 'Page', url: '/a/app/page', sortWeight: 1001, isStarred: false })
    );
  });

  it('stars a dashboard and records the starred time', async () => {
    mockStarredDashboards([]);
    const srv = new StarredItemsSrv();

    await srv.setStarred({ kind: 'dashboard', id: 'dash-1', title: 'Dashboard', url: '' }, true);

    expect(JSON.parse(mockStorage.get('starred-at')!)).toEqual({ 'dash-1': 1000 });
    expect(mockedDispatch).toHaveBeenCalledWith(
      setStarred({ id: 'dash-1', title: 'Dashboard', url: '/d/dash-1', sortWeight: 1000, isStarred: true })
    );
  });

  it('returns starred dashboards and links ordered by the starred time', async () => {
    mockStorage.set('starred-at', JSON.stringify({ 'dash-new': 3000 }));
    mockStorage.set(
      'links',
      JSON.stringify([
        { id: '/a/app/second', title: 'Second link', url: '/a/app/second', starredAt: 4000 },
        { id: '/a/app/first', title: 'First link', url: '/a/app/first', starredAt: 2000 },
      ])
    );
    mockStarredDashboards(['dash-new', 'dash-old'], { 'dash-new': 'New dashboard', 'dash-old': 'Old dashboard' });

    const items = await new StarredItemsSrv().getStarredItems();

    expect(items).toEqual([
      { kind: 'dashboard', id: 'dash-old', title: 'Old dashboard', url: '/d/dash-old' },
      { kind: 'link', id: '/a/app/first', title: 'First link', url: '/a/app/first' },
      { kind: 'dashboard', id: 'dash-new', title: 'New dashboard', url: '/d/dash-new' },
      { kind: 'link', id: '/a/app/second', title: 'Second link', url: '/a/app/second' },
    ]);
  });

  it('removes the starred time when a dashboard is unstarred', async () => {
    await recordStarredAt('dash-1', true);
    await recordStarredAt('dash-1', false);

    expect(JSON.parse(mockStorage.get('starred-at')!)).toEqual({});
  });
});
