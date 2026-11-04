import { useContext } from 'react';

import { selectors } from '@grafana/e2e-selectors';
import { type PluginPageProps } from '@grafana/runtime';
import { AppChromeUpdate } from 'app/core/components/AppChrome/AppChromeUpdate';
import { PluginPageContext } from 'app/features/plugins/components/PluginPageContext';

import { Page } from './Page';

export function PluginPage({
  actions,
  breadcrumbActions,
  children,
  info,
  pageNav,
  layout,
  renderTitle,
  subTitle,
  background,
}: PluginPageProps) {
  const context = useContext(PluginPageContext);

  return (
    <Page
      navModel={context.sectionNav}
      pageNav={pageNav}
      layout={layout}
      actions={actions}
      renderTitle={renderTitle}
      info={info}
      subTitle={subTitle}
      background={background}
      data-testid={context.pluginId ? selectors.components.Plugins.appPage(context.pluginId) : undefined}
      data-plugin-id={context.pluginId}
    >
      {breadcrumbActions && <AppChromeUpdate breadcrumbActions={breadcrumbActions} />}
      <Page.Contents>{children}</Page.Contents>
    </Page>
  );
}
