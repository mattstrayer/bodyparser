/*
* @adonisjs/bodyparser
*
* (c) Harminder Virk <virk@adonisjs.com>
*
* For the full copyright and license information, please view the LICENSE
* file that was distributed with this source code.
*/

/// <reference path="../../adonis-typings/bodyparser.ts" />

import bytes from 'bytes'
import multiparty from 'multiparty'
import { Exception } from '@poppinss/utils'
import { RequestContract } from '@ioc:Adonis/Core/Request'

import {
  MultipartContract,
  PartHandlerContract,
  MultipartStream,
} from '@ioc:Adonis/Addons/BodyParser'

import { FormFields } from '../FormFields'
import { PartHandler } from './PartHandler'

/**
 * Multipart class offers a low level API to interact the incoming
 * HTTP request data as a stream. This makes it super easy to
 * write files to s3 without saving them to the disk first.
 */
export class Multipart implements MultipartContract {
  /**
   * The registered handlers to handle the file uploads
   */
  private handlers: {
    [key: string]: {
      handler: PartHandlerContract,
      options: Parameters<MultipartContract['onFile']>[1],
    },
  } = {}

  /**
   * Collected fields from the multipart stream
   */
  private fields = new FormFields()

  /**
   * Collected files from the multipart stream. Files are only collected
   * when there is an attached listener for a given file.
   */
  private files = new FormFields()

  /**
   * We track the finishing of `this.onFile` async handlers
   * to make sure that `process` promise resolves for all
   * handlers to finish.
   */
  private pendingHandlers = 0

  /**
   * The reference to underlying multiparty form
   */
  private form: multiparty.Form

  /**
   * Total size limit of the multipart stream. If it goes beyond
   * this limit, then an exception will be raised.
   */
  private upperLimit?: number

  private processedBytes: number = 0

  /**
   * Consumed is set to true when `process` is called. Calling
   * process multiple times is not possible and hence this
   * boolean must be checked first
   */
  public consumed = false

  constructor (
    private request: RequestContract,
    private config: Parameters<MultipartContract['process']>[0] = {},
  ) {}

  /**
   * Returns a boolean telling whether all streams have been
   * consumed along with all handlers execution
   */
  private isClosed (): boolean {
    return this.form['flushing'] <= 0 && this.pendingHandlers <= 0
  }

  /**
   * Removes array like expression from the part name to
   * find the handler
   */
  private getHandlerName (name: string): string {
    return name.replace(/\[\d*\]/, '')
  }

  /**
   * Validates and returns an error when upper limit is defined and
   * processed bytes is over the upper limit
   */
  private validateProcessedBytes (chunkLength: number) {
    if (!this.upperLimit) {
      return
    }

    this.processedBytes += chunkLength
    if (this.processedBytes > this.upperLimit) {
      return new Exception('request entity too large', 413, 'E_REQUEST_ENTITY_TOO_LARGE')
    }
  }

  /**
   * Handles a given part by invoking it's handler or
   * by resuming the part, if there is no defined
   * handler
   */
  private async handlePart (part: MultipartStream) {
    /**
     * Skip parts with empty names. This is a use case of bad client
     * or intentional attempt to break the server
     */
    if (!part.name) {
      part.resume()
      return
    }

    const name = this.getHandlerName(part.name)

    /**
     * Skip, if their is no handler to consume the part.
     */
    const handler = this.handlers[name] || this.handlers['*']
    if (!handler) {
      part.resume()
      return
    }

    this.pendingHandlers++

    const partHandler = new PartHandler(part, handler.options)

    try {
      const response = await handler.handler(part, (line) => {
        const lineLength = line.length

        /**
         * Keeping an eye on total bytes processed so far and shortcircuiting
         * request when more than expected bytes have been received.
         */
        const error = this.validateProcessedBytes(lineLength)
        if (error) {
          /**
           * Shortcircuit current part
           */
          part.emit('error', error)

          /**
           * Shortcircuit the entire stream
           */
          this.abort(error)
        }

        partHandler.reportProgress(line, lineLength)
      })

      /**
       * Reporting success to the partHandler, which ends up on the
       * file instance
       */
      if (response) {
        partHandler.reportSuccess(response)
      }
    } catch (error) {
      partHandler.reportError(error)
    }

    /**
     * Pull the file from the `partHandler`. The file can also be `null` when
     * the part consumer doesn't report progress
     */
    const file = partHandler.getFile()
    if (file) {
      this.files.add(file.fieldName, file)
    }

    this.pendingHandlers--
  }

