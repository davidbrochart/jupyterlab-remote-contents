import { Contents } from '@jupyterlab/services';
import { ServerConnection } from './serverconnection';
import { ISignal, Signal } from '@lumino/signaling';
import { PartialJSONObject } from '@lumino/coreutils';
import { URLExt } from '@jupyterlab/coreutils';


/**
 * The url for the default drive service.
 */
const SERVICE_DRIVE_URL = 'api/contents';

/**
 * The url for the file access.
 */
const FILES_URL = 'files';


/**
 * A namespace for Drive statics.
 */
export namespace Drive {
  /**
   * The options used to initialize a `Drive`.
   */
  export interface IOptions {
    /**
     * The name for the `Drive`, which is used in file
     * paths to disambiguate it from other drives.
     */
    name?: string;

    /**
     * The server settings for the server.
     */
    serverSettings?: ServerConnection.ISettings;

    /**
     * A REST endpoint for drive requests.
     * If not given, defaults to the Jupyter
     * REST API given by [Jupyter Notebook API](https://petstore.swagger.io/?url=https://raw.githubusercontent.com/jupyter-server/jupyter_server/main/jupyter_server/services/api/api.yaml#!/contents).
     */
    apiEndpoint?: string;
  }
}


/**
 * A default implementation for an `IDrive`, talking to the
 * server using the Jupyter REST API.
 */
export class Drive implements Contents.IDrive {
  /**
   * Construct a new contents manager object.
   *
   * @param options - The options used to initialize the object.
   */
  constructor(options: Drive.IOptions = {}) {
    this.name = options.name ?? 'Default';
    this._apiEndpoint = options.apiEndpoint ?? SERVICE_DRIVE_URL;
    this.serverSettings =
      options.serverSettings ?? ServerConnection.makeSettings();
  }

  /**
   * The name of the drive, which is used at the leading
   * component of file paths.
   */
  readonly name: string;

  /**
   * A signal emitted when a file operation takes place.
   */
  get fileChanged(): ISignal<this, Contents.IChangedArgs> {
    return this._fileChanged;
  }

  /**
   * The server settings of the drive.
   */
  serverSettings: ServerConnection.ISettings;

  /**
   * Test whether the manager has been disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Dispose of the resources held by the manager.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._isDisposed = true;
    Signal.clearData(this);
  }

  /**
   * Get a file or directory.
   *
   * @param localPath: The path to the file.
   *
   * @param options: The options used to fetch the file.
   *
   * @returns A promise which resolves with the file content.
   *
   * Uses the [Jupyter Notebook API](https://petstore.swagger.io/?url=https://raw.githubusercontent.com/jupyter-server/jupyter_server/main/jupyter_server/services/api/api.yaml#!/contents) and validates the response model.
   */
  async get(
    localPath: string,
    options?: Contents.IFetchOptions
  ): Promise<Contents.IModel> {
    let url = this._getUrl(localPath);
    let params: PartialJSONObject = {};
    if (options) {
      // The notebook type cannot take a format option.
      if (options.type === 'notebook') {
        delete options['format'];
      }
      const content = options.content ? '1' : '0';
      params = { ...options, content };
    }

    const settings = this.serverSettings;
    const response = await ServerConnection.makeRequest(url, {}, settings, params);
    if (response.status !== 200) {
      const err = await ServerConnection.ResponseError.create(response);
      throw err;
    }
    const data = await response.json();
    Private.validateContentsModel(data);
    return data;
  }

  /**
   * Get an encoded download url given a file path.
   *
   * @param localPath - An absolute POSIX file path on the server.
   *
   * #### Notes
   * It is expected that the path contains no relative paths.
   *
   * The returned URL may include a query parameter.
   */
  getDownloadUrl(localPath: string): Promise<string> {
    const baseUrl = this.serverSettings.baseUrl;
    let url = URLExt.join(baseUrl, FILES_URL, URLExt.encodeParts(localPath));
    const xsrfTokenMatch = document.cookie.match('\\b_xsrf=([^;]*)\\b');
    if (xsrfTokenMatch) {
      const fullUrl = new URL(url);
      fullUrl.searchParams.append('_xsrf', xsrfTokenMatch[1]);
      url = fullUrl.toString();
    }
    return Promise.resolve(url);
  }

