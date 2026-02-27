// src/store/index.ts
import { configureStore } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import storage from 'redux-persist/lib/storage'; // defaults to localStorage
import bracketsReducer from './bracketsSlice';

const persistConfig = {
  key: 'root',
  storage,
  whitelist: ['brackets'], // only persist brackets slice (includes outcomes & locked)
};

const persistedReducer = persistReducer(persistConfig, bracketsReducer);

export const store = configureStore({
  reducer: {
    brackets: persistedReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false, // important for redux-persist
    }),
});

// Create persistor
export const persistor = persistStore(store);

export default store;