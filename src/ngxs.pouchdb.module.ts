import { NgModule, ModuleWithProviders, InjectionToken, TypeProvider } from '@angular/core';
import { NGXS_PLUGINS } from '@ngxs/store';

import { NgxsPouchDbPlugin } from './ngxs.pouchdb.plugin';
import {
  NgxsStoragePluginOptions,
  NGXS_STORAGE_PLUGIN_OPTIONS,
  StorageOption,
  STORAGE_ENGINE,
} from './symbols';
import { DB_REF, dbFactory } from './providers/db.provider';

export function storageOptionsFactory(options: NgxsStoragePluginOptions) {
  return {
    key: '@@STATE',
    storage: StorageOption.PouchDbStorage,
    serialize: JSON.stringify,
    deserialize: JSON.parse,
    ...options
  };
}

export const USER_OPTIONS = new InjectionToken('USER_OPTIONS');

@NgModule()
export class NgxsPouchDbPluginModule {
  static forRoot(engine: TypeProvider, options?: NgxsStoragePluginOptions): ModuleWithProviders {
    return {
      ngModule: NgxsPouchDbPluginModule,
      providers: [
        {
          provide: NGXS_PLUGINS,
          useClass: NgxsPouchDbPlugin,
          multi: true
        },
        {
          provide: USER_OPTIONS,
          useValue: options
        },
        {
          provide: NGXS_STORAGE_PLUGIN_OPTIONS,
          useFactory: storageOptionsFactory,
          deps: [USER_OPTIONS]
        },
        {
          provide: DB_REF,
          useFactory: dbFactory
        },
        {
          provide: STORAGE_ENGINE,
          useClass: engine
        }
      ]
    };
  }
}