  /**
   * Create a new untitled file or directory in the specified directory path.
   *
   * @param options: The options used to create the file.
   *
   * @returns A promise which resolves with the created file content when the
   *    file is created.
   *
   * #### Notes
   * Uses the [Jupyter Notebook API](https://petstore.swagger.io/?url=https://raw.githubusercontent.com/jupyter-server/jupyter_server/main/jupyter_server/services/api/api.yaml#!/contents) and validates the response model.
   */
  async newUntitled(
    options: Contents.ICreateOptions = {}
  ): Promise<Contents.IModel> {
    let body = '{}';
    if (options) {
      if (options.ext) {
        options.ext = Private.normalizeExtension(options.ext);
      }
      body = JSON.stringify(options);
    }

    const settings = this.serverSettings;
    const url = this._getUrl(options.path ?? '');
    const init = {
      method: 'POST',
      body
    };
    const response = await ServerConnection.makeRequest(url, init, settings);
    if (response.status !== 201) {
      const err = await ServerConnection.ResponseError.create(response);
      throw err;
    }
    const data = await response.json();
    Private.validateContentsModel(data);
    this._fileChanged.emit({
      type: 'new',
      oldValue: null,
      newValue: data
    });
    return data;
  }

  /**
   * Delete a file.
   *
   * @param localPath - The path to the file.
   *
   * @returns A promise which resolves when the file is deleted.
   *
   * #### Notes
   * Uses the [Jupyter Notebook API](https://petstore.swagger.io/?url=https://raw.githubusercontent.com/jupyter-server/jupyter_server/main/jupyter_server/services/api/api.yaml#!/contents).
   */
  async delete(localPath: string): Promise<void> {
    const url = this._getUrl(localPath);
    const settings = this.serverSettings;
    const init = { method: 'DELETE' };
    const response = await ServerConnection.makeRequest(url, init, settings);
    // TODO: update IPEP27 to specify errors more precisely, so
    // that error types can be detected here with certainty.
    if (response.status !== 204) {
      const err = await ServerConnection.ResponseError.create(response);
      throw err;
    }
    this._fileChanged.emit({
      type: 'delete',
      oldValue: { path: localPath },
      newValue: null
    });
  }

  /**
   * Rename a file or directory.
   *
   * @param oldLocalPath - The original file path.
   *
   * @param newLocalPath - The new file path.
   *
   * @returns A promise which resolves with the new file contents model when
   *   the file is renamed.
   *
   * #### Notes
   * Uses the [Jupyter Notebook API](https://petstore.swagger.io/?url=https://raw.githubusercontent.com/jupyter-server/jupyter_server/main/jupyter_server/services/api/api.yaml#!/contents) and validates the response model.
   */
  async rename(
    oldLocalPath: string,
    newLocalPath: string
  ): Promise<Contents.IModel> {
    const settings = this.serverSettings;
    const url = this._getUrl(oldLocalPath);
    const init = {
      method: 'PATCH',
      body: JSON.stringify({ path: newLocalPath })
    };
    const response = await ServerConnection.makeRequest(url, init, settings);
    if (response.status !== 200) {
      const err = await ServerConnection.ResponseError.create(response);
      throw err;
    }
    const data = await response.json();
    Private.validateContentsModel(data);
    this._fileChanged.emit({
      type: 'rename',
      oldValue: { path: oldLocalPath },
      newValue: data
    });
    return data;
  }

  /**
   * Save a file.
   *
   * @param localPath - The desired file path.
   *
   * @param options - Optional overrides to the model.
   *
   * @returns A promise which resolves with the file content model when the
   *   file is saved.
   *
   * #### Notes
   * Ensure that `model.content` is populated for the file.
   *
   * Uses the [Jupyter Notebook API](https://petstore.swagger.io/?url=https://raw.githubusercontent.com/jupyter-server/jupyter_server/main/jupyter_server/services/api/api.yaml#!/contents) and validates the response model.
   */
  async save(
    localPath: string,
    options: Partial<Contents.IModel> = {}
  ): Promise<Contents.IModel> {
    const settings = this.serverSettings;
    const url = this._getUrl(localPath);
    const init = {
      method: 'PUT',
      body: JSON.stringify(options)
    };
    const response = await ServerConnection.makeRequest(url, init, settings);
    // will return 200 for an existing file and 201 for a new file
    if (response.status !== 200 && response.status !== 201) {
      const err = await ServerConnection.ResponseError.create(response);
      throw err;
    }
    const data = await response.json();
    Private.validateContentsModel(data);
    this._fileChanged.emit({
      type: 'save',
      oldValue: null,
      newValue: data
    });
    return data;
  }