  /**
   * Record the fields inside multipart contract
   */
  private handleField (key: string, value: string) {
    if (!key) {
      return
    }

    const error = this.validateProcessedBytes(value.length)
    if (error) {
      this.abort(error)
    } else {
      this.fields.add(key, value)
    }
  }

  /**
   * Processes the user config and computes the `upperLimit` value from
   * it.
   */
  private processConfig (config?: Parameters<MultipartContract['process']>[0]) {
    this.config = Object.assign(this.config, config)

    /**
     * Getting bytes from the `config.limit` option, which can
     * also be a string
     */
    this.upperLimit = typeof (this.config!.limit) === 'string'
      ? bytes(this.config!.limit)
      : this.config!.limit
  }

  /**
   * Set files and fields on the request class
   */
  private cleanup () {
    this.request['__raw_files'] = this.files.get()
    this.request.setInitialBody(this.fields.get())
  }

  /**
   * Attach handler for a given file. To handle all files, you
   * can attach a wildcard handler.
   *
   * @example
   * ```ts
   * multipart.onFile('package', {}, async (stream) => {
   * })
   *
   * multipart.onFile('*', {}, async (stream) => {
   * })
   * ```
   */
  public onFile (
    name: string,
    options: Parameters<MultipartContract['onFile']>[1],
    handler: PartHandlerContract,
  ): this {
    this.handlers[name] = { handler, options }
    return this
  }

  /**
   * Abort request by emitting error
   */
  public abort (error: any): void {
    this.form.emit('error', error)
  }

  /**
   * Process the request by going all the file and field
   * streams.
   */
  public process (config?: Parameters<MultipartContract['process']>[0]): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.consumed) {
        reject(new Exception(
          'multipart stream has already been consumed',
          500,
          'E_RUNTIME_EXCEPTION',
        ))
        return
      }

      /**
       * Setting the flag to avoid multiple calls
       * to the `process` method
       */
      this.consumed = true
      this.processConfig(config)

      this.form = new multiparty.Form({ maxFields: this.config!.maxFields })

      /**
       * Raise error when form encounters an
       * error
       */
      this.form.on('error', (error: Error) => {
        if (error.message === 'maxFields 1 exceeded.') {
          reject(new Exception('Max fields limit exceeded', 413, 'E_REQUEST_ENTITY_TOO_LARGE'))
        } else {
          reject(error)
        }
      })

      /**
       * Process each part at a time and also resolve the
       * promise when all parts are consumed and processed
       * by their handlers
       */
      this.form.on('part', async (part: MultipartStream) => {
        await this.handlePart(part)

        /**
         * When a stream finishes before the handler, the close `event`
         * will not resolve the current Promise. So in that case, we
         * check and resolve from here
         */
        if (this.isClosed()) {
          this.cleanup()
          resolve()
        }
      })

      /**
       * Listen for fields
       */
      this.form.on('field', (key: string, value: any) => {
        try {
          this.handleField(key, value)
        } catch (error) {
          this.abort(error)
        }
      })

      /**
       * Resolve promise on close, when all internal
       * file handlers are done processing files
       */
      this.form.on('close', () => {
        if (this.isClosed()) {
          this.cleanup()
          resolve()
        }
      })

      this.form.parse(this.request.request)
    })
  }
}
