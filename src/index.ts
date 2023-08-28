import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ToolbarButton } from '@jupyterlab/apputils';

import { IFileBrowserFactory } from '@jupyterlab/filebrowser';

import { ITranslator } from '@jupyterlab/translation';

import { listIcon, folderIcon } from '@jupyterlab/ui-components';

import { ServerConnection } from './serverconnection';

import { Drive } from './drive';

/**
 * Initialization data for the jupyterlab-remote-contents extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab-remote-contents:plugin',
  requires: [IFileBrowserFactory, ITranslator],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    browser: IFileBrowserFactory,
    translator: ITranslator
  ) => {
    const { serviceManager } = app;
    const { createFileBrowser } = browser;

    const trans = translator.load('jupyterlab-remote-contents');
    const serverSettings = ServerConnection.makeSettings();
    const drive = new Drive({serverSettings, name: 'Remote'});

    serviceManager.contents.addDrive(drive);

    const widget = createFileBrowser('jp-remote-contents-browser', {
      driveName: drive.name,
      // We don't want to restore old state, we don't have a drive handle ready
      restore: false
    });
    widget.title.caption = trans.__('Remote Contents (not connected)');
    widget.title.icon = listIcon;

    const connectToServerButton = new ToolbarButton({
      icon: folderIcon,
      onClick: async () => {
        let serverUrl = prompt('Please enter the Jupyter server URL:', 'http://127.0.0.1:8000');

        if (serverUrl) {
          const parsedUrl = new URL(serverUrl);
          const queryString = parsedUrl.search;
          const queryParams = Object.fromEntries(parsedUrl.searchParams);
          if (queryString) {
            // remove query string from server URL
            serverUrl = serverUrl.slice(0, -queryString.length);
          }
          drive.serverSettings.baseUrl = serverUrl;
          drive.serverSettings.queryParams = queryParams;
          widget.title.caption = trans.__(`Remote Contents at ${serverUrl}`);

          // Go to root directory
          widget.model.cd('/');
        }
      },
      tooltip: trans.__('Connect to Jupyter Server')
    });

    widget.toolbar.insertItem(0, 'connect-to-server', connectToServerButton);

    app.shell.add(widget, 'left');
  }
};

export default plugin;
