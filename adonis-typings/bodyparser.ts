/*
* @adonisjs/bodyparser
*
* (c) Harminder Virk <virk@adonisjs.com>
*
* For the full copyright and license information, please view the LICENSE
* file that was distributed with this source code.
*/

declare module '@ioc:Adonis/Addons/BodyParser' {
  import { Readable } from 'stream'
  import { FileTypeResult } from 'file-type'

  /**
   * Readable stream along with some extra
   * data
   */
  type MultipartStream = Readable & {
    headers: any,
    name: string,
    filename: string,
    bytes: number,
  }

  /**
   * File validation options
   */
  export type FileValidationOptions = {
    size: string | number,
    types: string[],
    extnames: string[],
  }

  /**
   * Stream part handler
   */
  export type PartHandler = (part: MultipartStream) => Promise<void>

  /**
   * Field handler
   */
  export type FieldHandler = (key: string, value: string) => void

  /**
   * Qs module config
   */
  type QueryStringConfig = {
    depth?: number,
    allowPrototypes?: boolean,
    plainObjects?: boolean,
    parameterLimit?: number,
    arrayLimit?: number,
    ignoreQueryPrefix?: boolean,
    delimiter?: RegExp | string,
    allowDots?: boolean,
    charset?: string,
    charsetSentinel?: boolean,
    interpretNumericEntities?: boolean,
    parseArrays?: boolean,
    comma?: boolean,
  }

  /**
   * Base config used by all types
   */
  type BodyParserBaseConfig = {
    encoding: string,
    limit: string | number,
    types: string[],
  }

  /**
   * Body parser config for parsing JSON requests
   */
  type BodyParserJSONConfig = BodyParserBaseConfig & {
    strict: boolean,
  }

  /**
   * Parser config for parsing form data
   */
  type BodyParserFormConfig = BodyParserBaseConfig & {
    queryString: QueryStringConfig,
  }

  /**
   * Parser config for parsing raw body (untouched)
   */
  type BodyParserRawConfig = BodyParserBaseConfig & {
    queryString: QueryStringConfig,
  }

  /**
   * Parser config for parsing multipart requests
   */
  type BodyParserMultipartConfig = BodyParserBaseConfig & {
    autoProcess: boolean,
    maxFields: number,
    processManually: string[],
    tmpFileName (): string,
  }

  /**
   * Body parser config for all different types
   */
  export type BodyParserConfig = {
    whitelistedMethods: string[],
    json: BodyParserJSONConfig,
    form: BodyParserFormConfig,
    raw: BodyParserRawConfig,
    multipart: BodyParserMultipartConfig,
  }

  /**
   * Multipart class contract, since it's exposed on the
   * request object, we need the interface to extend
   * typings
   */
  interface MultipartContract {
    consumed: boolean,
    onFile (name: string, callback: PartHandler): this,
    onField (key: string, value: any): this,
    process (): Promise<void>,
  }

  /**
   * Error shape for file upload errors
   */
  export type FileUploadError = {
    fieldName: string,
    clientName: string,
    message: string,
    type: 'size' | 'extname',
  }

  /**
   * New file constructor options shape
   */
  type FileInputNode = {
    fieldName: string,
    fileName: string,
    tmpPath: string,
    bytes: number,
    headers: {
      [key: string]: string,
    },
    fileType?: FileTypeResult,
  }

  /**
   * Multipart file interface, used to loose coupling
   */
  export interface MultipartFileContract {
    isValid: boolean,
    clientName: string,
    fileName?: string,
    fieldName: string,
    tmpPath: string,
    size: number,
    type?: string,
    subtype?: string,
    status: 'pending' | 'moved' | 'error',
    extname: string,
    setValidationOptions (options: Partial<FileValidationOptions>): this,
    errors: FileUploadError[],
  }
}
