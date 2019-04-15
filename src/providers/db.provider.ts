import PouchDB from 'pouchdb';
import { InjectionToken } from '@angular/core';

export const DB_REF = new InjectionToken<PouchDB.Database>('DB_REF');
export const localDB = new PouchDB('localdb');
export function dbFactory() {
    return localDB;
}