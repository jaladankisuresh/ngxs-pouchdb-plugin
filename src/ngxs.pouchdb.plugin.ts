import { Inject, Injectable } from '@angular/core';
import {
  NgxsPlugin,
  setValue,
  getValue,
  InitState,
  UpdateState,
  actionMatcher,
  NgxsNextPluginFn
} from '@ngxs/store';

import {
  NgxsStoragePluginOptions,
  NGXS_STORAGE_PLUGIN_OPTIONS,
  STORAGE_ENGINE,
  StorageEngine,
  AsyncStorageEngine,
  AsyncStorageEngineProxy
} from './symbols';
import { tap, concatMap, reduce, map, mergeMap } from 'rxjs/operators';
import { Observable, of, from } from 'rxjs';

@Injectable()
export class NgxsPouchDbPlugin implements NgxsPlugin {
  private _asyncEngine: AsyncStorageEngine;

  constructor(    
    @Inject(STORAGE_ENGINE) private _engine:  StorageEngine | AsyncStorageEngine,
    @Inject(NGXS_STORAGE_PLUGIN_OPTIONS) private _options: NgxsStoragePluginOptions
  ) {
    if (typeof this._engine.length === 'function') {
      this._asyncEngine = <AsyncStorageEngine>this._engine;
    } else {
      this._asyncEngine = new AsyncStorageEngineProxy(<StorageEngine>this._engine);
    }
  }

  handle(state: any, event: any, next: NgxsNextPluginFn) {
    const options = this._options || <any>{};
    const matches = actionMatcher(event);
    const isInitAction = matches(InitState) || matches(UpdateState);
    const isMaster = options.key === '@@STATE';
    const storeKeys = isMaster ? Object.keys(state) : Array.isArray(options.key) ? options.key : [options.key]; 
    let hasMigration = false;
    let initAction: Observable<any> = of(state);

    if (isInitAction) {
      initAction = from(storeKeys).pipe(
        concatMap(key => this._asyncEngine.getItem(key).pipe(
            map(val => ({ key, val }))
          )
        ),
        reduce((previousState, { key, val }) => {
          let nextState = previousState;
          try {
            val = options.deserialize(val)
          } catch (e) {
              console.error('Error ocurred while deserializing the store value, setting it to undefined.');
              val = undefined;
          }

          if (val) { // if the val is defined and valid
              if (options.migrations) {
                  options.migrations.forEach(strategy => {
                      const versionMatch = 
                        strategy.version === getValue(val, strategy.versionKey || 'version');
                      const keyMatch = (!strategy.key && isMaster) || strategy.key === key;
                      if (versionMatch && keyMatch) {
                          val = strategy.migrate(val);
                          hasMigration = true;
                      }
                  });
              }
              nextState = setValue(previousState, key, val);
          }
          return nextState;
        }, state),
      );
    }

    const nextState$ = initAction.pipe(
      concatMap(stateAfterInit => next(stateAfterInit, event))
    );
    if(isInitAction && !hasMigration) return nextState$;

    return nextState$.pipe(
      concatMap(nextState => from(storeKeys).pipe(
          tap(_ => console.log('inside initAction Pipe')),
          mergeMap((key: string) => {
            let val = getValue(nextState, key);
            console.log('getValue $:', val)
            return this._asyncEngine.setItem(key, options.serialize(val))
          })
        )
      )
    );
  }
}
