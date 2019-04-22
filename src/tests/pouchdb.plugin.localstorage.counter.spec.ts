import { TestBed } from '@angular/core/testing';

import { NgxsModule, State, Store, Action } from '@ngxs/store';

import { NgxsPouchDbPluginModule, StorageOption, StorageEngine } from '../..';
import { StateContext } from '@ngxs/store';

describe('NgxsAsyncPouchDbPlugin LocalStorage', () => {
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

  @State<StateModel>({
    name: 'lazyLoaded',
    defaults: { count: 0 }
  })
  class LazyLoadedStore {}

  class LocalStorageEngine implements StorageEngine {
    get length() {
      return Object.keys(localStorage).length;
    }

    getItem(key: string): any {
      let val = localStorage.getItem(key);
      return val;
    }

    setItem(key: string, val: any) {
      localStorage.setItem(key, val);
    }

    removeItem(key: string) {
      localStorage.removeItem(key);
    }

    clear() {
      localStorage.clear();
    }

    key(index: number) {
      return Object.keys(localStorage)[index];
    }
  }

  beforeAll(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('should get initial data from localstorage', () => {
    localStorage.setItem('counter', JSON.stringify({ count: 100 }));

    TestBed.configureTestingModule({
      imports: [
        NgxsModule.forRoot([MyStore]),
        NgxsPouchDbPluginModule.forRoot(LocalStorageEngine, {
          storage: StorageOption.LocalStorage
        })
      ]
    });

    const store: Store = TestBed.get(Store);

    store
      .select((state: any) => state.counter)
      .subscribe((state: StateModel) => {
        expect(state.count).toBe(100);
        expect(localStorage.getItem('counter')).toBe(
          JSON.stringify({ count: 100 })
        );
      });
  });

  it('should save data to localstorage', done => {
    localStorage.setItem('counter', JSON.stringify({ count: 100 }));

    TestBed.configureTestingModule({
      imports: [
        NgxsModule.forRoot([MyStore]),
        NgxsPouchDbPluginModule.forRoot(LocalStorageEngine, {
          storage: StorageOption.LocalStorage
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
      .select((state: any) => state.counter)
      .subscribe((state: StateModel) => {
        expect(state.count).toBe(105);
        expect(localStorage.getItem('counter')).toBe(
          JSON.stringify({ count: 105 })
        );
        done();
      });
  });
  
  describe('NotFound in localstorage', () => {
    it('should use default data if null retrieved from localstorage', () => {
      localStorage.setItem('counter', <any>null);

      @State<StateModel>({ name: 'counter', defaults: { count: 123 } })
      class TestStore {}

      TestBed.configureTestingModule({
        imports: [
          NgxsModule.forRoot([TestStore]), 
          NgxsPouchDbPluginModule.forRoot(LocalStorageEngine, {
            storage: StorageOption.LocalStorage
          })
        ]
      });

      const store = TestBed.get(Store);

      store
        .select((state: any) => state.counter)
        .subscribe((state: StateModel) => {
          expect(state.count).toBe(123);
        });
    });

    it('should use default data if undefined retrieved from localstorage', () => {
      localStorage.setItem('counter', <any>undefined);

      @State<StateModel>({ name: 'counter', defaults: { count: 123 } })
      class TestStore {}

      TestBed.configureTestingModule({
        imports: [
          NgxsModule.forRoot([TestStore]), 
          NgxsPouchDbPluginModule.forRoot(LocalStorageEngine, {
            storage: StorageOption.LocalStorage
          })
        ]
      });

      const store = TestBed.get(Store);

      store
        .select((state: any) => state.counter)
        .subscribe((state: StateModel) => {
          expect(state.count).toBe(123);
        });
    });

    it(`should use default data if the string 'undefined' retrieved from localstorage`, () => {
      localStorage.setItem('counter', 'undefined');

      @State<StateModel>({ name: 'counter', defaults: { count: 123 } })
      class TestStore {}

      TestBed.configureTestingModule({
        imports: [
          NgxsModule.forRoot([TestStore]), 
          NgxsPouchDbPluginModule.forRoot(LocalStorageEngine, {
            storage: StorageOption.LocalStorage
          })
        ]
      });

      const store = TestBed.get(Store);

      store
        .select((state: any) => state.counter)
        .subscribe((state: StateModel) => {
          expect(state.count).toBe(123);
        });
    });
  });

  it('should migrate global localstorage', () => {
    const data = JSON.stringify({ count: 100, version: 1 });
    localStorage.setItem('counter', data);

    TestBed.configureTestingModule({
      imports: [
        NgxsModule.forRoot([MyStore]),
        NgxsPouchDbPluginModule.forRoot(LocalStorageEngine, {
          storage: StorageOption.LocalStorage,
          migrations: [
            {
              version: 1,
              versionKey: 'counter.version',
              migrate: (state: any) => {
                state.counter = {
                  counts: state.counter.count,
                  version: 2
                };
                return state;
              }
            }
          ]
        })
      ]
    });

    const store: Store = TestBed.get(Store);

    store
      .select((state: any) => state.counter)
      .subscribe((state: StateModel) => {
        expect(localStorage.getItem('counter')).toBe(
          JSON.stringify({ counts: 100, version: 2 })
        );
      });
  });

  it('should migrate single localstorage', () => {
    const data = JSON.stringify({ count: 100, version: 1 });
    localStorage.setItem('counter', data);

    TestBed.configureTestingModule({
      imports: [
        NgxsModule.forRoot([MyStore]),
        NgxsPouchDbPluginModule.forRoot(LocalStorageEngine, {
          key: 'counter',
          storage: StorageOption.LocalStorage,
          migrations: [
            {
              version: 1,
              key: 'counter',
              versionKey: 'version',
              migrate: (state: any) => {
                state = {
                  counts: state.count,
                  version: 2
                };
                return state;
              }
            }
          ]
        })
      ]
    });

    const store: Store = TestBed.get(Store);

    store
      .select((state: any) => state.counter)
      .subscribe((state: StateModel) => {
        expect(localStorage.getItem('counter')).toBe(
          JSON.stringify({ counts: 100, version: 2 })
        );
      });
  });

  it('should merge unloaded data from feature with local storage', () => {
    localStorage.setItem('@@STATE', JSON.stringify({ counter: { count: 100 } }));

    TestBed.configureTestingModule({
      imports: [
        NgxsModule.forRoot([MyStore]),
        NgxsPouchDbPluginModule.forRoot(LocalStorageEngine, {
          storage: StorageOption.LocalStorage
        }),
        NgxsModule.forFeature([LazyLoadedStore])
      ]
    });

    const store: Store = TestBed.get(Store);

    store
      .select((state: any) => state)
      .subscribe((state: { counter: StateModel; lazyLoaded: StateModel }) => {
        expect(state.lazyLoaded).toBeDefined();
      });
  });
});