  /**
   * Copy a file into a given directory.
   *
   * @param localPath - The original file path.
   *
   * @param toDir - The destination directory path.
   *
   * @returns A promise which resolves with the new contents model when the
   *  file is copied.
   *
   * #### Notes
   * The server will select the name of the copied file.
   *
   * Uses the [Jupyter Notebook API](https://petstore.swagger.io/?url=https://raw.githubusercontent.com/jupyter-server/jupyter_server/main/jupyter_server/services/api/api.yaml#!/contents) and validates the response model.
   */
  async copy(fromFile: string, toDir: string): Promise<Contents.IModel> {
    const settings = this.serverSettings;
    const url = this._getUrl(toDir);
    const init = {
      method: 'POST',
      body: JSON.stringify({ copy_from: fromFile })
    };
    const response = await ServerConnection.makeRequest(url, init, settings);
    if (response.status !== 201) {
      const err = await ServerConnection.ResponseError.create(response);
      throw err;
    }
    const data = await response.json();
    Private.validateContentsModel(data);
    this._fileChanged.emit({
      type: 'new',
      oldValue: null,
      newValue: data
    });
    return data;
  }

  /**
   * Create a checkpoint for a file.
   *
   * @param localPath - The path of the file.
   *
   * @returns A promise which resolves with the new checkpoint model when the
   *   checkpoint is created.
   *
   * #### Notes
   * Uses the [Jupyter Notebook API](https://petstore.swagger.io/?url=https://raw.githubusercontent.com/jupyter-server/jupyter_server/main/jupyter_server/services/api/api.yaml#!/contents) and validates the response model.
   */
  async createCheckpoint(
    localPath: string
  ): Promise<Contents.ICheckpointModel> {
    const url = this._getUrl(localPath, 'checkpoints');
    const init = { method: 'POST' };
    const response = await ServerConnection.makeRequest(
      url,
      init,
      this.serverSettings
    );
    if (response.status !== 201) {
      const err = await ServerConnection.ResponseError.create(response);
      throw err;
    }
    const data = await response.json();
    Private.validateCheckpointModel(data);
    return data;
  }

  /**
   * List available checkpoints for a file.
   *
   * @param localPath - The path of the file.
   *
   * @returns A promise which resolves with a list of checkpoint models for
   *    the file.
   *
   * #### Notes
   * Uses the [Jupyter Notebook API](https://petstore.swagger.io/?url=https://raw.githubusercontent.com/jupyter-server/jupyter_server/main/jupyter_server/services/api/api.yaml#!/contents) and validates the response model.
   */
  async listCheckpoints(
    localPath: string
  ): Promise<Contents.ICheckpointModel[]> {
    const url = this._getUrl(localPath, 'checkpoints');
    const response = await ServerConnection.makeRequest(
      url,
      {},
      this.serverSettings
    );
    if (response.status !== 200) {
      const err = await ServerConnection.ResponseError.create(response);
      throw err;
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error('Invalid Checkpoint list');
    }
    for (let i = 0; i < data.length; i++) {
      Private.validateCheckpointModel(data[i]);
    }
    return data;
  }

  /**
   * Restore a file to a known checkpoint state.
   *
   * @param localPath - The path of the file.
   *
   * @param checkpointID - The id of the checkpoint to restore.
   *
   * @returns A promise which resolves when the checkpoint is restored.
   *
   * #### Notes
   * Uses the [Jupyter Notebook API](https://petstore.swagger.io/?url=https://raw.githubusercontent.com/jupyter-server/jupyter_server/main/jupyter_server/services/api/api.yaml#!/contents).
   */
  async restoreCheckpoint(
    localPath: string,
    checkpointID: string
  ): Promise<void> {
    const url = this._getUrl(localPath, 'checkpoints', checkpointID);
    const init = { method: 'POST' };
    const response = await ServerConnection.makeRequest(
      url,
      init,
      this.serverSettings
    );
    if (response.status !== 204) {
      const err = await ServerConnection.ResponseError.create(response);
      throw err;
    }
  }

