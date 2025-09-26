import { css, cx } from '@emotion/css';
import classNames from 'classnames';
import { PropsWithChildren, useEffect, useMemo } from 'react';

import { GrafanaTheme2, OrgRole } from '@grafana/data';
import { locationSearchToObject, locationService } from '@grafana/runtime';
import { useStyles2, LinkButton } from '@grafana/ui';
import { useGrafana } from 'app/core/context/GrafanaContext';
import { useResizableSidebar } from 'app/core/hooks/useResizableSidebar';
import { Trans } from 'app/core/internationalization';
import { CommandPalette } from 'app/features/commandPalette/CommandPalette';
import { ScopesDashboards, useScopesDashboardsState } from 'app/features/scopes';

import { AppChromeMenu } from './AppChromeMenu';
import { MegaMenu, MENU_WIDTH } from './MegaMenu/MegaMenu';
import { useMegaMenuFocusHelper } from './MegaMenu/utils';
import { ReturnToPrevious } from './ReturnToPrevious/ReturnToPrevious';
import { SingleTopBar } from './TopBar/SingleTopBar';
import { SingleTopBarActions } from './TopBar/SingleTopBarActions';
import { TOP_BAR_LEVEL_HEIGHT } from './types';

export interface Props extends PropsWithChildren<{}> {}

