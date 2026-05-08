import { css } from '@emotion/css';
import { DOMAttributes } from '@react-types/shared';
import { memo, forwardRef, useCallback, RefObject } from 'react';
import { useLocation } from 'react-router-dom-v5-compat';

import { usePatchUserPreferencesMutation } from '@grafana/api-clients/rtkq/legacy/preferences';
import { GrafanaTheme2, NavModelItem } from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { t } from '@grafana/i18n';
import { reportInteraction } from '@grafana/runtime';
import { ScrollContainer, useStyles2 } from '@grafana/ui';
import { useGrafana } from 'app/core/context/GrafanaContext';
import { setBookmark } from 'app/core/reducers/navBarTree';
import { useDispatch, useSelector } from 'app/types/store';

import { MegaMenuExtensionPoint } from './MegaMenuExtensionPoint';
import { MegaMenuHeader } from './MegaMenuHeader';
import { MegaMenuItem } from './MegaMenuItem';
import { usePinnedItems } from './hooks';
import { enrichWithInteractionTracking, findByUrl, getActiveItem } from './utils';

export const MENU_WIDTH = 300;

export interface Props extends DOMAttributes {
  resizerRef: RefObject<HTMLDivElement>;
  handleMouseDown: () => void;
  toggleSidebar: (isMinimized?: boolean) => void;
  sidebarWidth: number;
  isMinimized: boolean;
}

export const MegaMenu = memo(
  forwardRef<HTMLDivElement, Props>(
    ({ handleMouseDown, sidebarWidth, toggleSidebar, resizerRef, isMinimized, ...restProps }, ref) => {
      const navTree = useSelector((state) => state.navBarTree);
      const styles = useStyles2(getStyles, sidebarWidth);
      const location = useLocation();
      const { chrome } = useGrafana();
      const dispatch = useDispatch();
      const state = chrome.useState();
      const [patchPreferences] = usePatchUserPreferencesMutation();
      const pinnedItems = usePinnedItems();

      // Remove profile + help from tree
      const navItems = navTree
        .filter((item) => item.id !== 'profile' && item.id !== 'help')
        .map((item) => enrichWithInteractionTracking(item, state.megaMenuDocked));

      const bookmarksItem = navItems.find((item) => item.id === 'bookmarks');
      if (bookmarksItem) {
        // Add children to the bookmarks section
        bookmarksItem.children = pinnedItems.reduce((acc: NavModelItem[], url) => {
          const item = findByUrl(navItems, url);
          if (!item) {
            return acc;
          }
          const newItem = {
            id: item.id,
            text: item.text,
            url: item.url,
            parentItem: { id: 'bookmarks', text: 'Bookmarks' },
          };
          acc.push(enrichWithInteractionTracking(newItem, state.megaMenuDocked));
          return acc;
        }, []);
      }

      const activeItem = getActiveItem(navItems, state.sectionNav.node, location.pathname);

      const isPinned = useCallback(
        (url?: string) => {
          if (!url || !pinnedItems?.length) {
            return false;
          }
          return pinnedItems?.includes(url);
        },
        [pinnedItems]
      );

      const onPinItem = (item: NavModelItem) => {
        const { url } = item;
        if (url) {
          const isSaved = isPinned(url);
          const newItems = isSaved ? pinnedItems.filter((i) => url !== i) : [...pinnedItems, url];
          const interactionName = isSaved ? 'grafana_nav_item_unpinned' : 'grafana_nav_item_pinned';
          reportInteraction(interactionName, {
            path: url,
          });
          patchPreferences({
            patchPrefsCmd: {
              navbar: {
                bookmarkUrls: newItems,
              },
            },
          }).then((data) => {
            if (!data.error) {
              dispatch(setBookmark({ item: item, isSaved: !isSaved }));
            }
          });
        }
      };

      return (
        <div data-testid={selectors.components.NavMenu.Menu} ref={ref} {...restProps}>
          <MegaMenuHeader toggleSidebar={toggleSidebar} isMinimizeDockedView={isMinimized} />
          <nav className={styles.content}>
            <ScrollContainer id="mega-menu-content" height="100%" overflowX="hidden" showScrollIndicators>
              <ul className={styles.itemList} aria-label={t('navigation.megamenu.list-label', 'Navigation')}>
                {navItems.map((link) => (
                  <MegaMenuItem
                    key={link.text}
                    link={link}
                    isMinimizeDockedView={isMinimized}
                    isPinned={isPinned}
                    onClick={state.megaMenuDocked ? undefined : () => toggleSidebar(true)}
                    activeItem={activeItem}
                    onPin={onPinItem}
                  />
                ))}
              </ul>
              <MegaMenuExtensionPoint />
            </ScrollContainer>
            <div id="mega-menu-insertable-content" className={isMinimized ? 'minimized' : undefined} />
          </nav>
          <div
            className={styles.resizer}
            role="slider"
            aria-valuenow={sidebarWidth}
            tabIndex={0}
            id="resizer"
            ref={resizerRef}
            onMouseDown={() => handleMouseDown()}
            onDoubleClick={() => toggleSidebar()}
          >
            <div className={`${styles.resizerLine} resizer-line`} />
            <div
              className={`${styles.resizerSeparator} resizer-separator`}
              role="slider"
              aria-valuenow={sidebarWidth}
              tabIndex={0}
              onMouseDown={() => handleMouseDown()}
              onDoubleClick={() => toggleSidebar()}
            />
          </div>
        </div>
      );
    }
  )
);

