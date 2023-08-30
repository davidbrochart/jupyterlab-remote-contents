# jupyterlab-remote-contents

[lite-badge]: https://jupyterlite.rtfd.io/en/latest/_static/badge.svg
[lite]: https://jupyterlab-remote-contents.readthedocs.io/en/latest/lite/lab
[docs-badge]: https://readthedocs.org/projects/jupyterlab-remote-contents/badge/?version=latest
[docs]: https://jupyterlab-remote-contents.readthedocs.io/en/latest/?badge=latest

Browse remote files using the Jupyter contents API. This is the default for JupyterLab, but not for JupyterLite
which uses the browser's local storage. This extension allows to access remote files served by a Jupyter server.

## Requirements

- JupyterLab >= 4.0

## Install

To install the extension, execute:

```bash
pip install jupyterlab-remote-contents
```

## Uninstall

To remove the extension, execute:

```bash
pip uninstall jupyterlab-remote-contents
```

## Usage

Since remote contents are fetched from another origin than the client's, you may run into
[CORS](https://en.wikipedia.org/wiki/Cross-origin_resource_sharing) issues.
The Jupyter server serving the remote contents API must support the client's origin.

For instance, if you launch JupyterLab with:

```bash
jupyter lab --ServerApp.ip='127.0.0.1' --ServerApp.port=8888
```

Then you must pass `--ServerApp.allow_origin='http://127.0.0.1:8888'` to the Jupyter server serving the contents API:

```bash
jupyter server --ServerApp.ip='127.0.0.1' --ServerApp.port=8000 --ServerApp.allow_origin='http://127.0.0.1:8888'
```

In JupyterLab, click on the list icon "Remote Contents (not connected)" on the left panel, then click on the folder icon "Connect to Jupyter Server".
You should be prompted to enter the Jupyter server URL. Enter e.g. "http://127.0.0.1:8000/?token=87b..." (don't forget the token if you have one). If you hover over the icon on the left panel, you should now see something like "Remote Contents at http://127.0.0.1:8000/" (instead of "not connected").

## Contributing

### Development install

Note: You will need NodeJS to build the extension package.

The `jlpm` command is JupyterLab's pinned version of
[yarn](https://yarnpkg.com/) that is installed with JupyterLab. You may use
`yarn` or `npm` in lieu of `jlpm` below.

```bash
# Clone the repo to your local environment
# Change directory to the jupyterlab-remote-contents directory
# Install package in development mode
pip install -e .
# Link your development version of the extension with JupyterLab
jupyter labextension develop . --overwrite
# Rebuild extension Typescript source after making changes
jlpm build
```

You can watch the source directory and run JupyterLab at the same time in different terminals to watch for changes in the extension's source and automatically rebuild the extension.

```bash
# Watch the source directory in one terminal, automatically rebuilding when needed
jlpm watch
# Run JupyterLab in another terminal
jupyter lab
```

With the watch command running, every saved change will immediately be built locally and available in your running JupyterLab. Refresh JupyterLab to load the change in your browser (you may need to wait several seconds for the extension to be rebuilt).

By default, the `jlpm build` command generates the source maps for this extension to make it easier to debug using the browser dev tools. To also generate source maps for the JupyterLab core extensions, you can run the following command:

```bash
jupyter lab build --minimize=False
```

### Development uninstall

```bash
pip uninstall jupyterlab-remote-contents
```

In development mode, you will also need to remove the symlink created by `jupyter labextension develop`
command. To find its location, you can run `jupyter labextension list` to figure out where the `labextensions`
folder is located. Then you can remove the symlink named `jupyterlab-remote-contents` within that folder.

### Packaging the extension

See [RELEASE](RELEASE.md)