export function AppChrome({ children }: Props) {
  const { sidebarWidth, resizerRef, handleMouseDown } = useResizableSidebar();
  const { chrome, config } = useGrafana();
  const state = chrome.useState();

  const isRoleHasEditPermission = useMemo(() => {
    const userRole = config.bootData.user.orgRole;
    if (!userRole) {
      return false;
    }

    return [OrgRole.Admin, OrgRole.Editor].includes(userRole);
  }, [config.bootData.user.orgRole]);

  const hasAction = useMemo(
    () => Boolean(state.actions) && isRoleHasEditPermission,
    [isRoleHasEditPermission, state.actions]
  );

  const styles = useStyles2(getStyles, hasAction, sidebarWidth);

  const menuDockedAndOpen = !state.chromeless && state.megaMenuDocked && state.megaMenuOpen;
  const scopesDashboardsState = useScopesDashboardsState();
  const isScopesDashboardsOpen = Boolean(
    scopesDashboardsState?.isEnabled && scopesDashboardsState?.isPanelOpened && !scopesDashboardsState?.isReadOnly
  );

  useMegaMenuFocusHelper(state.megaMenuOpen, state.megaMenuDocked);

  const contentClass = cx({
    [styles.content]: true,
    [styles.contentChromeless]: state.chromeless,
  });

  const handleMegaMenu = () => {
    chrome.setMegaMenuOpen(!state.megaMenuOpen);
  };

  const { pathname, search } = locationService.getLocation();
  const url = pathname + search;
  const shouldShowReturnToPrevious = state.returnToPrevious && url !== state.returnToPrevious.href;

  // Clear returnToPrevious when the page is manually navigated to
  useEffect(() => {
    if (state.returnToPrevious && url === state.returnToPrevious.href) {
      chrome.clearReturnToPrevious('auto_dismissed');
    }
    // We only want to pay attention when the location changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chrome, url]);

  // Sync updates from kiosk mode query string back into app chrome
  useEffect(() => {
    const queryParams = locationSearchToObject(search);
    chrome.setKioskModeFromUrl(queryParams.kiosk);
  }, [chrome, search]);

  // Chromeless routes are without topNav, mega menu, search & command palette
  // We check chromeless twice here instead of having a separate path so {children}
  // doesn't get re-mounted when chromeless goes from true to false.
  return (
    <div
      className={classNames('main-view', {
        'main-view--chrome-hidden': state.chromeless,
      })}
    >
      {!state.chromeless && (
        <>
          <LinkButton className={styles.skipLink} href="#pageContent">
            <Trans i18nKey="app-chrome.skip-content-button">Skip to main content</Trans>
          </LinkButton>
          {menuDockedAndOpen && (
            <MegaMenu
              className={styles.dockedMegaMenu}
              onClose={() => chrome.setMegaMenuOpen(false)}
              resizerRef={resizerRef}
              handleMouseDown={handleMouseDown}
              sidebarWidth={sidebarWidth}
            />
          )}
          <header className={cx(styles.topNav, menuDockedAndOpen && styles.topNavMenuDocked)}>
            <SingleTopBar
              sectionNav={state.sectionNav.node}
              pageNav={state.pageNav}
              onToggleMegaMenu={handleMegaMenu}
              onToggleKioskMode={chrome.onToggleKioskMode}
            />
            {hasAction && <SingleTopBarActions>{state.actions}</SingleTopBarActions>}
          </header>
        </>
      )}
      <div className={contentClass}>
        <div className={styles.panes}>
          {!state.chromeless && (
            <div
              className={cx(styles.scopesDashboardsContainer, {
                [styles.scopesDashboardsContainerDocked]: menuDockedAndOpen,
              })}
            >
              <ScopesDashboards />
            </div>
          )}
          <main
            className={cx(styles.pageContainer, {
              [styles.pageContainerMenuDocked]: menuDockedAndOpen || isScopesDashboardsOpen,
              [styles.pageContainerMenuDockedScopes]: menuDockedAndOpen && isScopesDashboardsOpen,
            })}
            id="pageContent"
          >
            {children}
          </main>
        </div>
      </div>
      {!state.chromeless && !state.megaMenuDocked && <AppChromeMenu />}
      {!state.chromeless && <CommandPalette />}
      {shouldShowReturnToPrevious && state.returnToPrevious && (
        <ReturnToPrevious href={state.returnToPrevious.href} title={state.returnToPrevious.title} />
      )}
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2, hasActions: boolean, sidebarWidth: number) => {
  const currentMenuWidth = sidebarWidth ? `${sidebarWidth}px` : MENU_WIDTH;
  return {
    content: css({
      display: 'flex',
      flexDirection: 'column',
      paddingTop: hasActions ? TOP_BAR_LEVEL_HEIGHT * 2 : TOP_BAR_LEVEL_HEIGHT,
      flexGrow: 1,
      height: 'auto',
    }),
    contentChromeless: css({
      paddingTop: 0,
    }),
    dockedMegaMenu: css({
      background: theme.colors.background.primary,
      borderRight: `1px solid ${theme.colors.border.weak}`,
      height: '100%',
      position: 'fixed',
      top: 0,
      width: currentMenuWidth,
      zIndex: 2,
      display: 'block',
    }),
    scopesDashboardsContainer: css({
      position: 'fixed',
      height: `calc(100% - ${TOP_BAR_LEVEL_HEIGHT}px)`,
      zIndex: 1,
    }),
    scopesDashboardsContainerDocked: css({
      left: currentMenuWidth,
    }),
    topNav: css({
      display: 'flex',
      position: 'fixed',
      zIndex: theme.zIndex.navbarFixed,
      left: 0,
      right: 0,
      background: theme.colors.background.primary,
      flexDirection: 'column',
    }),
    topNavMenuDocked: css({
      left: currentMenuWidth,
    }),
    panes: css({
      display: 'flex',
      flexDirection: 'column',
      flexGrow: 1,
      label: 'page-panes',
    }),
    pageContainerMenuDocked: css({
      paddingLeft: currentMenuWidth,
    }),
    pageContainerMenuDockedScopes: css({
      paddingLeft: `calc(${currentMenuWidth} * 2)`,
    }),
    pageContainer: css({
      label: 'page-container',
      display: 'flex',
      flexDirection: 'column',
      flexGrow: 1,
    }),
    skipLink: css({
      position: 'fixed',
      top: -1000,

      ':focus': {
        left: theme.spacing(1),
        top: theme.spacing(1),
        zIndex: theme.zIndex.portal,
      },
    }),
  };
};
