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
import { concatMap, reduce, map, mergeMap, filter } from 'rxjs/operators';
import { Observable, of, from, zip } from 'rxjs';

@Injectable()
export class NgxsPouchDbPlugin implements NgxsPlugin {
  private _asyncEngine: AsyncStorageEngine;

  constructor(    
    @Inject(STORAGE_ENGINE) private _engine:  StorageEngine | AsyncStorageEngine,
    @Inject(NGXS_STORAGE_PLUGIN_OPTIONS) private _options: NgxsStoragePluginOptions) {
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

    let masterMigrationStrategy = undefined
    let initKeyVal$ = of(undefined);
    let initAction$: Observable<any> = of(state); 

    if (isInitAction) {

      initKeyVal$ = from(storeKeys).pipe(
        concatMap(key => {
          const keyVal$ = this._asyncEngine.getItem(key).pipe(
            map(val => {
              if(val) {
                try {
                  val = options.deserialize(val)
                } catch (e) {
                    console.error('Error ocurred while deserializing the store value, setting it to undefined.');
                    val = undefined;
                }
              }
              return [ key, val ]
            })
          );
          const migrationStrategy$ = keyVal$.pipe(
            map(([ key, val ]) => {
              if(!(val && options.migrations)) return undefined;
              
              return options.migrations.filter(strategy => {
                const versionMatch = 
                        strategy.version === getValue(val, strategy.versionKey || 'version');
                const keyMatch = strategy.key === key;
                return versionMatch && keyMatch
              })[0];
            })
          );
          return zip(keyVal$, migrationStrategy$).pipe(
            map(([ keyVal, strategy ]) => {
              return { key: key, keyVal: keyVal, strategy: strategy};
            })
          );
        })  
      );

      initAction$ = initKeyVal$.pipe(
        reduce((previousState, { _, keyVal: keyVal, strategy: strategy}) => {
          let [ key, val ] = keyVal;
          let nextState = previousState;
          if (val) { // if the val is defined and valid
            if(strategy) {
              val = strategy.migrate(val);
            }
            nextState = setValue(previousState, key, val);
          }
          return nextState;
        }, state),
        map(state => { // apply master migrations          
          masterMigrationStrategy = (function () {
            if(!options.migrations) return undefined;
      
            return options.migrations.filter(strategy => {
              const versionMatch = 
                      strategy.version === getValue(state, strategy.versionKey || 'version');
              const keyMatch = !strategy.key && isMaster;
              return versionMatch && keyMatch
            })[0];
          })();
 
          return masterMigrationStrategy ? masterMigrationStrategy.migrate(state) : state;
        })
      );     
    }
    
    const nextState$ = initAction$.pipe(
      concatMap(stateAfterInit => next(stateAfterInit, event))
    );

    // if (!isInitAction || (isInitAction && hasMigration)) [update storage] this._asyncEngine.setItem
    return nextState$.pipe(
      concatMap(nextState => from(storeKeys).pipe(
          mergeMap((key: string) => initKeyVal$.pipe(
              filter(result => !result || (result && key === result.keyVal[0])),
              mergeMap(result => {
                if(result && !result.strategy && !masterMigrationStrategy) return of(undefined);

                let val = getValue(nextState, key);
                return this._asyncEngine.setItem(key, options.serialize(val));
              })
            )
          )
        )
      )
    );
  }
}