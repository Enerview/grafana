import { render, screen } from 'test/test-utils';

import { type NavModelItem } from '@grafana/data';

import { MegaMenuItem } from './MegaMenuItem';

const starred: NavModelItem = {
  text: 'Starred',
  id: 'starred',
  icon: 'star',
  url: '/dashboards?starred',
  emptyMessage: 'Your starred dashboards will appear here',
  children: [{ text: 'Real Time (ESP)', id: 'starred/real-time', url: '/a/app/esp/wells' }],
};

const renderItem = (link: NavModelItem, props: { isMinimizeDockedView?: boolean; onExpandSidebar?: () => void } = {}) =>
  render(
    <ul>
      <MegaMenuItem
        link={link}
        onPin={() => {}}
        isPinned={() => false}
        isMinimizeDockedView={props.isMinimizeDockedView ?? false}
        onExpandSidebar={props.onExpandSidebar}
      />
    </ul>
  );

describe('MegaMenuItem', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders a regular section as a link', () => {
    renderItem({ text: 'Dashboards', id: 'dashboards/browse', url: '/dashboards' });

    expect(screen.getByRole('link', { name: 'Dashboards' })).toHaveAttribute('href', '/dashboards');
  });

  it('renders Starred without a link and toggles the section on click', async () => {
    const { user } = renderItem(starred);

    expect(screen.queryByRole('link', { name: 'Starred' })).not.toBeInTheDocument();
    expect(screen.queryByText('Real Time (ESP)')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Starred' }));
    expect(screen.getByRole('link', { name: 'Real Time (ESP)' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Starred' }));
    expect(screen.queryByText('Real Time (ESP)')).not.toBeInTheDocument();
  });

  it('expands the minimized menu with the Starred section open', async () => {
    const onExpandSidebar = jest.fn();
    const { user } = renderItem(starred, { isMinimizeDockedView: true, onExpandSidebar });

    await user.click(screen.getByRole('button', { name: 'Starred' }));

    expect(onExpandSidebar).toHaveBeenCalled();
    expect(window.localStorage.getItem('grafana.navigation.expanded[Starred]')).toBe('true');
  });
});
