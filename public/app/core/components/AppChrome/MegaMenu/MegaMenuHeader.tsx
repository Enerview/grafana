import { css } from '@emotion/css';

import { GrafanaTheme2 } from '@grafana/data';
import { Stack, useTheme2 } from '@grafana/ui';
import { HOME_NAV_ID } from 'app/core/reducers/navModel';
import { useSelector } from 'app/types/store';

import { HomeLink } from '../../Branding/Branding';
import { OrganizationSwitcher } from '../OrganizationSwitcher/OrganizationSwitcher';
import { getChromeHeaderLevelHeight } from '../TopBar/useChromeHeaderHeight';

export interface Props {
  toggleSidebar: (isMinimized?: boolean) => void;
  isMinimizeDockedView: boolean;
}

export const DOCK_MENU_BUTTON_ID = 'dock-menu-button';
export const MEGA_MENU_HEADER_TOGGLE_ID = 'mega-menu-header-toggle';

export function MegaMenuHeader({ toggleSidebar, isMinimizeDockedView }: Props) {
  const theme = useTheme2();
  // const { chrome } = useGrafana();
  // const state = chrome.useState();
  const homeNav = useSelector((state) => state.navIndex)[HOME_NAV_ID];
  const styles = getStyles(theme);

  return (
    <div className={styles.header}>
      <Stack alignItems="center" minWidth={0} gap={1}>
        <HomeLink
          homeNav={homeNav}
          inMegaMenuOverlay={isMinimizeDockedView}
          // onClick={() => toggleSidebar(!isMinimizeDockedView)}
        />
        <OrganizationSwitcher />
      </Stack>
      <div className={styles.flexGrow} />
      <div
        id="mega-menu-insertable-buttons"
        style={{
          display: isMinimizeDockedView ? 'none' : undefined,
        }}
      />
    </div>
  );
}

MegaMenuHeader.displayName = 'MegaMenuHeader';

const getStyles = (theme: GrafanaTheme2) => ({
  dockMenuButton: css({
    display: 'none',

    [theme.breakpoints.up('xl')]: {
      display: 'inline-flex',
    },
  }),
  header: css({
    alignItems: 'center',
    borderBottom: `1px solid ${theme.colors.border.weak}`,
    display: 'flex',
    gap: theme.spacing(1),
    justifyContent: 'space-between',
    padding: theme.spacing(0, 1, 0, 0.75),
    height: getChromeHeaderLevelHeight(),
    flexShrink: 0,
  }),
  flexGrow: css({ flexGrow: 1 }),
  logoButton: css({
    '&:hover': {
      cursor: 'pointer',
    },
  }),
});