  /**
   * Delete a checkpoint for a file.
   *
   * @param localPath - The path of the file.
   *
   * @param checkpointID - The id of the checkpoint to delete.
   *
   * @returns A promise which resolves when the checkpoint is deleted.
   *
   * #### Notes
   * Uses the [Jupyter Notebook API](https://petstore.swagger.io/?url=https://raw.githubusercontent.com/jupyter-server/jupyter_server/main/jupyter_server/services/api/api.yaml#!/contents).
   */
  async deleteCheckpoint(
    localPath: string,
    checkpointID: string
  ): Promise<void> {
    const url = this._getUrl(localPath, 'checkpoints', checkpointID);
    const init = { method: 'DELETE' };
    const response = await ServerConnection.makeRequest(
      url,
      init,
      this.serverSettings
    );
    if (response.status !== 204) {
      const err = await ServerConnection.ResponseError.create(response);
      throw err;
    }
  }

  /**
   * Get a REST url for a file given a path.
   */
  private _getUrl(...args: string[]): string {
    const parts = args.map(path => URLExt.encodeParts(path));
    const baseUrl = this.serverSettings.baseUrl;
    if (!baseUrl) {
      throw new Error('Jupyter server URL not set');
    }
    return URLExt.join(baseUrl, this._apiEndpoint, ...parts);
  }

  private _apiEndpoint: string;
  private _isDisposed = false;
  private _fileChanged = new Signal<this, Contents.IChangedArgs>(this);
}

/**
 * A namespace for module private data.
 */
namespace Private {
  /**
   * Normalize a file extension to be of the type `'.foo'`.
   *
   * Adds a leading dot if not present and converts to lower case.
   */
  export function normalizeExtension(extension: string): string {
    if (extension.length > 0 && extension.indexOf('.') !== 0) {
      extension = `.${extension}`;
    }
    return extension;
  }

  /**
   * Validate a property as being on an object, and optionally
   * of a given type and among a given set of values.
   */
  export function validateProperty(
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    object: any,
    name: string,
    typeName?: string,
    values: any[] = []
  ): void {
    if (!object.hasOwnProperty(name)) {
      throw Error(`Missing property '${name}'`);
    }
    const value = object[name];
  
    if (typeName !== void 0) {
      let valid = true;
      switch (typeName) {
        case 'array':
          valid = Array.isArray(value);
          break;
        case 'object':
          valid = typeof value !== 'undefined';
          break;
        default:
          valid = typeof value === typeName;
      }
      if (!valid) {
        throw new Error(`Property '${name}' is not of type '${typeName}'`);
      }
  
      if (values.length > 0) {
        let valid = true;
        switch (typeName) {
          case 'string':
          case 'number':
          case 'boolean':
            valid = values.includes(value);
            break;
          default:
            valid = values.findIndex(v => v === value) >= 0;
            break;
        }
        if (!valid) {
          throw new Error(
            `Property '${name}' is not one of the valid values ${JSON.stringify(
              values
            )}`
          );
        }
      }
    }
  }
  
  export function validateContentsModel(
    model: Contents.IModel
  ): asserts model is Contents.IModel {
    validateProperty(model, 'name', 'string');
    validateProperty(model, 'path', 'string');
    validateProperty(model, 'type', 'string');
    validateProperty(model, 'created', 'string');
    validateProperty(model, 'last_modified', 'string');
    validateProperty(model, 'mimetype', 'object');
    validateProperty(model, 'content', 'object');
    validateProperty(model, 'format', 'object');
  }
  
  /**
   * Validate an `Contents.ICheckpointModel` object.
   */
  export function validateCheckpointModel(
    model: Contents.ICheckpointModel
  ): asserts model is Contents.ICheckpointModel {
    validateProperty(model, 'id', 'string');
    validateProperty(model, 'last_modified', 'string');
  }
}
