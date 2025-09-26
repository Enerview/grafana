import { css } from '@emotion/css';

import { GrafanaTheme2 } from '@grafana/data';
import { Stack, ToolbarButton, useTheme2 } from '@grafana/ui';

import { Branding } from '../../Branding/Branding';
import { OrganizationSwitcher } from '../OrganizationSwitcher/OrganizationSwitcher';
import { TOP_BAR_LEVEL_HEIGHT } from '../types';

export interface Props {
  handleMegaMenu: () => void;
  handleDockedMenu: () => void;
  onClose: () => void;
}

export const DOCK_MENU_BUTTON_ID = 'dock-menu-button';
export const MEGA_MENU_HEADER_TOGGLE_ID = 'mega-menu-header-toggle';

export function MegaMenuHeader(props: Props) {
  const theme = useTheme2();

  const styles = getStyles(theme);

  return (
    <div className={styles.header}>
      <Stack alignItems="center" minWidth={0} gap={0.25}>
        <ToolbarButton narrow id={MEGA_MENU_HEADER_TOGGLE_ID} className={styles.logoButton}>
          <Branding.MenuLogo className={styles.img} />
        </ToolbarButton>
        <OrganizationSwitcher />
      </Stack>
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
    height: TOP_BAR_LEVEL_HEIGHT,
    minHeight: TOP_BAR_LEVEL_HEIGHT,
  }),
  img: css({
    alignSelf: 'center',
    height: theme.spacing(3),
    width: theme.spacing(3),
  }),
  mobileCloseButton: css({
    [theme.breakpoints.up('md')]: {
      display: 'none',
    },
  }),
  logoButton: css({
    '&:hover': {
      cursor: 'auto',
    },
  }),
});
