import { css, cx } from '@emotion/css';
import React from 'react';
import { useLocalStorage } from 'react-use';

import { GrafanaTheme2, NavModelItem } from '@grafana/data';
import { Button, Icon, useStyles2, Text } from '@grafana/ui';

import { Indent } from '../../Indent/Indent';

import { FeatureHighlight } from './FeatureHighlight';
import { MegaMenuItemIcon } from './MegaMenuItemIcon';
import { MegaMenuItemText } from './MegaMenuItemText';
import { hasChildMatch } from './utils';

interface Props {
  link: NavModelItem;
  activeItem?: NavModelItem;
  onClose?: () => void;
  level?: number;
  showExpandButton?: string; //TODO: check type
}

export function MegaMenuItem({ link, activeItem, level = 0, onClose }: Props) {
  const FeatureHighlightWrapper = link.highlightText ? FeatureHighlight : React.Fragment;
  const isActive = link === activeItem;
  const hasActiveChild = hasChildMatch(link, activeItem);
  const [sectionExpanded, setSectionExpanded] =
    useLocalStorage(`grafana.navigation.expanded[${link.text}]`, false) ?? Boolean(hasActiveChild);
  const showExpandButton = linkHasChildren(link) || link.emptyMessage;

  const styles = useStyles2(getStyles, level, showExpandButton);

  return (
    <li>
      <div className={styles.menuItem}>
        {showExpandButton && (
          <Button
            aria-label={`${sectionExpanded ? 'Collapse' : 'Expand'} section ${link.text}`}
            variant="secondary"
            fill="text"
            className={styles.collapseButton}
            onClick={() => setSectionExpanded(!sectionExpanded)}
          >
            <Icon name={sectionExpanded ? 'angle-up' : 'angle-down'} size="xl" />
          </Button>
        )}
        <div className={styles.collapsibleSectionWrapper}>
          <MegaMenuItemText
            isActive={isActive}
            onClick={() => {
              link.onClick?.();
              onClose?.();
            }}
            target={link.target}
            url={link.url}
            level={level}
          >
            <div
              className={cx(styles.labelWrapper, {
                [styles.isActive]: isActive,
                [styles.hasActiveChild]: hasActiveChild,
              })}
            >
              <FeatureHighlightWrapper>
                <>{level === 0 && <MegaMenuItemIcon link={link} />}</>
              </FeatureHighlightWrapper>
              <Indent level={Math.max(0, level - 1)} spacing={2} />
              <Text truncate>{link.text}</Text>
            </div>
          </MegaMenuItemText>
        </div>
      </div>
      {showExpandButton && sectionExpanded && (
        <ul className={styles.children}>
          {linkHasChildren(link) ? (
            link.children
              .filter((childLink) => !childLink.isCreateAction)
              .map((childLink) => (
                <MegaMenuItem
                  key={`${link.text}-${childLink.text}`}
                  link={childLink}
                  activeItem={activeItem}
                  onClose={onClose}
                  level={level + 1}
                />
              ))
          ) : (
            <div className={styles.emptyMessage}>{link.emptyMessage}</div>
          )}
        </ul>
      )}
    </li>
  );
}

const getStyles = (theme: GrafanaTheme2, level: Props['level'], showExpandButton: Props['showExpandButton']) => ({
  menuItem: css([
    {
      display: 'flex',
    },
    level === 1 && {
      marginRight: theme.spacing(4),
    },
  ]),
  collapseButton: css([
    {
      color: theme.colors.text.disabled,
      padding: theme.spacing(0, 0.5),
    },
    level === 1 && {
      marginLeft: theme.spacing(5),
    },
  ]),
  collapsibleSectionWrapper: css([
    {
      alignItems: 'center',
      display: 'flex',
    },
    level === 0 &&
      showExpandButton && {
        marginLeft: theme.spacing(2),
      },
    level === 0 &&
      !showExpandButton && {
        marginLeft: theme.spacing(6.25),
      },
    level === 1 &&
      showExpandButton && {
        marginLeft: theme.spacing(1),
      },
    level === 1 &&
      !showExpandButton && {
        marginLeft: theme.spacing(10.5),
      },
    level === 2 && {
      marginLeft: theme.spacing(6),
    },
  ]),
  labelWrapper: css([
    {
      display: 'grid',
      fontSize: theme.typography.pxToRem(14),
      gridAutoFlow: 'column',
      gridTemplateColumns: `${theme.spacing(4)} auto`,
      alignItems: 'center',
      fontWeight: theme.typography.fontWeightMedium,
    },
    level === 1 && {
      gridTemplateColumns: `auto auto`,
    },
    level === 2 && {
      gridTemplateColumns: `${theme.spacing(5)} auto`,
    },
  ]),
  isActive: css({
    color: theme.colors.text.primary,

    '&::before': [
      {
        display: 'block',
        content: '" "',
        height: theme.spacing(3),
        position: 'absolute',
        top: '50%',
        transform: 'translateY(-50%)',
        width: theme.spacing(0.5),
        borderRadius: theme.shape.radius.default,
        backgroundImage: theme.colors.gradients.brandVertical,
      },
      level === 0 && {
        left: theme.spacing(1),
      },
      level === 1 && {
        left: theme.spacing(-1),
      },
      level === 2 && {
        left: theme.spacing(6),
      },
    ],
  }),
  hasActiveChild: css({
    color: theme.colors.text.primary,
  }),
  children: css({
    display: 'flex',
    listStyleType: 'none',
    flexDirection: 'column',
  }),
  emptyMessage: css({
    color: theme.colors.text.secondary,
    fontStyle: 'italic',
    padding: theme.spacing(1, 1.5, 1, 7),
  }),
});

function linkHasChildren(link: NavModelItem): link is NavModelItem & { children: NavModelItem[] } {
  return Boolean(link.children && link.children.length > 0);
}