MegaMenu.displayName = 'MegaMenu';

const getStyles = (theme: GrafanaTheme2, sidebarWidth: number) => {
  const currentMenuWidth = sidebarWidth ? `${sidebarWidth}px` : `${MENU_WIDTH}px`;

  return {
    content: css({
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      flexGrow: 1,
      position: 'relative',
    }),
    mobileHeader: css({
      display: 'flex',
      justifyContent: 'space-between',
      padding: theme.spacing(1, 1, 1, 2),
      borderBottom: `1px solid ${theme.colors.border.weak}`,

      [theme.breakpoints.up('md')]: {
        display: 'none',
      },
    }),
    itemList: css({
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      listStyleType: 'none',
      padding: theme.spacing(1, 1, 0.5, 0.75),
      [theme.breakpoints.up('md')]: {
        width: currentMenuWidth,
      },
    }),
    toggleContainer: css({
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      listStyleType: 'none',
      padding: theme.spacing(1, 1, 0, 0.5),
      [theme.breakpoints.up('md')]: {
        width: currentMenuWidth,
      },
    }),
    dockMenuButton: css({
      display: 'none',
      position: 'relative',
      top: theme.spacing(1),

      [theme.breakpoints.up('xl')]: {
        display: 'inline-flex',
      },
    }),
    resizer: css({
      flexDirection: 'column',
      display: 'flex',
      alignItems: 'end',
      justifyContent: 'center',
      position: 'absolute',
      zIndex: 1000,
      top: 0,
      right: '-11px',
      width: '13px',
      height: '100%',
      cursor: 'ew-resize',
      background: 'transparent',
      '&:hover .resizer-separator': {
        background: `${theme.colors.text.link}`,
      },
      '&:hover .resizer-line': {
        background: `${theme.colors.text.link}`,
      },

      // Don`t display resizer for screens width less than 1200 px
      [theme.breakpoints.down('xl')]: {
        display: 'none',
      },
    }),
    resizerLine: css({
      flexDirection: 'column',
      display: 'flex',
      alignItems: 'end',
      justifyContent: 'center',
      position: 'absolute',
      top: 0,
      right: '10px',
      width: '1px',
      height: '100%',
      cursor: 'ew-resize',
      background: 'transparent',
    }),
    resizerSeparator: css({
      width: '5px',
      height: '200px',
      marginRight: '8px',
      background: `${theme.colors.emphasize(theme.colors.background.secondary, 0.15)}`,
      borderRadius: `2px`,
    }),
  };
};
