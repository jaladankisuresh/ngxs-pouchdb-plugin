import { TestBed } from '@angular/core/testing';

import { NgxsModule, State, Store, Action, NgxsOnInit } from '@ngxs/store';

import { NgxsPouchDbPluginModule, StorageOption, StorageEngine } from '../..';
import { StateContext } from '@ngxs/store';
import { AsyncStorageEngine, STORAGE_ENGINE } from 'src/symbols';
import { Observable, from, of, zip, throwError, merge  } from 'rxjs';
import { DB_REF, localDB } from 'src/providers/db.provider';
import { Inject } from '@angular/core';
import { tap, first, catchError, filter, mergeMap } from 'rxjs/operators';

describe('NgxsAsyncPouchDbPlugin', () => {
  class Increment {
    static type = 'INCREMENT';
  }

  class Decrement {
    static type = 'DECREMENT';
  }

  interface StateModel {
    count: number;
  }

  @State<StateModel>({
    name: 'counter',
    defaults: { count: 0 }
  })
  class MyStore {
    @Action(Increment)
    increment({ getState, setState }: StateContext<StateModel>) {
      setState({
        count: Number(getState().count) + 1
      });
    }

    @Action(Decrement)
    decrement({ getState, setState }: StateContext<StateModel>) {
      setState({
        count: Number(getState().count) - 1
      });
    }
  }

  class LocalStorageEngine implements StorageEngine {
    static storage: any = {
      counter: {
        count: 100
      }
    };

    get length() {
      return Object.keys(LocalStorageEngine.storage).length;
    }

    getItem(key: string) {
      return LocalStorageEngine.storage[key];
    }

    setItem(key: string, val: any) {
      LocalStorageEngine.storage[key] = val;
    }

    removeItem(key: string) {
      delete LocalStorageEngine.storage[key];
    }

    clear() {
      LocalStorageEngine.storage = {};
    }

    key(index: number) {
      return Object.keys(LocalStorageEngine.storage)[index];
    }
  }

  class PouchDbStorageEngine implements AsyncStorageEngine {
    constructor(@Inject(DB_REF) private db: any) { }

    public length(): Observable<number> {
      let pCount: Promise<number> = this.db.info().then(info => info.doc_count);
      return from(pCount);
    }

    public getItem(key): Observable<any> {
      const missingItem$ = from(this.db.get(key)).pipe(
        filter((doc: any) => doc.status === 404),
        catchError(_ => of(undefined))
      );
      const existingItem$ = from(this.db.get(key)).pipe(
        filter((doc: any) => doc.status !== 404)
      );
      return merge(missingItem$, existingItem$);
    }

    public setItem(key, val): Observable<any> {
      return this.getItem(key).pipe(
        mergeMap( doc => {
          if(doc === undefined) return throwError('Error while trying to set an undefined document');

          let data = stripMetaProperties(val);
          doc = {...doc, ...data};
          return from(this.db.put(doc));
        })
      );
    }

    public removeItem(key): void {
      this.getItem(key).subscribe( doc => {
        if(doc === undefined) return new Error('Error while trying to set an undefined document');
        
        doc._deleted = true;
        this.db.put(doc);
      });
    }

    public clear(): void { 
      this.db.destroy();
    }

    public key(val: number): Observable<string> {
        throw Error('Not Supported Exception');
    }
  }

  function stripMetaProperties(doc) {
    let data = Object.assign({}, doc);
    delete data._id;
    delete data._rev;
    delete data._conflicts;
    return data;
  }

  function clearDatabase(done) {
    localStorage.removeItem('counter');
    localDB.get('counter').then( doc => {
      localDB.remove(doc);
    }).then( res => done())
    .catch( err => {
      if(err.status !== 404) console.error(err);
      done()
    });
  }

  beforeAll(done => {
    clearDatabase(done);
  });
  afterEach(done => {
    clearDatabase(done);
  });

  it('should use a custom local storage engine', () => { 
    TestBed.configureTestingModule({
      imports: [
        NgxsModule.forRoot([MyStore]),
        NgxsPouchDbPluginModule.forRoot(LocalStorageEngine, {
          storage: StorageOption.LocalStorage,
          serialize(val) {
            return val;
          },
          deserialize(val) {
            return val;
          }
        })
      ]
    });

    const store: Store = TestBed.get(Store);

    store.dispatch(new Increment());
    store.dispatch(new Increment());
    store.dispatch(new Increment());
    store.dispatch(new Increment());
    store.dispatch(new Increment());

    store
      .select(state => state.counter).pipe(first())
      .subscribe((state: StateModel) => {
        expect(state.count).toBe(105);

        expect(LocalStorageEngine.storage['counter']).toEqual({ count: 105 });
      })
  });

  it('should get initial data from custom async storage using PouchDb as storage engine', done => {  
    @State<StateModel>({
      name: 'counter',
      defaults: { count: 0 }
    })
    class InitMyStore extends MyStore implements NgxsOnInit {
      ngxsOnInit() {
        const store = TestBed.get(Store);
        const pouchDbStorage = TestBed.get(STORAGE_ENGINE);
        const resultZip$ = zip(
          store.select(state => state.counter),
          pouchDbStorage.getItem('counter')
        );
        resultZip$.subscribe(result => {
          let state = <StateModel>result[0];
          let dbValue = result[1];
          dbValue = stripMetaProperties(dbValue);
          expect(state.count).toBe(100); 
          expect(dbValue).toEqual({ count: 100 });
          done();
        });
      }
    }
  
    let newDoc = {
      _id: 'counter',
      count: 100
    };  
    localDB.put(newDoc).then( res => {
      // handle response       
      TestBed.configureTestingModule({
        imports: [
          NgxsModule.forRoot([InitMyStore]),
          NgxsPouchDbPluginModule.forRoot(PouchDbStorageEngine, {
            key: 'counter',
            serialize(val) {
              return val;
            },
            deserialize(val) {
              return val;
            }
          })
        ]
      });      
      const store = TestBed.get(Store);
    }).catch( err => {
      console.error(err);
      done();
    });
  });

  it('should save data to custom async storage using PouchDb as storage engine', done => {
    @State<StateModel>({
      name: 'counter',
      defaults: { count: 0 }
    })
    class InitMyStore extends MyStore implements NgxsOnInit {
      ngxsOnInit() {
        const store = TestBed.get(Store);
        const pouchDbStorage = TestBed.get(STORAGE_ENGINE); 
        // 1st dispatch event
        store.dispatch(new Increment()).subscribe(_ => {
          // 2nd dispatch event
          store.dispatch(new Increment()).subscribe(_ => {  
            let resultZip$ = zip(
              store.select(state => state.counter),
              pouchDbStorage.getItem('counter')
            ); 
            resultZip$.subscribe(([state, dbValue]: [StateModel, any]) => {
              dbValue = stripMetaProperties(dbValue);
              expect(state.count).toBe(102); 
              expect(dbValue).toEqual({ count: 102 });
              done();
            });
          });
        });        
      }
    }
  
    let newDoc = {
      _id: 'counter',
      count: 100
    };  
    localDB.put(newDoc).then( res => {
      // handle response       
      TestBed.configureTestingModule({
        imports: [
          NgxsModule.forRoot([InitMyStore]),
          NgxsPouchDbPluginModule.forRoot(PouchDbStorageEngine, {
            key: 'counter',
            serialize(val) {
              return val;
            },
            deserialize(val) {
              return val;
            }
          })
        ]
      });      
      const store = TestBed.get(Store);
    }).catch( err => {
      console.error(err);
      done();
    });    
  }, 5000);
});