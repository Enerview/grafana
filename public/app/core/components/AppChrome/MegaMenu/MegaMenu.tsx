import { css } from '@emotion/css';
import { DOMAttributes } from '@react-types/shared';
import { memo, forwardRef, useCallback, RefObject, useMemo } from 'react';
import { useLocation } from 'react-router-dom-v5-compat';

import { GrafanaTheme2, NavModelItem } from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { t } from '@grafana/i18n';
import { config, reportInteraction } from '@grafana/runtime';
import { Icon, ScrollContainer, useStyles2 } from '@grafana/ui';
import { useGrafana } from 'app/core/context/GrafanaContext';
import { DOCKED_COLLAPSED_WIDTH } from 'app/core/hooks/useResizableSidebar';
import { setBookmark } from 'app/core/reducers/navBarTree';
import { usePatchUserPreferencesMutation } from 'app/features/preferences/api/index';
import { useDispatch, useSelector } from 'app/types/store';

import { InviteUserButton } from '../../InviteUserButton/InviteUserButton';
import { shouldRenderInviteUserButton } from '../../InviteUserButton/utils';

import { MegaMenuHeader } from './MegaMenuHeader';
import { MegaMenuItem } from './MegaMenuItem';
import { usePinnedItems } from './hooks';
import { enrichWithInteractionTracking, findByUrl, getActiveItem } from './utils';

export const MENU_WIDTH = 300;
export interface Props extends DOMAttributes {
  onClose: () => void;
  resizerRef: RefObject<HTMLDivElement>;
  handleMouseDown: () => void;
  toggleSidebar: () => void;
  sidebarWidth: number;
}

export const MegaMenu = memo(
  forwardRef<HTMLDivElement, Props>(
    ({ onClose, handleMouseDown, sidebarWidth, toggleSidebar, resizerRef, ...restProps }, ref) => {
      const navTree = useSelector((state) => state.navBarTree);
      const styles = useStyles2(getStyles, sidebarWidth);
      const location = useLocation();
      const { chrome } = useGrafana();
      const dispatch = useDispatch();
      const state = chrome.useState();
      const [patchPreferences] = usePatchUserPreferencesMutation();
      const pinnedItems = usePinnedItems();

      /**
       *
       *  1) We need to check if docked elements in sidebar from variable panel
       *  2) On initial load in minimize view we should render but not display it
       *  3) on initial load display is being apply from Variable Panel After it loaded
       *  4) The panel takes much longer to load than the Grafana of elements, so we just need to mount it and wait.
       *     After loading, the panel will find this element itself and enable its display.
       */
      const shouldDisplayVariableDockedIcon = useMemo(() => {
        const element = document.querySelector(
          '[data-testid="data-testid variable-panel table-view"]'
        ) as HTMLElement | null;
        const isNotDisplay = element?.style?.display === 'none';

        if (sidebarWidth === DOCKED_COLLAPSED_WIDTH && element && isNotDisplay) {
          return true;
        }
        return false;
      }, [sidebarWidth]);

      // Remove profile + help from tree
      const navItems = navTree
        .filter((item) => item.id !== 'profile' && item.id !== 'help')
        .map((item) => enrichWithInteractionTracking(item, state.megaMenuDocked));

      if (config.featureToggles.pinNavItems) {
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
      }

      const activeItem = getActiveItem(navItems, state.sectionNav.node, location.pathname);

      const handleMegaMenu = () => {
        chrome.setMegaMenuOpen(!state.megaMenuOpen);
      };

      const handleDockedMenu = () => {
        chrome.setMegaMenuDocked(!state.megaMenuDocked);
        if (state.megaMenuDocked) {
          chrome.setMegaMenuOpen(false);
        }
      };

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
        const url = item.url;
        if (url && config.featureToggles.pinNavItems) {
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
          <MegaMenuHeader handleDockedMenu={handleDockedMenu} handleMegaMenu={handleMegaMenu} onClose={onClose} />
          <nav className={styles.content}>
            <div
              role="button"
              tabIndex={0}
              style={{
                display: shouldDisplayVariableDockedIcon ? '' : 'none',
              }}
              className={styles.collapseButtonWrapper}
              data-testid="data-testid mega-menu toggle-variable-panel-in-docked-menu"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  toggleSidebar();
                }
              }}
              onClick={() => toggleSidebar()}
            >
              <Icon
                name={'gf-layout-simple'}
                size="xxl"
                title={t('navigation.docked.toggleVariable', 'Show variable panel')}
              />
            </div>
            <ScrollContainer height="100%" overflowX="hidden" showScrollIndicators>
              <ul className={styles.itemList} aria-label={t('navigation.megamenu.list-label', 'Navigation')}>
                {navItems.map((link, index) => (
                  <MegaMenuItem
                    key={link.text}
                    link={link}
                    isMinimizeDockedView={sidebarWidth < MENU_WIDTH}
                    isPinned={isPinned}
                    onClick={state.megaMenuDocked ? undefined : onClose}
                    activeItem={activeItem}
                    onPin={onPinItem}
                  />
                ))}
              </ul>
            </ScrollContainer>
            {shouldRenderInviteUserButton && (
              <div className={styles.inviteNewMemberButton}>
                <InviteUserButton />
              </div>
            )}
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
      padding: theme.spacing(1, 1, 2, 1),
      [theme.breakpoints.up('md')]: {
        width: currentMenuWidth,
      },
    }),
    inviteNewMemberButton: css({
      display: 'flex',
      padding: theme.spacing(1.5, 1, 1.5, 1),
      borderTop: `1px solid ${theme.colors.border.weak}`,
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
    collapseButtonWrapper: css({
      display: 'flex',
      justifyContent: 'center',
      width: theme.spacing(3),
      flexShrink: 0,
      marginTop: theme.spacing(2),
      marginLeft: theme.spacing(1.5),
    }),
  };
};
